<#
.SYNOPSIS
  Bir uygulamayı derleyip S3 + CloudFront'a yükler.

.DESCRIPTION
  Hedef: S3 kovası (+ isteğe bağlı CloudFront) YA DA AWS Amplify uygulaması.

  1) .env yoksa .env.example'dan oluşturur; VITE_API_URL tanımlı olmalı
     (yoksa uygulama sessizce boş gelir — DEVIR §13.1)
  2) npm ci + npm run build
  3) /assets/ (adında içerik özeti olan dosyalar) 1 yıl önbellek;
     index.html, sw.js, manifest önbelleksiz — yeni sürüm hemen görünür
  4) CloudFront önbelleğini temizler

  Kova ve dağıtımı oluşturmak için hepsini-kur.ps1 kullanın.

.EXAMPLE
  .\panel-yayinla.ps1 -Panel panel-musteri -Kova dennis-musteri-346532553636 -DagitimId E1ABCDEF2GHIJ
.EXAMPLE
  .\panel-yayinla.ps1 -Panel panel-musteri -AmplifyUygulama d1a2b3c4d5e6f7
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet("panel-uretici", "panel-musteri")][string]$Panel,
  [string]$Kova,
  [string]$DagitimId,
  [string]$AmplifyUygulama,
  [string]$Bolge = "eu-central-1",
  [string]$Profil = $env:AWS_PROFILE
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"
if (-not $Kova -and -not $AmplifyUygulama) { throw "-Kova ya da -AmplifyUygulama verilmeli." }

$kok = Join-Path (Split-Path $PSScriptRoot -Parent) $Panel
$envDosya = Join-Path $kok ".env"
if (-not (Test-Path $envDosya)) {
  Copy-Item (Join-Path $kok ".env.example") $envDosya
  Bilgi ".env, .env.example'dan oluşturuldu"
}
if (-not (Select-String -Path $envDosya -Pattern '^VITE_API_URL=https://' -Quiet)) {
  throw "$envDosya içinde VITE_API_URL tanımlı değil."
}

Adim "$Panel derleniyor"
Push-Location $kok
try {
  & npm ci --no-audit --no-fund --loglevel=error
  if ($LASTEXITCODE -ne 0) { throw "npm ci başarısız" }
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw "derleme başarısız" }
} finally { Pop-Location }
$dist = Join-Path $kok "dist"
if (-not (Test-Path (Join-Path $dist "index.html"))) { throw "dist\index.html oluşmadı" }
Tamam "derlendi"

if ($AmplifyUygulama) {
  Adim "Amplify'a yükleniyor ($AmplifyUygulama)"
  AmplifyYayinla $AmplifyUygulama $dist
  Tamam "yayında"
  return
}

Adim "S3'e yükleniyor: s3://$Kova"
Cagir s3 sync (Join-Path $dist "assets") "s3://$Kova/assets" --delete --only-show-errors `
  --cache-control "public,max-age=31536000,immutable" | Out-Null
Cagir s3 sync $dist "s3://$Kova" --delete --only-show-errors --exclude "assets/*" --cache-control "no-cache" | Out-Null
Cagir s3 cp (Join-Path $dist "manifest.webmanifest") "s3://$Kova/manifest.webmanifest" --only-show-errors `
  --content-type "application/manifest+json" --cache-control "no-cache" | Out-Null
Tamam "yüklendi"

if ($DagitimId) {
  Adim "CloudFront önbelleği temizleniyor"
  Cagir cloudfront create-invalidation --distribution-id $DagitimId --paths "/*" | Out-Null
  Tamam "temizleme başlatıldı"
}
