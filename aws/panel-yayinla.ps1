<#
.SYNOPSIS
  Bir paneli derleyip S3 + CloudFront'a yayınlar.

.DESCRIPTION
  1) .env var mı kontrol eder (yoksa panel sessizce boş gelir — DEVIR §13.1)
  2) npm ci + npm run build
  3) dist/ → S3: içerik özetli /assets/ dosyaları 1 yıl önbellek,
     index.html / sw.js / manifest önbelleksiz (yeni sürüm hemen görünür)
  4) CloudFront önbelleğini temizler

  Kova ve CloudFront dağıtımı önceden oluşturulmuş olmalı. CloudFront'ta
  403/404 hata yanıtları /index.html'e (200) yönlendirilmeli — tek sayfa
  uygulama yolları (/cihaz/AKU-...) doğrudan açılabilsin.

.EXAMPLE
  .\panel-yayinla.ps1 -Panel panel-musteri -Kova dennis-musteri-web -DagitimId E1ABCDEF2GHIJ
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet("panel-uretici", "panel-musteri")][string]$Panel,
  [Parameter(Mandatory)][string]$Kova,
  [string]$DagitimId,
  [string]$Bolge = "eu-central-1",
  [string]$Profil = $env:AWS_PROFILE
)
$ErrorActionPreference = "Stop"
$AWS_CLI = (Get-Command aws -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$ek = @("--region", $Bolge); if ($Profil) { $ek += @("--profile", $Profil) }
function Calistir { param([Parameter(ValueFromRemainingArguments)]$A)
  & $AWS_CLI @A @ek; if ($LASTEXITCODE -ne 0) { throw "aws $($A -join ' ') başarısız" }
}

$kok = Join-Path (Split-Path $PSScriptRoot -Parent) $Panel
if (-not (Test-Path "$kok\.env")) { throw "$kok\.env yok. .env.example'ı kopyalayıp doldurun; aksi halde panel boş gelir." }
if (-not (Select-String -Path "$kok\.env" -Pattern '^VITE_API_URL=https://' -Quiet)) { throw ".env içinde VITE_API_URL tanımlı değil." }

Push-Location $kok
try {
  npm ci; if ($LASTEXITCODE -ne 0) { throw "npm ci başarısız" }
  npm run build; if ($LASTEXITCODE -ne 0) { throw "derleme başarısız" }
} finally { Pop-Location }

$dist = "$kok\dist"
Write-Host "▶ S3: s3://$Kova"
Calistir s3 sync "$dist\assets" "s3://$Kova/assets" --delete --cache-control "public,max-age=31536000,immutable"
Calistir s3 sync $dist "s3://$Kova" --delete --exclude "assets/*" --cache-control "no-cache"
Calistir s3 cp "$dist\manifest.webmanifest" "s3://$Kova/manifest.webmanifest" --content-type "application/manifest+json" --cache-control "no-cache"

if ($DagitimId) {
  Write-Host "▶ CloudFront önbelleği temizleniyor"
  Calistir cloudfront create-invalidation --distribution-id $DagitimId --paths "/index.html" "/sw.js" "/manifest.webmanifest" "/"
}
Write-Host "✓ $Panel yayınlandı." -ForegroundColor Green
