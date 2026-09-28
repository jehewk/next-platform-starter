<#
.SYNOPSIS
  Dennis Energy — AWS kurulumunun tamamı, tek komutla.

.DESCRIPTION
  Sırasıyla (her adım tekrar çalıştırmaya dayanıklıdır; var olanı yeniden kurmaz):

   1. Backend ayarları (DEVIR §2)  — backend-ayarlari.ps1 -Uygula
   2. Lambda eki                   — canlı koda /de/musteri/guncelle eklenir,
                                     yedeklenerek yüklenir, sağlık kontrolü
                                     geçmezse otomatik geri alınır
   3. Üretici hesabı               — panele girecek personel (Cognito)
   4. Web yayını                   — iki uygulama için özel S3 kovası +
                                     CloudFront (HTTPS, OAC, tek sayfa yönlendirme),
                                     derleme, yükleme; adresler tarayıcıda açılır.
                                     Hesap CloudFront için henüz doğrulanmamışsa
                                     (AccessDenied) otomatik olarak AWS Amplify
                                     Hosting kullanılır (yine HTTPS).

  Oluşturulan kaynakların kimlikleri aws\kurulum-durumu.json'a yazılır.

.EXAMPLE
  cd C:\dennis\aws
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  .\hepsini-kur.ps1

.EXAMPLE
  .\hepsini-kur.ps1 -Atla hesap,lambda      # yalnızca backend ayarları + web
#>
[CmdletBinding()]
param(
  [string]$UreticiEposta,
  [SecureString]$UreticiSifre,
  [ValidateSet("backend", "lambda", "hesap", "web")][string[]]$Atla = @(),
  [switch]$Onayla,
  [switch]$TarayiciAcma,
  [string]$ApiTaban,
  # Otomatik: CloudFront; hesap CloudFront için doğrulanmamışsa Amplify Hosting
  [ValidateSet("Otomatik", "CloudFront", "Amplify")][string]$WebYontemi = "Otomatik",
  [string]$Bolge = "eu-central-1",
  [string]$Profil = $env:AWS_PROFILE
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"
if (-not $ApiTaban) { $ApiTaban = $API_TABAN_VARSAYILAN }
$KOK = Split-Path $PSScriptRoot -Parent
$DURUM_DOSYASI = Join-Path $PSScriptRoot "kurulum-durumu.json"
$ortakParam = @{ Bolge = $Bolge }
if ($Profil) { $ortakParam.Profil = $Profil }

$UYGULAMALAR = @(
  @{ Anahtar = "musteri"; Klasor = "panel-musteri"; Ad = "Müşteri uygulaması" },
  @{ Anahtar = "uretici"; Klasor = "panel-uretici"; Ad = "Üretici paneli" }
)

function Durum {
  if (Test-Path $DURUM_DOSYASI) { return (Get-Content $DURUM_DOSYASI -Raw | ConvertFrom-Json) }
  return [pscustomobject]@{}
}
function DurumYaz($d) { [IO.File]::WriteAllText($DURUM_DOSYASI, ($d | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false))) }
function Var { param([Parameter(ValueFromRemainingArguments = $true)]$A) try { Cagir @A | Out-Null; $true } catch { $false } }

function DurumKaydet($anahtar, $deger) {
  $d = Durum
  $d | Add-Member -NotePropertyName $anahtar -NotePropertyValue ([pscustomobject]$deger) -Force
  DurumYaz $d
}

# Özel S3 kovası + CloudFront (OAC). Hesap doğrulanmamışsa create-distribution
# "must be verified" ile reddedilir; çağıran Amplify'a geçer.
function CloudFrontYayini($u) {
  $kova = "dennis-$($u.Anahtar)-$HESAP"
  $kayit = (Durum).PSObject.Properties[$u.Anahtar].Value

  # ── S3 kovası: tamamen özel; yalnızca CloudFront okuyabilir ──
  if (Var s3api head-bucket --bucket $kova) { Tamam "kova mevcut: $kova" }
  else {
    Cagir s3api create-bucket --bucket $kova --create-bucket-configuration "LocationConstraint=$Bolge" | Out-Null
    Tamam "kova oluşturuldu: $kova"
  }
  Cagir s3api put-public-access-block --bucket $kova --public-access-block-configuration `
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" | Out-Null

  # ── CloudFront dağıtımı ──
  $dag = $null
  if ($kayit -and $kayit.dagitim) { $dag = (Dene cloudfront get-distribution --id $kayit.dagitim).Distribution }
  if (-not $dag) {
    $dag = (Cagir cloudfront list-distributions).DistributionList.Items |
      Where-Object { $_.Comment -eq "dennis-$($u.Anahtar)" } | Select-Object -First 1
  }
  if ($dag) { Tamam "CloudFront mevcut: $($dag.Id)" }
  else {
    $koken = "s3-$kova"
    $yap = @{
      CallerReference   = "dennis-$($u.Anahtar)-" + (Get-Date -Format "yyyyMMddHHmmss")
      Comment           = "dennis-$($u.Anahtar)"
      Enabled           = $true
      DefaultRootObject = "index.html"
      HttpVersion       = "http2and3"
      IsIPV6Enabled     = $true
      PriceClass        = "PriceClass_100"
      Origins = @{ Quantity = 1; Items = @(@{
        Id = $koken; DomainName = "$kova.s3.$Bolge.amazonaws.com"
        OriginAccessControlId = $oacId; S3OriginConfig = @{ OriginAccessIdentity = "" } }) }
      DefaultCacheBehavior = @{
        TargetOriginId = $koken; ViewerProtocolPolicy = "redirect-to-https"; Compress = $true
        CachePolicyId  = "658327ea-f89d-4fab-a63d-7e88639e58f6"   # AWS yönetimli: CachingOptimized
        AllowedMethods = @{ Quantity = 2; Items = @("GET", "HEAD"); CachedMethods = @{ Quantity = 2; Items = @("GET", "HEAD") } } }
      # Tek sayfa uygulama: /cihaz/AKU-... gibi yollar doğrudan açılabilsin
      CustomErrorResponses = @{ Quantity = 2; Items = @(
        @{ ErrorCode = 403; ResponsePagePath = "/index.html"; ResponseCode = "200"; ErrorCachingMinTTL = 0 },
        @{ ErrorCode = 404; ResponsePagePath = "/index.html"; ResponseCode = "200"; ErrorCachingMinTTL = 0 }) }
    }
    $d = JsonDosyasi $yap
    $dag = (Cagir cloudfront create-distribution --distribution-config "file://$d").Distribution
    $script:yeniDagitimlar += $dag.Id
    Tamam "CloudFront oluşturuldu: $($dag.Id) (dünya geneline yayılması 5–15 dk sürer)"
  }

  # ── Kova politikası: yalnızca bu dağıtım okuyabilir ──
  $arn = "arn:aws:cloudfront::${HESAP}:distribution/$($dag.Id)"
  $pol = JsonDosyasi @{ Version = "2012-10-17"; Statement = @(@{
    Sid = "YalnizCloudFront"; Effect = "Allow"; Principal = @{ Service = "cloudfront.amazonaws.com" }
    Action = "s3:GetObject"; Resource = "arn:aws:s3:::$kova/*"
    Condition = @{ StringEquals = @{ "AWS:SourceArn" = $arn } } }) }
  Cagir s3api put-bucket-policy --bucket $kova --policy "file://$pol" | Out-Null
  Tamam "kova yalnızca CloudFront'a açık"

  DurumKaydet $u.Anahtar @{ yontem = "cloudfront"; kova = $kova; dagitim = $dag.Id; alan = $dag.DomainName }

  # ── Derle ve yükle ──
  & (Join-Path $PSScriptRoot "panel-yayinla.ps1") -Panel $u.Klasor -Kova $kova -DagitimId $dag.Id @ortakParam
  $script:adresler += [pscustomobject]@{ Ad = $u.Ad; Adres = "https://$($dag.DomainName)" }
  $sonuclar[$u.Ad] = "https://$($dag.DomainName)"
}

# AWS Amplify Hosting: uygulama "dennis-<ad>", dal "main", HTTPS alan adı Amplify'dan.
function AmplifyYayini($u) {
  $app = AmplifyUygulamasi "dennis-$($u.Anahtar)"
  Tamam "Amplify uygulaması: $($app.appId)"
  $alan = "main.$($app.defaultDomain)"
  DurumKaydet $u.Anahtar @{ yontem = "amplify"; amplify = $app.appId; alan = $alan }
  & (Join-Path $PSScriptRoot "panel-yayinla.ps1") -Panel $u.Klasor -AmplifyUygulama $app.appId @ortakParam
  $script:adresler += [pscustomobject]@{ Ad = $u.Ad; Adres = "https://$alan" }
  $sonuclar[$u.Ad] = "https://$alan (Amplify)"
}

$sonuclar = [ordered]@{}

# ════════════════════════ 0. Ön kontrol ════════════════════════
Adim "Ön kontrol"
$kim = HesapDogrula
Tamam "AWS hesabı $($kim.Account)"
if ($kim.Arn -match ':root$') {
  Uyari "Kök (root) hesap anahtarıyla çalışıyorsunuz. Kurulumdan sonra IAM'de bir yönetici"
  Uyari "kullanıcısı açıp kök erişim anahtarını silmeniz önerilir."
}
foreach ($arac in "node", "npm") {
  if (-not (Get-Command $arac -ErrorAction SilentlyContinue)) {
    if ($Atla -notcontains "web") { throw "$arac bulunamadı. nodejs.org'dan Node.js LTS kurun (web yayını için gerekli)." }
  }
}
# Windows'taki "python" bazen yalnızca Microsoft Store kısayoludur; gerçekten çalışanı bul.
$PYTHON = $null
foreach ($aday in @(@("python"), @("python3"), @("py", "-3"))) {
  $k = Get-Command $aday[0] -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $k) { continue }
  $ek = @($aday | Select-Object -Skip 1)
  $eski = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  & $k.Source @ek --version *> $null
  $ok = ($LASTEXITCODE -eq 0); $ErrorActionPreference = $eski
  if ($ok) { $PYTHON = @($k.Source) + $ek; break }
}
if (-not $PYTHON -and $Atla -notcontains "lambda") {
  Uyari "Python bulunamadı; Lambda eki adımı atlanacak (python.org'dan kurup tekrar çalıştırabilirsiniz)."
  $Atla += "lambda"
}

if ($Atla -notcontains "hesap" -and -not $UreticiEposta) {
  $UreticiEposta = Read-Host "  Üretici paneline girecek e-posta (boş bırakılırsa hesap adımı atlanır)"
  if (-not $UreticiEposta) { $Atla += "hesap" }
}

Write-Host ""
Write-Host "Yapılacaklar:" -ForegroundColor White
if ($Atla -notcontains "backend") { Bilgi "1. Backend ayarları (izinler, giriş akışı, kaptcha anahtarı)" }
if ($Atla -notcontains "lambda")  { Bilgi "2. Lambda'ya müşteri düzenleme ucu (yedekli, sağlık kontrollü)" }
if ($Atla -notcontains "hesap")   { Bilgi "3. Üretici hesabı: $UreticiEposta" }
if ($Atla -notcontains "web")     { Bilgi "4. Web yayını (CloudFront; olmazsa Amplify): müşteri uygulaması ve üretici paneli" }
if (-not $Onayla) {
  $cevap = Read-Host "`nDevam edilsin mi? (E/H)"
  if ($cevap -notmatch '^(e|evet|y|yes)$') { Write-Host "İptal edildi."; return }
}

# ════════════════════════ 1. Backend ayarları ════════════════════════
if ($Atla -notcontains "backend") {
  try {
    & (Join-Path $PSScriptRoot "backend-ayarlari.ps1") -Uygula @ortakParam
    $sonuclar["Backend ayarları"] = "tamam"
  } catch { Uyari $_.Exception.Message; $sonuclar["Backend ayarları"] = "HATA: $($_.Exception.Message)" }
}

# ════════════════════════ 2. Lambda eki ════════════════════════
if ($Atla -notcontains "lambda") {
  Adim "Lambda: müşteri düzenleme ucu"
  try {
    $is = Join-Path ([IO.Path]::GetTempPath()) ("de-yama-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
    $canliKlasor = Join-Path $is "canli"; $yamaliKlasor = Join-Path $is "yamali"
    $canliZip = Join-Path $is "canli.zip"
    New-Item -ItemType Directory -Force -Path $canliKlasor, $yamaliKlasor | Out-Null
    $bilgi = Cagir lambda get-function --function-name $LAMBDA
    Invoke-WebRequest -Uri $bilgi.Code.Location -OutFile $canliZip -UseBasicParsing
    Expand-Archive $canliZip -DestinationPath $canliKlasor -Force
    $canliPy = Join-Path $canliKlasor "lambda_function.py"
    $yamaliPy = Join-Path $yamaliKlasor "lambda_function.py"
    if (-not (Test-Path $canliPy)) { throw "Canlı zip'te lambda_function.py yok." }

    $yamaAraci = Join-Path (Join-Path $PSScriptRoot "ekler") "yamala.py"
    $pyArg = @($PYTHON | Select-Object -Skip 1) + @($yamaAraci, $canliPy, $yamaliPy)
    $eski = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    & $PYTHON[0] @pyArg | ForEach-Object { Bilgi $_ }
    $kod = $LASTEXITCODE; $ErrorActionPreference = $eski

    if ($kod -eq 3) { Tamam "uç zaten canlıda; değişiklik gerekmedi"; $sonuclar["Lambda eki"] = "zaten vardı" }
    elseif ($kod -eq 4) { throw "Canlı kod beklenen yapıda değil; yama uygulanmadı, hiçbir şey yüklenmedi." }
    elseif ($kod -ne 0) { throw "Yama aracı hata verdi (çıkış kodu $kod); hiçbir şey yüklenmedi." }
    else {
      & (Join-Path $PSScriptRoot "lambda-yukle.ps1") -Dosya $yamaliPy -ApiTaban $ApiTaban @ortakParam
      $sonuclar["Lambda eki"] = "yüklendi"
    }
  } catch { Uyari $_.Exception.Message; $sonuclar["Lambda eki"] = "HATA: $($_.Exception.Message)" }
}

# ════════════════════════ 3. Üretici hesabı ════════════════════════
if ($Atla -notcontains "hesap") {
  Adim "Üretici hesabı: $UreticiEposta"
  try {
    $p = @{ Eposta = $UreticiEposta; Rol = "uretici" } + $ortakParam
    if ($UreticiSifre) { $p.Sifre = $UreticiSifre }
    & (Join-Path $PSScriptRoot "kullanici-olustur.ps1") @p
    $sonuclar["Üretici hesabı"] = $UreticiEposta
  } catch { Uyari $_.Exception.Message; $sonuclar["Üretici hesabı"] = "HATA: $($_.Exception.Message)" }
}

# ════════════════════════ 4. Web yayını ════════════════════════
$adresler = @()
if ($Atla -notcontains "web") {
  $script:yeniDagitimlar = @()

  $cloudFrontKapali = ($WebYontemi -eq "Amplify")
  if (-not $cloudFrontKapali) {
    try {
      Adim "CloudFront erişim denetimi (OAC)"
      $oacAdi = "dennis-s3-oac"
      $oac = (Cagir cloudfront list-origin-access-controls).OriginAccessControlList.Items |
        Where-Object { $_.Name -eq $oacAdi } | Select-Object -First 1
      if ($oac) { $oacId = $oac.Id; Tamam "mevcut: $oacId" }
      else {
        $d = JsonDosyasi @{ Name = $oacAdi; Description = "Dennis Energy web uygulamalari"; SigningProtocol = "sigv4";
                            SigningBehavior = "always"; OriginAccessControlOriginType = "s3" }
        $oacId = (Cagir cloudfront create-origin-access-control --origin-access-control-config "file://$d").OriginAccessControl.Id
        Tamam "oluşturuldu: $oacId"
      }
    } catch {
      if ($_.Exception.Message -match 'must be verified' -and $WebYontemi -eq "Otomatik") { $cloudFrontKapali = $true }
      else { throw }
    }
  }
  foreach ($u in $UYGULAMALAR) {
    Adim "$($u.Ad)"
    $yayinlandi = $false
    if (-not $cloudFrontKapali) {
      try {
        CloudFrontYayini $u
        $yayinlandi = $true
      } catch {
        $m = $_.Exception.Message
        if ($m -match 'must be verified' -and $WebYontemi -eq "Otomatik") {
          Uyari "Hesap CloudFront için henüz doğrulanmamış (AWS Destek'ten açtırılmalı)."
          Uyari "Bu arada HTTPS'li yayın için AWS Amplify Hosting kullanılıyor."
          $cloudFrontKapali = $true
        } else { Uyari $m; $sonuclar[$u.Ad] = "HATA: $m"; continue }
      }
    }
    if (-not $yayinlandi) {
      try { AmplifyYayini $u }
      catch { Uyari $_.Exception.Message; $sonuclar[$u.Ad] = "HATA: $($_.Exception.Message)" }
    }
  }

  foreach ($id in $yeniDagitimlar) {
    Adim "CloudFront yayılması bekleniyor ($id) — birkaç dakika sürebilir"
    try { Cagir cloudfront wait distribution-deployed --id $id | Out-Null; Tamam "hazır" }
    catch { Uyari "bekleme zaman aşımına uğradı; birkaç dakika sonra adresi tekrar deneyin" }
  }
}

# ════════════════════════ Özet ════════════════════════
Write-Host "`n══════════════ ÖZET ══════════════" -ForegroundColor White
foreach ($k in $sonuclar.Keys) {
  $renk = if ("$($sonuclar[$k])" -like "HATA*") { "Red" } else { "Green" }
  Write-Host ("  {0,-22} {1}" -f $k, $sonuclar[$k]) -ForegroundColor $renk
}
if ($adresler.Count) {
  Write-Host "`nTarayıcıda açılıyor:" -ForegroundColor White
  foreach ($a in $adresler) {
    Bilgi "$($a.Ad): $($a.Adres)"
    if (-not $TarayiciAcma) { try { Start-Process $a.Adres } catch { } }
  }
}
Bilgi "Kaynak kimlikleri: $DURUM_DOSYASI"
if (@($sonuclar.Values | Where-Object { "$_" -like "HATA*" }).Count) {
  Write-Host "`nBazı adımlar başarısız oldu; hatayı düzeltip betiği tekrar çalıştırabilirsiniz (tamamlananlar yeniden yapılmaz)." -ForegroundColor Yellow
  exit 1
}
