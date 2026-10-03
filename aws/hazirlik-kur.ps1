<#
.SYNOPSIS
  Müşteriye vermeden önce: şifremi unuttum, hesap silme, KVKK onayı, veri
  yedeği ve anlık bildirimleri kurar. Tekrar çalıştırmak güvenlidir.

.DESCRIPTION
  1) Cognito   — mevcut kullanıcıların e-postası "doğrulandı" işaretlenir
                 (Cognito şifre sıfırlama kodunu yalnızca doğrulanmış e-postaya gönderir)
  2) Veri yedeği — DynamoDB tablolarında sürekli yedek (son 35 günün herhangi bir
                 saniyesine geri dönülebilir) ve yanlışlıkla silinmeye karşı koruma
  3) Bildirim tablosu — abonelikler ve cihaz durumları (dennis-bildirim)
  4) Bildirim Lambda'sı — dennis-bildirim (arm64, python3.12) + cryptography katmanı,
                 VAPID anahtarları (bir kez üretilir, sonra korunur)
  5) Zamanlama — 10 dakikada bir çalışır (EventBridge)
  6) Lambda yaması ve iki uygulamanın yeniden yayını (hepsini-kur.ps1):
                 /de/hesap/sil, /de/sifre/*, /de/bildirim/*, KVKK onayı

  Maliyet: bildirim fonksiyonu ayda ~4.300 kez kısa süre çalışır (ücretsiz katman
  içinde); sürekli yedek tablo boyutunun GB'ı başına ~0,20 USD/ay (birkaç MB'lık
  tablolarda birkaç kuruş).

.EXAMPLE
  .\hazirlik-kur.ps1
  .\hazirlik-kur.ps1 -IletisimEposta destek@dennisenerji.com
#>
[CmdletBinding()]
param(
  # Bildirim servislerine (Google, Apple, Mozilla) iletişim adresi olarak bildirilir
  [string]$IletisimEposta = "destek@dennisenerji.com",
  [ValidateRange(10, 1440)][int]$SuskunDakika = 30,
  [switch]$YayinAtla,
  [switch]$Onayla,
  [switch]$TarayiciAcma,
  [string]$ApiTaban,
  [string]$Bolge = "eu-central-1",
  [string]$Profil = $env:AWS_PROFILE
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"
if (-not $ApiTaban) { $ApiTaban = $API_TABAN_VARSAYILAN }
$KOK = Split-Path $PSScriptRoot -Parent
$ortakParam = @{ Bolge = $Bolge }
if ($Profil) { $ortakParam.Profil = $Profil }

$BILDIRIM_TABLOSU = "dennis-bildirim"
$BILDIRIM_FONK    = "dennis-bildirim"
$BILDIRIM_ROL     = "dennis-bildirim-rol"
$BILDIRIM_KATMAN  = "dennis-bildirim"
$KURAL            = "dennis-bildirim-10dk"
$KRIPTO_SURUMU    = "50.0.2"
$CIHAZ_TABLOSU    = "dennis-cihazlar"
$OLCUM_TABLOLARI  = "aku=dennis-aku-verileri,inverter=dennis-inverter-verileri"
# Yedeklenecek tablolar (DEVIR §2 + bildirim). Sayaç tablosu geçici veridir, yedeklenmez.
$YEDEK_TABLOLARI  = @("dennis-musteriler", "dennis-cihazlar", "dennis-eslesmeler", "dennis-garanti", "dennis-partiler",
                      "dennis-aku-verileri", "dennis-inverter-verileri", $BILDIRIM_TABLOSU)
$MODUL = Join-Path (Join-Path (Join-Path $PSScriptRoot "ekler") "bildirim") "dennis_bildirim.py"
$yerel = Join-Path ([IO.Path]::GetTempPath()) ("de-hazirlik-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Force -Path $yerel | Out-Null

function B64Url([byte[]]$b) { [Convert]::ToBase64String($b).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
function Doldur([byte[]]$b, [int]$n) {
  # .NET baştaki sıfır baytları atabilir; P-256 anahtar parçaları tam 32 bayt olmalı
  if ($b.Length -ge $n) { return , $b[($b.Length - $n)..($b.Length - 1)] }
  return , ([byte[]](@(0) * ($n - $b.Length)) + $b)
}

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
if (-not $PYTHON) { throw "Python bulunamadı. python.org'dan Python 3 kurun (bildirim katmanı ve Lambda yaması için gerekli)." }
if (-not (Test-Path $MODUL)) { throw "Bildirim modülü yok: $MODUL" }
$anaYap = Cagir lambda get-function-configuration --function-name $LAMBDA
Tamam "Lambda $LAMBDA ($($anaYap.Runtime))"
$mevcutTablolar = @((Cagir dynamodb list-tables).TableNames)
$bildirimYap = Dene lambda get-function-configuration --function-name $BILDIRIM_FONK

Write-Host "`nYapılacaklar:" -ForegroundColor White
Bilgi "1. Kullanıcıların e-postası doğrulandı işaretlenir (şifremi unuttum için)"
Bilgi "2. Sürekli yedek + silinme koruması: $((@($YEDEK_TABLOLARI | Where-Object { $mevcutTablolar -contains $_ -or $_ -eq $BILDIRIM_TABLOSU })) -join ', ')"
Bilgi "3. Bildirim tablosu $BILDIRIM_TABLOSU"
Bilgi "4. Bildirim fonksiyonu $BILDIRIM_FONK $(if ($bildirimYap) { '(güncellenir)' } else { '(yeni)' }); cihaz $SuskunDakika dk sessiz kalırsa bildirim"
Bilgi "5. 10 dakikada bir çalıştırma"
Bilgi $(if ($YayinAtla) { "6. Lambda yaması ve yayın ATLANACAK (-YayinAtla)" } else { "6. Lambda yaması (hesap silme, şifremi unuttum, KVKK, bildirim) ve iki uygulamanın yeniden yayını" })
if (-not $Onayla) {
  $c = Read-Host "`nDevam edilsin mi? (E/H)"
  if ($c -notmatch '^[EeYy]') { Write-Host "İptal edildi."; exit 1 }
}

try {
# ── 1) Cognito ────────────────────────────────────────────────────────────
Adim "1/6 Cognito: e-posta doğrulama ve hesap kurtarma"
$havuzBilgi = (Cagir cognito-idp describe-user-pool --user-pool-id $HAVUZ).UserPool
$kurtarma = @($havuzBilgi.AccountRecoverySetting.RecoveryMechanisms | Sort-Object Priority | ForEach-Object { $_.Name })
if ($kurtarma -and $kurtarma[0] -ne "verified_email") {
  Uyari "Hesap kurtarma önceliği '$($kurtarma -join ', ')'. SMS ücretlidir ve SNS ayarı ister; Cognito konsolunda"
  Uyari "Sign-in > Account recovery > 'Email only' seçin. (Telefon doğrulanmamışsa zaten e-postaya düşer.)"
} else { Tamam "şifre sıfırlama kodu e-postaya gider" }
if ("$($havuzBilgi.EmailConfiguration.EmailSendingAccount)" -ne "DEVELOPER") {
  Bilgi "Not: Cognito'nun kendi e-posta servisi günde 50 e-postayla sınırlı (İngilizce şablon)."
  Bilgi "Müşteri sayısı artınca Amazon SES bağlanmalı (Cognito > Messaging > Email)."
}
$kullanicilar = @((Cagir cognito-idp list-users --user-pool-id $HAVUZ).Users)
$isaretlenen = 0
foreach ($u in $kullanicilar) {
  $oz = @{}; foreach ($a in @($u.Attributes)) { $oz[$a.Name] = $a.Value }
  if ($oz["email"] -and "$($oz['email_verified'])" -ne "true") {
    Cagir cognito-idp admin-update-user-attributes --user-pool-id $HAVUZ --username $u.Username `
      --user-attributes "Name=email_verified,Value=true" | Out-Null
    $isaretlenen++
  }
}
Tamam "$($kullanicilar.Count) kullanıcı; $isaretlenen tanesinin e-postası doğrulandı işaretlendi"

# ── 2-3) Bildirim tablosu + yedek ─────────────────────────────────────────
Adim "2/6 Bildirim tablosu ($BILDIRIM_TABLOSU)"
if ($mevcutTablolar -contains $BILDIRIM_TABLOSU) { Tamam "tablo mevcut" }
else {
  Cagir dynamodb create-table --table-name $BILDIRIM_TABLOSU --billing-mode PAY_PER_REQUEST `
    --attribute-definitions "AttributeName=anahtar,AttributeType=S" --key-schema "AttributeName=anahtar,KeyType=HASH" | Out-Null
  Cagir dynamodb wait table-exists --table-name $BILDIRIM_TABLOSU | Out-Null
  $mevcutTablolar += $BILDIRIM_TABLOSU
  Tamam "tablo oluşturuldu"
}
# Ana Lambda: abonelik kaydı/silme ve hesap silmede gerekenler
$anaPolitika = JsonDosyasi @{ Version = "2012-10-17"; Statement = @(
  @{ Effect = "Allow"; Action = @("dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:Scan")
     Resource = "arn:aws:dynamodb:${Bolge}:${HESAP}:table/$BILDIRIM_TABLOSU" },
  @{ Effect = "Allow"; Action = @("dynamodb:Scan", "dynamodb:UpdateItem")
     Resource = "arn:aws:dynamodb:${Bolge}:${HESAP}:table/$CIHAZ_TABLOSU" },
  @{ Effect = "Allow"; Action = @("dynamodb:DeleteItem")
     Resource = "arn:aws:dynamodb:${Bolge}:${HESAP}:table/dennis-musteriler" },
  @{ Effect = "Allow"; Action = @("cognito-idp:AdminGetUser", "cognito-idp:AdminDeleteUser", "cognito-idp:AdminUpdateUserAttributes", "cognito-idp:InitiateAuth")
     Resource = "arn:aws:cognito-idp:${Bolge}:${HESAP}:userpool/$HAVUZ" }) }
Cagir iam put-role-policy --role-name $LAMBDA_ROLU --policy-name DennisHesapBildirim --policy-document "file://$anaPolitika" | Out-Null
if (LambdaOrtamGuncelle @{ BILDIRIM_TABLOSU = $BILDIRIM_TABLOSU }) { Tamam "ana Lambda'ya BILDIRIM_TABLOSU eklendi (diğer değişkenler korundu)" }
else { Tamam "ana Lambda ayarları güncel" }

Adim "3/6 Veri yedeği (sürekli yedek, 35 gün) ve silinme koruması"
foreach ($t in $YEDEK_TABLOLARI) {
  if ($mevcutTablolar -notcontains $t) { Bilgi "$t yok, atlandı"; continue }
  $y = (Cagir dynamodb describe-continuous-backups --table-name $t).ContinuousBackupsDescription
  $pitr = "$($y.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus)"
  if ($pitr -ne "ENABLED") {
    Cagir dynamodb update-continuous-backups --table-name $t `
      --point-in-time-recovery-specification "PointInTimeRecoveryEnabled=true" | Out-Null
  }
  $koruma = (Cagir dynamodb describe-table --table-name $t).Table.DeletionProtectionEnabled
  if (-not $koruma) { Cagir dynamodb update-table --table-name $t --deletion-protection-enabled | Out-Null }
  Tamam "$t$(if ($pitr -eq 'ENABLED' -and $koruma) { ': zaten açık' } else { ': yedek ve koruma açıldı' })"
}
Bilgi "Geri dönme: DynamoDB > Tables > (tablo) > Backups > Restore to point in time (yeni tabloya geri yükler)."

# ── 4) Bildirim Lambda'sı ─────────────────────────────────────────────────
Adim "4/6 Bildirim fonksiyonu ($BILDIRIM_FONK)"
# VAPID: bir kez üretilir. Değişirse tüm tarayıcı abonelikleri geçersiz olur.
$eskiOrtam = if ($bildirimYap -and $bildirimYap.Environment) { $bildirimYap.Environment.Variables } else { $null }
if ($eskiOrtam -and $eskiOrtam.VAPID_OZEL -and $eskiOrtam.VAPID_GENEL) {
  $vapidOzel = $eskiOrtam.VAPID_OZEL; $vapidGenel = $eskiOrtam.VAPID_GENEL
  Tamam "VAPID anahtarları korunuyor"
} else {
  try {
    $ec = [Security.Cryptography.ECDsa]::Create([Security.Cryptography.ECCurve+NamedCurves]::nistP256)
    $ecp = $ec.ExportParameters($true)
    $vapidOzel = B64Url (Doldur $ecp.D 32)
    $vapidGenel = B64Url ([byte[]](@(4) + (Doldur $ecp.Q.X 32) + (Doldur $ecp.Q.Y 32)))
    $ec.Dispose(); $ecp = $null
  } catch {
    # Eski .NET: anahtar Python + cryptography ile üretilir (yalnızca bu bilgisayarda, geçici klasöre)
    Bilgi ".NET anahtar üretemedi ($($_.Exception.Message)); Python ile üretiliyor..."
    $kripto = Join-Path $yerel "kripto"
    $r = PyCalistir @("-m", "pip", "install", "cryptography", "--target", $kripto, "--quiet", "--disable-pip-version-check", "--no-warn-script-location")
    if ($r.Kod -ne 0) { throw "VAPID anahtarı üretilemedi: $($r.Cikti)" }
    $betik = Join-Path $yerel "vapid.py"
    [IO.File]::WriteAllText($betik, @"
import sys, base64; sys.path.insert(0, sys.argv[1])
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
k = ec.generate_private_key(ec.SECP256R1()); b = lambda x: base64.urlsafe_b64encode(x).rstrip(b"=").decode()
print(b(k.private_numbers().private_value.to_bytes(32, "big")) + " " + b(k.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)))
"@)
    $r = PyCalistir @($betik, $kripto)
    if ($r.Kod -ne 0) { throw "VAPID anahtarı üretilemedi: $($r.Cikti)" }
    $vapidOzel, $vapidGenel = ($r.Cikti -split '\s+')[-2, -1]
  }
  if ($vapidOzel.Length -ne 43 -or $vapidGenel.Length -ne 87) { throw "VAPID anahtarı beklenen biçimde değil." }
  Tamam "VAPID anahtarları üretildi"
}

# Rol
$rol = Dene iam get-role --role-name $BILDIRIM_ROL
$yeniRol = -not $rol
if ($yeniRol) {
  $guven = JsonDosyasi @{ Version = "2012-10-17"; Statement = @(@{ Effect = "Allow"; Principal = @{ Service = "lambda.amazonaws.com" }; Action = "sts:AssumeRole" }) }
  $rol = Cagir iam create-role --role-name $BILDIRIM_ROL --assume-role-policy-document "file://$guven" `
    --description "Dennis anlik bildirim gonderici"
  Cagir iam attach-role-policy --role-name $BILDIRIM_ROL --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" | Out-Null
  Tamam "rol oluşturuldu"
}
$tabloArn = { param($t) "arn:aws:dynamodb:${Bolge}:${HESAP}:table/$t" }
$bilPolitika = JsonDosyasi @{ Version = "2012-10-17"; Statement = @(
  @{ Effect = "Allow"; Action = @("dynamodb:Scan", "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem")
     Resource = (& $tabloArn $BILDIRIM_TABLOSU) },
  @{ Effect = "Allow"; Action = @("dynamodb:Scan"); Resource = (& $tabloArn $CIHAZ_TABLOSU) },
  @{ Effect = "Allow"; Action = @("dynamodb:Query"); Resource = @((& $tabloArn "dennis-aku-verileri"), (& $tabloArn "dennis-inverter-verileri")) }) }
Cagir iam put-role-policy --role-name $BILDIRIM_ROL --policy-name BildirimTablolari --policy-document "file://$bilPolitika" | Out-Null
$rolArn = $rol.Role.Arn
if (-not $rolArn) { $rolArn = "arn:aws:iam::${HESAP}:role/$BILDIRIM_ROL" }

# Katman: cryptography (arm64, python3.12)
$imza = "cryptography=$KRIPTO_SURUMU py=3.12 arm64"
$son = @((Dene lambda list-layer-versions --layer-name $BILDIRIM_KATMAN).LayerVersions) | Select-Object -First 1
if ($son -and $son.Description -eq $imza) { $katmanArn = $son.LayerVersionArn; Tamam "katman güncel: sürüm $($son.Version)" }
else {
  $kat = Join-Path $yerel "katman"; $py = Join-Path $kat "python"
  New-Item -ItemType Directory -Force -Path $py | Out-Null
  Bilgi "cryptography $KRIPTO_SURUMU indiriliyor (python3.12, arm64)..."
  $r = PyCalistir @("-m", "pip", "install", "cryptography==$KRIPTO_SURUMU", "--target", $py, "--platform", "manylinux2014_aarch64",
                    "--implementation", "cp", "--python-version", "3.12", "--only-binary=:all:",
                    "--no-compile", "--quiet", "--disable-pip-version-check", "--no-warn-script-location")
  if ($r.Kod -ne 0) { throw "cryptography indirilemedi: $($r.Cikti)" }
  Remove-Item (Join-Path $py "bin") -Recurse -Force -ErrorAction SilentlyContinue
  $zip = Join-Path $yerel "katman.zip"
  ZipOlustur $kat $zip
  $yeni = Cagir lambda publish-layer-version --layer-name $BILDIRIM_KATMAN --description $imza --zip-file "fileb://$zip" `
    --compatible-runtimes python3.12 --compatible-architectures arm64
  $katmanArn = $yeni.LayerVersionArn
  Tamam "katman yayımlandı: sürüm $($yeni.Version)"
}

# Kod
$kodKlasor = Join-Path $yerel "kod"; New-Item -ItemType Directory -Force -Path $kodKlasor | Out-Null
Copy-Item $MODUL $kodKlasor
$kodZip = Join-Path $yerel "kod.zip"; ZipOlustur $kodKlasor $kodZip
$ozet = (Get-FileHash $MODUL -Algorithm SHA256).Hash.Substring(0, 12).ToLowerInvariant()
$ortam = JsonDosyasi @{ Variables = @{
  BILDIRIM_TABLOSU = $BILDIRIM_TABLOSU; CIHAZ_TABLOSU = $CIHAZ_TABLOSU; OLCUM_TABLOLARI = $OLCUM_TABLOLARI
  VAPID_OZEL = $vapidOzel; VAPID_GENEL = $vapidGenel; VAPID_KONU = "mailto:$IletisimEposta"; SUSKUN_DK = "$SuskunDakika" } }
$aciklama = "Dennis anlik bildirim modul=$ozet"
if (-not $bildirimYap) {
  # Yeni rol IAM'de birkaç saniyede yayılır; "cannot be assumed" hatasında beklenip yeniden denenir
  $fonk = $null
  foreach ($deneme in 1..6) {
    try {
      $fonk = Cagir lambda create-function --function-name $BILDIRIM_FONK --runtime python3.12 --architectures arm64 `
        --handler dennis_bildirim.lambda_handler --role $rolArn --zip-file "fileb://$kodZip" --timeout 120 --memory-size 256 `
        --layers $katmanArn --environment "file://$ortam" --description $aciklama
      break
    } catch {
      if ($deneme -lt 6 -and "$_" -match "assumed|InvalidParameterValue") { Bilgi "rol henüz hazır değil, bekleniyor..."; Start-Sleep -Seconds 10; continue }
      throw
    }
  }
  Cagir lambda wait function-active-v2 --function-name $BILDIRIM_FONK | Out-Null
  $fonkArn = $fonk.FunctionArn
  Tamam "fonksiyon oluşturuldu"
} else {
  if ("$($bildirimYap.Description)" -ne $aciklama) {
    Cagir lambda update-function-code --function-name $BILDIRIM_FONK --zip-file "fileb://$kodZip" | Out-Null
    Cagir lambda wait function-updated --function-name $BILDIRIM_FONK | Out-Null
  }
  Cagir lambda update-function-configuration --function-name $BILDIRIM_FONK --layers $katmanArn `
    --environment "file://$ortam" --description $aciklama --timeout 120 | Out-Null
  Cagir lambda wait function-updated --function-name $BILDIRIM_FONK | Out-Null
  $fonkArn = $bildirimYap.FunctionArn
  Tamam "fonksiyon güncellendi"
}
if (-not $fonkArn) { $fonkArn = "arn:aws:lambda:${Bolge}:${HESAP}:function:$BILDIRIM_FONK" }
$grup = "/aws/lambda/$BILDIRIM_FONK"
Dene logs create-log-group --log-group-name $grup | Out-Null
Dene logs put-retention-policy --log-group-name $grup --retention-in-days 30 | Out-Null

# ── 5) Zamanlama ──────────────────────────────────────────────────────────
Adim "5/6 Zamanlama (10 dakikada bir)"
$kuralBilgi = Cagir events put-rule --name $KURAL --schedule-expression "rate(10 minutes)" --state ENABLED `
  --description "Dennis anlik bildirimleri"
Dene lambda add-permission --function-name $BILDIRIM_FONK --statement-id "$KURAL" --action "lambda:InvokeFunction" `
  --principal events.amazonaws.com --source-arn $kuralBilgi.RuleArn | Out-Null
Cagir events put-targets --rule $KURAL --targets "Id=1,Arn=$fonkArn" | Out-Null
Tamam "kural $KURAL → $BILDIRIM_FONK"
$cikti = Join-Path $yerel "ilk.json"
try {
  $c = Cagir lambda invoke --function-name $BILDIRIM_FONK $cikti
  $sonuc = Get-Content $cikti -Raw | ConvertFrom-Json
  if ($c.FunctionError) { Uyari "ilk çalıştırma hata verdi: $(Get-Content $cikti -Raw)" }
  else { Tamam "ilk çalıştırma: $($sonuc.abone) abone (mevcut cihaz durumları kaydedildi; toplu bildirim gönderilmez)" }
} catch { Uyari "ilk çalıştırma denenemedi: $($_.Exception.Message)" }

# ── 6) Uygulamalar ────────────────────────────────────────────────────────
Adim "6/6 Uygulamalar"
foreach ($klasor in "panel-musteri", "panel-uretici") {
  $envDosya = Join-Path (Join-Path $KOK $klasor) ".env"
  if (-not (Test-Path $envDosya)) { Copy-Item (Join-Path (Join-Path $KOK $klasor) ".env.example") $envDosya }
  $satirlar = @(Get-Content $envDosya -Encoding UTF8)
  if ($satirlar -match '^VITE_VAPID_GENEL=') { $satirlar = $satirlar -replace '^VITE_VAPID_GENEL=.*$', "VITE_VAPID_GENEL=$vapidGenel" }
  else { $satirlar += "VITE_VAPID_GENEL=$vapidGenel" }
  [IO.File]::WriteAllLines($envDosya, [string[]]$satirlar, (New-Object Text.UTF8Encoding($false)))
}
Tamam "VITE_VAPID_GENEL iki uygulamanın .env dosyasına yazıldı"
if ($YayinAtla) { Uyari "Yayın atlandı; uygulamalar yeniden yayınlanana kadar yeni özellikler görünmez." }
else {
  $p = @{ Atla = @("backend", "hesap"); Onayla = $true; ApiTaban = $ApiTaban } + $ortakParam
  if ($TarayiciAcma) { $p.TarayiciAcma = $true }
  & (Join-Path $PSScriptRoot "hepsini-kur.ps1") @p
  if ($LASTEXITCODE) { throw "Lambda yaması ya da yayın başarısız; yukarıdaki özete bakın." }
}
} finally {
  Remove-Item $yerel -Recurse -Force -ErrorAction SilentlyContinue
  $vapidOzel = $null
}

Write-Host "`nHazır." -ForegroundColor Green
Bilgi "Bildirim: Hesabım (müşteri) / Ayarlar (üretici) sayfasından açılır. iPhone'da önce ana ekrana ekleyin."
Bilgi "Şifremi unuttum: giriş ekranında. Hesap silme: Hesabım > Hesabımı ve verilerimi sil."
Bilgi "KVKK metinleri: panel-musteri/.env içinde VITE_SIRKET_UNVAN, VITE_SIRKET_ADRES, VITE_KVKK_EPOSTA doldurun; avukata okutun."
exit 0
