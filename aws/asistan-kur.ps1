<#
.SYNOPSIS
  Uygulamalardaki sohbeti gerçek bir dil modeline bağlar: her soruya yanıt.

.DESCRIPTION
  Sohbet bugün yalnızca yerel motorla, sınırlı sorulara yanıt veriyor. Bu betik
  POST /de/asistan ucunu kurar; soru, kullanıcının kendi sistem özetiyle
  birlikte dil modeline gider. Veri ya da cihaz olmasa da her konuda yanıt
  verir. Uç yanıt veremezse uygulamalar yine yerel motora düşer.

  -Saglayici:
    bedrock (varsayılan)  Amazon Bedrock, varsayılan model Amazon Nova Lite
                          (eu.amazon.nova-lite-v1:0). Soru başına ~0,03 cent.
                          API anahtarı yok, fatura AWS'ye gelir (maliyet-koruma
                          bütçesi kapsar). Web araması yok.
    anthropic             Claude (varsayılan claude-haiku-4-5, ~0,5 cent);
                          web araması yapabilir, Anthropic API anahtarı gerekir.

   1) Bedrock: Lambda'ya yalnızca bu modeli çağırma izni + küçük bir deneme
      çağrısı. Anthropic: API anahtarı sorulur (ekranda görünmez), ücretsiz
      bir çağrıyla doğrulanır, Lambda ortamına yazılır.
   2) Günlük soru sayacı — DynamoDB tablosu dennis-asistan-kota (+ Lambda izni)
   3) Lambda katmanı dennis-asistan — ekler\asistan\dennis_asistan.py
      (Anthropic'te SDK de, Lambda'nın Python sürümü/mimarisi için derlenir)
   4) Lambda ayarları — katman eklenir, zaman aşımı en az 30 sn
   5) Lambda yaması — /de/asistan yönlendirmesi (yedekli, sağlık kontrollü)
   6) Uygulamalar — VITE_ASISTAN_YOLU=/de/asistan ile derlenip yayınlanır

  Kişi başı ve toplam GÜNLÜK soru sınırı vardır; sayaç çalışmazsa asistan
  kapalı kalır (sınırsız çalışmaz).

  Tekrar çalıştırmak güvenlidir: değişmeyen hiçbir şey yeniden yapılmaz.

.EXAMPLE
  .\asistan-kur.ps1                                    # Amazon Nova Lite
  .\asistan-kur.ps1 -Model eu.amazon.nova-2-lite-v1:0  # Türkçesi daha iyi, ~0,25 cent
  .\asistan-kur.ps1 -Saglayici anthropic               # Claude Haiku 4.5 + web araması
  .\asistan-kur.ps1 -Saglayici anthropic -AnahtarYenile
#>
[CmdletBinding()]
param(
  [ValidateSet("bedrock", "anthropic")][string]$Saglayici = "bedrock",
  [string]$Model,
  [ValidateSet("low", "medium", "high")][string]$Efor = "low",
  [ValidateRange(1, 10000)][int]$KullaniciGunlukLimit = 20,
  [ValidateRange(1, 1000000)][int]$ToplamGunlukLimit = 2000,
  [ValidateRange(0, 10)][int]$WebArama = 3,
  [switch]$AnahtarYenile,
  [switch]$Onayla,
  [switch]$TarayiciAcma,
  [string]$ApiTaban,
  [string]$Bolge = "eu-central-1",
  [string]$Profil = $env:AWS_PROFILE
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"
if (-not $ApiTaban) { $ApiTaban = $API_TABAN_VARSAYILAN }

$SDK_SURUMU   = "1.9.0"                      # sınanan Anthropic Python SDK sürümü
$KATMAN       = "dennis-asistan"
$KOTA_TABLOSU = "dennis-asistan-kota"
$MODUL        = Join-Path (Join-Path (Join-Path $PSScriptRoot "ekler") "asistan") "dennis_asistan.py"
if (-not $Model) { $Model = @{ bedrock = "eu.amazon.nova-lite-v1:0"; anthropic = "claude-haiku-4-5" }[$Saglayici] }
$ortakParam = @{ Bolge = $Bolge }
if ($Profil) { $ortakParam.Profil = $Profil }

function PyCalistir([string[]]$argumanlar) {
  $eski = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $cikti = & $PYTHON[0] @(@($PYTHON | Select-Object -Skip 1) + $argumanlar) 2>&1
  $kod = $LASTEXITCODE; $ErrorActionPreference = $eski
  return @{ Kod = $kod; Cikti = ($cikti | Out-String).Trim() }
}

# ── Ön kontrol ────────────────────────────────────────────────────────────
Adim "Ön kontrol"
HesapDogrula | Out-Null
$PYTHON = PythonBul
if (-not $PYTHON -and $Saglayici -eq "anthropic") { throw "Python bulunamadı. python.org'dan Python 3 kurun (katman derlemesi için gerekli)." }
if (-not (Test-Path $MODUL)) { throw "Asistan modülü yok: $MODUL" }
$yap = Cagir lambda get-function-configuration --function-name $LAMBDA
if ("$($yap.Runtime)" -notmatch '^python(3\.\d+)$') { throw "Lambda çalışma ortamı Python değil ($($yap.Runtime))." }
$pySurum = $Matches[1]
$mimari = if (@($yap.Architectures) -contains "arm64") { "arm64" } else { "x86_64" }
$platform = if ($mimari -eq "arm64") { "manylinux2014_aarch64" } else { "manylinux2014_x86_64" }
$anahtarVar = [bool]($yap.Environment -and $yap.Environment.Variables -and $yap.Environment.Variables.PSObject.Properties["ANTHROPIC_API_KEY"])
Tamam "Lambda: python$pySurum, $mimari, zaman aşımı $($yap.Timeout) sn, bellek $($yap.MemorySize) MB"

# Soru başına yaklaşık maliyet (USD; ~3000 girdi + ~400 çıktı token)
$soruBasi = switch -Wildcard ($Model) {
  "*nova-micro*" { 0.0002 } "*nova-lite*" { 0.0003 } "*nova-2-lite*" { 0.0025 }
  "claude-haiku*" { 0.007 } "claude-sonnet*" { 0.015 } "claude-opus*" { 0.03 } default { 0.01 }
}
if ($Model -like "*nova-2-lite*") { $soruBasi = 0.0025 }
$aylikEnFazla = [math]::Round($ToplamGunlukLimit * $soruBasi * 30, 1)
Write-Host "`nYapılacaklar:" -ForegroundColor White
if ($Saglayici -eq "bedrock") { Bilgi "1. Amazon Bedrock: Lambda'ya $Model çağırma izni + deneme çağrısı (anahtar gerekmez)" }
else { Bilgi ("1. Anthropic API anahtarı " + $(if ($anahtarVar -and -not $AnahtarYenile) { "(zaten tanımlı; değiştirmek için -AnahtarYenile)" } else { "sorulacak" })) }
Bilgi "2. Günlük soru sayacı: kişi başı $KullaniciGunlukLimit, toplam $ToplamGunlukLimit soru/gün"
Bilgi ("3. Lambda katmanı $KATMAN (" + $(if ($Saglayici -eq "anthropic") { "Anthropic SDK $SDK_SURUMU + " }) + "asistan modülü)")
if ($Saglayici -eq "bedrock") { Bilgi "4. Model $Model (web araması yok)" }
else { Bilgi ("4. Model $Model" + $(if ($Model -notlike "claude-haiku*") { ", efor $Efor" }) + ", web araması soru başına en fazla $WebArama") }
Bilgi "5. Lambda yaması (/de/asistan) ve iki uygulamanın yeniden yayını"
Bilgi "En kötü durumda (her gün sınır dolarsa) aylık ~$aylikEnFazla USD. Gerçek kullanım genelde çok daha az."
if (-not $Onayla) {
  $cevap = Read-Host "`nDevam edilsin mi? (E/H)"
  if ($cevap -notmatch '^[EeYy]') { Write-Host "İptal edildi."; exit 0 }
}

# ── 1) API anahtarı ───────────────────────────────────────────────────────
$yeniAnahtar = $null
$yerel = Join-Path ([IO.Path]::GetTempPath()) ("de-asistan-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
if ($Saglayici -eq "bedrock") {
  Adim "1/6 Amazon Bedrock ($Model)"
  # Çapraz bölge profili (eu./us./global.) hem profil hem temel model için izin ister
  $temel = $Model -replace '^(eu|us|apac|global|us-gov)\.', ''
  $pol = JsonDosyasi @{ Version = "2012-10-17"; Statement = @(@{ Effect = "Allow"
    Action = @("bedrock:InvokeModel")
    Resource = @("arn:aws:bedrock:*:${HESAP}:inference-profile/$Model", "arn:aws:bedrock:*::foundation-model/$temel") }) }
  Cagir iam put-role-policy --role-name $LAMBDA_ROLU --policy-name AsistanBedrock --policy-document "file://$pol" | Out-Null
  Tamam "Lambda yalnızca bu modeli çağırabilir (AsistanBedrock)"
  $m = JsonDosyasi @(@{ role = "user"; content = @(@{ text = "Merhaba! Tek kelimeyle yanıt ver." }) })
  try {
    $d = Cagir bedrock-runtime converse --model-id $Model --messages "file://$m" --inference-config "maxTokens=20"
    Tamam ("deneme yanıtı: " + (("$($d.output.message.content[0].text)" -replace '\s+', ' ').Trim()))
  } catch {
    $h = $_.Exception.Message
    if ($h -match "don't have access|AccessDenied") {
      throw "Bu hesabın $Model modeline erişimi yok. AWS konsolu > Amazon Bedrock > Model access (bölge: $Bolge) bölümünden Amazon Nova modellerini açın, sonra betiği tekrar çalıştırın."
    }
    if ($h -match 'Operation not allowed') {
      # Yeni hesaplarda AWS'nin otomatik kısıtı (CloudFront'taki "must be verified" ile aynı); model/izin sorunu değil
      Uyari "AWS bu hesapta Bedrock'u henüz açmamış (yeni hesap kısıtı; model ya da izin sorunu değil)."
      Uyari "Çözüm: AWS Support > Create case > Account and billing > 'Account Activation / Verification'"
      Uyari "konusuyla hesap doğrulaması isteyin (CloudFront talebine ekleyebilirsiniz). Açılınca betiği tekrar çalıştırın."
      Uyari "O zamana kadar: .\asistan-kur.ps1 -Saglayici anthropic -WebArama 0   (Claude Haiku, ~0,5 cent/soru)"
      throw "Bedrock bu hesapta henüz kullanılamıyor (Operation not allowed)."
    }
    if ($h -match 'model identifier is invalid') { throw "Model kimliği geçersiz ya da bu bölgede yok: $Model ($h)" }
    throw
  }
} elseif (-not $anahtarVar -or $AnahtarYenile) {
  Adim "1/6 Anthropic API anahtarı"
  Bilgi "console.anthropic.com > API Keys'ten bir anahtar oluşturun (sk-ant- ile başlar)."
  Bilgi "Aylık harcama tavanını da oradan koyun: Settings > Limits."
  if ($env:ANTHROPIC_API_KEY) {
    # Bu bilgisayarın ortamında zaten tanımlıysa o kullanılır (ör. ant/SDK kurulumu)
    $yeniAnahtar = $env:ANTHROPIC_API_KEY.Trim()
    Bilgi "bu bilgisayardaki ANTHROPIC_API_KEY kullanılıyor"
  } else {
    $guvenli = Read-Host "  API anahtarı (ekranda görünmez)" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($guvenli)
    try { $yeniAnahtar = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  }
  if ($yeniAnahtar -notmatch '^sk-ant-') { throw "Bu bir Anthropic API anahtarına benzemiyor (sk-ant- ile başlamalı)." }

  # Ücretsiz doğrulama: model bilgisini okumak anahtarı ve modele erişimi sınar
  Bilgi "anahtar doğrulanıyor (ücretsiz çağrı)..."
  $r = PyCalistir @("-m", "pip", "install", "anthropic==$SDK_SURUMU", "--target", (Join-Path $yerel "yerel"),
                    "--quiet", "--disable-pip-version-check", "--no-warn-script-location")
  if ($r.Kod -ne 0) { throw "Anthropic SDK yerel olarak kurulamadı: $($r.Cikti)" }
  $betik = Join-Path $yerel "denetle.py"
  [IO.File]::WriteAllText($betik, @'
import os, sys
sys.path.insert(0, os.environ["DE_YOL"])
import anthropic
try:
    anthropic.Anthropic(api_key=os.environ["DE_ANAHTAR"], max_retries=1, timeout=20).models.retrieve(os.environ["DE_MODEL"])
except anthropic.AuthenticationError:
    sys.exit(2)
except anthropic.NotFoundError:
    sys.exit(3)
except anthropic.APIConnectionError:
    sys.exit(5)
except anthropic.APIStatusError as e:
    print(e.status_code)
    sys.exit(4)
'@, (New-Object Text.UTF8Encoding($false)))
  $env:DE_YOL = Join-Path $yerel "yerel"; $env:DE_ANAHTAR = $yeniAnahtar; $env:DE_MODEL = $Model
  try { $r = PyCalistir @($betik) }
  finally { Remove-Item Env:DE_ANAHTAR, Env:DE_YOL, Env:DE_MODEL -ErrorAction SilentlyContinue }
  switch ($r.Kod) {
    0 { Tamam "anahtar geçerli, $Model erişilebilir" }
    2 { throw "API anahtarı geçersiz." }
    3 { throw "$Model bu anahtarla kullanılamıyor (-Model ile başka model deneyin)." }
    5 { throw "api.anthropic.com'a bağlanılamadı; internet bağlantısını kontrol edin." }
    default { throw "Anahtar doğrulanamadı: $($r.Cikti)" }
  }
} else { Adim "1/6 Anthropic API anahtarı"; Tamam "Lambda'da tanımlı (değer gösterilmez)" }

# ── 2) Günlük sayaç tablosu + izin ────────────────────────────────────────
Adim "2/6 Günlük soru sayacı ($KOTA_TABLOSU)"
if (Dene dynamodb describe-table --table-name $KOTA_TABLOSU) { Tamam "tablo mevcut" }
else {
  Cagir dynamodb create-table --table-name $KOTA_TABLOSU --billing-mode PAY_PER_REQUEST `
    --attribute-definitions "AttributeName=anahtar,AttributeType=S" --key-schema "AttributeName=anahtar,KeyType=HASH" | Out-Null
  Cagir dynamodb wait table-exists --table-name $KOTA_TABLOSU | Out-Null
  Tamam "tablo oluşturuldu"
}
$ttl = (Cagir dynamodb describe-time-to-live --table-name $KOTA_TABLOSU).TimeToLiveDescription
if ($ttl.TimeToLiveStatus -notin @("ENABLED", "ENABLING")) {
  Cagir dynamodb update-time-to-live --table-name $KOTA_TABLOSU --time-to-live-specification "Enabled=true,AttributeName=silinme" | Out-Null
}
Tamam "eski sayaçlar 3 gün sonra kendiliğinden silinir"
if (Dene iam get-role-policy --role-name $LAMBDA_ROLU --policy-name AsistanKota) { Tamam "Lambda izni mevcut" }
else {
  $pol = JsonDosyasi @{ Version = "2012-10-17"; Statement = @(@{ Effect = "Allow"; Action = @("dynamodb:UpdateItem")
    Resource = "arn:aws:dynamodb:${Bolge}:${HESAP}:table/$KOTA_TABLOSU" }) }
  Cagir iam put-role-policy --role-name $LAMBDA_ROLU --policy-name AsistanKota --policy-document "file://$pol" | Out-Null
  Tamam "Lambda'ya yalnızca bu tabloya sayaç yazma izni verildi"
}

# ── 3) Lambda katmanı ─────────────────────────────────────────────────────
Adim "3/6 Lambda katmanı ($KATMAN)"
$ozet = (Get-FileHash $MODUL -Algorithm SHA256).Hash.Substring(0, 12).ToLower()
$imza = if ($Saglayici -eq "anthropic") { "sdk=$SDK_SURUMU modul=$ozet py=$pySurum $mimari" } else { "bedrock modul=$ozet" }
$katmanArn = $null
$son = @((Dene lambda list-layer-versions --layer-name $KATMAN).LayerVersions) | Select-Object -First 1
if ($son -and $son.Description -eq $imza) { $katmanArn = $son.LayerVersionArn; Tamam "güncel: sürüm $($son.Version)" }
else {
  $kat = Join-Path $yerel "katman"; $py = Join-Path $kat "python"
  New-Item -ItemType Directory -Force -Path $py | Out-Null
  if ($Saglayici -eq "anthropic") {
    Bilgi "Anthropic SDK $SDK_SURUMU derleniyor (python$pySurum, $platform)..."
    $r = PyCalistir @("-m", "pip", "install", "anthropic==$SDK_SURUMU", "--target", $py, "--platform", $platform,
                      "--implementation", "cp", "--python-version", $pySurum, "--only-binary=:all:",
                      "--no-compile", "--quiet", "--disable-pip-version-check", "--no-warn-script-location")
    if ($r.Kod -ne 0) { throw "SDK derlenemedi: $($r.Cikti)" }
    Remove-Item (Join-Path $py "bin") -Recurse -Force -ErrorAction SilentlyContinue
  }  # Bedrock: Lambda'daki boto3 yeter, katmanda yalnızca modül
  Copy-Item $MODUL $py
  $zip = Join-Path $yerel "katman.zip"
  ZipOlustur $kat $zip
  Bilgi ("katman boyutu: {0:N1} MB" -f ((Get-Item $zip).Length / 1MB))
  $yeni = Cagir lambda publish-layer-version --layer-name $KATMAN --description $imza --zip-file "fileb://$zip" `
    --compatible-runtimes $yap.Runtime --compatible-architectures $mimari
  $katmanArn = $yeni.LayerVersionArn
  Tamam "yayımlandı: sürüm $($yeni.Version)"
}

# ── 4) Lambda ayarları ────────────────────────────────────────────────────
Adim "4/6 Lambda ayarları"
$katmanlar = @(@($yap.Layers | ForEach-Object { $_.Arn }) | Where-Object { $_ -and $_ -notmatch ":layer:${KATMAN}:" }) + $katmanArn
$mevcutKatmanlar = @($yap.Layers | ForEach-Object { $_.Arn })
$arg = @()
if ((@($mevcutKatmanlar) -join ",") -ne ($katmanlar -join ",")) { $arg += @("--layers") + $katmanlar }
if ([int]$yap.Timeout -lt 30) { $arg += @("--timeout", "30") }   # API Gateway 29 sn'de keser
if ($arg.Count) {
  Cagir lambda wait function-updated --function-name $LAMBDA | Out-Null
  Cagir lambda update-function-configuration --function-name $LAMBDA @arg | Out-Null
  Cagir lambda wait function-updated --function-name $LAMBDA | Out-Null
  Tamam "katman eklendi$(if ($arg -contains '--timeout') { ', zaman aşımı 30 sn' })"
} else { Tamam "zaten güncel" }
if ([int]$yap.MemorySize -lt 256) { Uyari "Lambda belleği $($yap.MemorySize) MB; asistan yavaş kalırsa konsoldan 256 MB yapın." }
$ortam = @{
  ASISTAN_SAGLAYICI = $Saglayici; ASISTAN_MODEL = $Model; ASISTAN_EFFORT = $Efor; ASISTAN_KOTA_TABLOSU = $KOTA_TABLOSU
  ASISTAN_KULLANICI_LIMIT = "$KullaniciGunlukLimit"; ASISTAN_TOPLAM_LIMIT = "$ToplamGunlukLimit"; ASISTAN_WEB_ARAMA = "$WebArama"
}
if ($yeniAnahtar) { $ortam.ANTHROPIC_API_KEY = $yeniAnahtar }
if (LambdaOrtamGuncelle $ortam) { Tamam "ortam değişkenleri güncellendi (diğerleri korundu)" } else { Tamam "ortam değişkenleri güncel" }
$yeniAnahtar = $null
Remove-Item $yerel -Recurse -Force -ErrorAction SilentlyContinue

# ── 5-6) Lambda yaması + uygulamalar ──────────────────────────────────────
Adim "5/6 Uygulamalarda asistan ucu (VITE_ASISTAN_YOLU)"
foreach ($panel in "panel-musteri", "panel-uretici") {
  $kok = Join-Path (Split-Path $PSScriptRoot -Parent) $panel
  $envDosya = Join-Path $kok ".env"
  if (-not (Test-Path $envDosya)) { Copy-Item (Join-Path $kok ".env.example") $envDosya }
  $satirlar = @(Get-Content $envDosya -Encoding UTF8)
  if ($satirlar -match '^VITE_ASISTAN_YOLU=') { $satirlar = $satirlar -replace '^VITE_ASISTAN_YOLU=.*$', 'VITE_ASISTAN_YOLU=/de/asistan' }
  else { $satirlar += 'VITE_ASISTAN_YOLU=/de/asistan' }
  [IO.File]::WriteAllText($envDosya, (($satirlar -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
  Tamam "$panel/.env"
}

Adim "6/6 Lambda yaması ve yayın"
$p = @{ Atla = @("backend", "hesap"); Onayla = $true; ApiTaban = $ApiTaban } + $ortakParam
if ($TarayiciAcma) { $p.TarayiciAcma = $true }
& (Join-Path $PSScriptRoot "hepsini-kur.ps1") @p
if ($LASTEXITCODE) { throw "Lambda yaması ya da yayın başarısız; yukarıdaki özete bakın." }

Write-Host "`nAsistan hazır. Uygulamada Sohbet'ten her konuda soru sorabilirsiniz." -ForegroundColor Green
Bilgi 'Kullanım ve maliyet: CloudWatch günlüğünde {"asistan": ...} satırları (token ve arama sayısı).'
Bilgi "Sınırları değiştirmek: .\asistan-kur.ps1 -KullaniciGunlukLimit 50 -ToplamGunlukLimit 500"
exit 0
