<#
.SYNOPSIS
  lambda_function.py'yi inverterai-api Lambda'sına yükler — önce canlı kodu yedekler.

.DESCRIPTION
  1) Python sözdizimi kontrolü (python -m py_compile)
  2) Canlıdaki kodun zip'i yedekler\ klasörüne indirilir (geri dönüş için)
  3) Yeni kod zip'lenip yüklenir, güncelleme bitene kadar beklenir
  4) Yeni sürüm yayımlanır (numaralı sürüm; geri dönüş için)

  Geri dönmek için: .\lambda-yukle.ps1 -Dosya yedekler\<tarih>\lambda_function.py

.EXAMPLE
  .\lambda-yukle.ps1 -Dosya ..\..\dennis-energy\backend\lambda_function.py
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Dosya,
  [string]$Fonksiyon = "inverterai-api",
  [string]$Bolge = "eu-central-1",
  [string]$Profil = $env:AWS_PROFILE
)
$ErrorActionPreference = "Stop"
$AWS_CLI = (Get-Command aws -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
function Cagir { param([Parameter(ValueFromRemainingArguments)]$A)
  $ek = @("--region", $Bolge, "--output", "json")
  if ($Profil) { $ek += @("--profile", $Profil) }
  $cikti = & $AWS_CLI @A @ek 2>&1
  if ($LASTEXITCODE -ne 0) { throw "aws $($A -join ' ') başarısız:`n$cikti" }
  if ($cikti) { return ($cikti | Out-String | ConvertFrom-Json) }
}

$Dosya = (Resolve-Path $Dosya).Path
if ((Split-Path $Dosya -Leaf) -ne "lambda_function.py") { throw "Dosya adı lambda_function.py olmalı (Lambda işleyicisi bu adı bekler)." }

Write-Host "▶ Sözdizimi kontrolü"
& python -m py_compile $Dosya
if ($LASTEXITCODE -ne 0) { throw "Python sözdizimi hatası — yükleme yapılmadı." }
if (Select-String -Path $Dosya -Pattern '^\s*import numpy|^\s*from numpy' -Quiet) {
  throw "numpy içe aktarılıyor; Lambda katmanında numpy yok (DEVIR §13.6). Yükleme yapılmadı."
}

Write-Host "▶ Canlı kod yedekleniyor"
$damga = Get-Date -Format "yyyyMMdd-HHmmss"
$yedek = Join-Path $PSScriptRoot "yedekler\$damga"
New-Item -ItemType Directory -Force -Path $yedek | Out-Null
$bilgi = Cagir lambda get-function --function-name $Fonksiyon
Invoke-WebRequest -Uri $bilgi.Code.Location -OutFile "$yedek\canli.zip"
Expand-Archive "$yedek\canli.zip" -DestinationPath $yedek -Force
Write-Host "  ✓ $yedek" -ForegroundColor Green

Write-Host "▶ Yükleniyor"
$zip = Join-Path $env:TEMP "de-lambda-$damga.zip"
Compress-Archive -Path $Dosya -DestinationPath $zip -Force
Cagir lambda update-function-code --function-name $Fonksiyon --zip-file "fileb://$zip" | Out-Null
Cagir lambda wait function-updated --function-name $Fonksiyon | Out-Null
$surum = Cagir lambda publish-version --function-name $Fonksiyon --description "lambda-yukle $damga"
Remove-Item $zip
Write-Host "  ✓ yüklendi, sürüm $($surum.Version)" -ForegroundColor Green
Write-Host "Geri dönüş: .\lambda-yukle.ps1 -Dosya `"$yedek\lambda_function.py`""
