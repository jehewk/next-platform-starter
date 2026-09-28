<#
.SYNOPSIS
  inverterai-api Lambda'sına yeni lambda_function.py yükler — yedekli ve geri dönüşlü.

.DESCRIPTION
  1) Sözdizimi ve numpy kontrolü (Lambda'da numpy yok — DEVIR §13.6)
  2) Canlı kodun zip'i aws\yedekler\<tarih>\ altına indirilir
  3) Yeni zip = canlı zip'in TAMAMI, yalnızca lambda_function.py değişmiş
     (zip'te başka dosya varsa silinmez)
  4) Yüklenir, numaralı sürüm yayımlanır
  5) Canlı sağlık kontrolü: POST /de/kaptcha 200 dönmeli; dönmezse
     yedek OTOMATİK geri yüklenir

.EXAMPLE
  .\lambda-yukle.ps1 -Dosya C:\dennis-energy\backend\lambda_function.py
  .\lambda-yukle.ps1 -GeriYukle aws\yedekler\20260928-101500\canli.zip
#>
[CmdletBinding(DefaultParameterSetName = "Yukle")]
param(
  [Parameter(Mandatory, ParameterSetName = "Yukle")][string]$Dosya,
  [Parameter(Mandatory, ParameterSetName = "Geri")][string]$GeriYukle,
  [string]$ApiTaban,
  [string]$Bolge = "eu-central-1",
  [string]$Profil = $env:AWS_PROFILE
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"
if (-not $ApiTaban) { $ApiTaban = $API_TABAN_VARSAYILAN }

function ZipYukle($zip, $aciklama) {
  Cagir lambda update-function-code --function-name $LAMBDA --zip-file "fileb://$zip" | Out-Null
  Cagir lambda wait function-updated --function-name $LAMBDA | Out-Null
  return (Cagir lambda publish-version --function-name $LAMBDA --description $aciklama).Version
}

function SaglikKontrolu {
  # Kimlik gerektirmeyen tek uç: doğrulama kodu üretimi. Lambda çökerse 5xx döner.
  for ($i = 1; $i -le 3; $i++) {
    try {
      $c = Invoke-RestMethod -Method Post -Uri "$ApiTaban/de/kaptcha" -ContentType "application/json" -Body "{}" -TimeoutSec 20
      if ($c.token -and $c.svg) { return $true }
    } catch { Start-Sleep -Seconds 3 }
  }
  return $false
}

HesapDogrula | Out-Null

if ($PSCmdlet.ParameterSetName -eq "Geri") {
  Adim "Yedek geri yükleniyor: $GeriYukle"
  $s = ZipYukle (Resolve-Path $GeriYukle).Path "geri-yukleme"
  Tamam "sürüm $s"
  if (SaglikKontrolu) { Tamam "sağlık kontrolü geçti" } else { Uyari "sağlık kontrolü geçmedi — CloudWatch günlüklerine bakın" }
  return
}

$Dosya = (Resolve-Path $Dosya).Path
if ((Split-Path $Dosya -Leaf) -ne "lambda_function.py") { throw "Dosya adı lambda_function.py olmalı." }

Adim "Kontrol"
$yap = Cagir lambda get-function-configuration --function-name $LAMBDA
if ($yap.Handler -ne "lambda_function.lambda_handler") { throw "Beklenmeyen işleyici: $($yap.Handler). Yükleme yapılmadı." }
$python = (Get-Command python, python3 -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if ($python) {
  & $python -m py_compile $Dosya
  if ($LASTEXITCODE -ne 0) { throw "Python sözdizimi hatası — yükleme yapılmadı." }
} else { Uyari "Python bulunamadı; sözdizimi kontrolü atlandı" }
if (Select-String -Path $Dosya -Pattern '^\s*(import|from)\s+numpy' -Quiet) {
  throw "numpy içe aktarılıyor; Lambda katmanında numpy yok (DEVIR §13.6). Yükleme yapılmadı."
}
Tamam "sözdizimi ve bağımlılık kontrolü"

Adim "Canlı kod yedekleniyor"
$damga = Get-Date -Format "yyyyMMdd-HHmmss"
$yedek = Join-Path (Join-Path $PSScriptRoot "yedekler") $damga
$canliZip = Join-Path $yedek "canli.zip"
New-Item -ItemType Directory -Force -Path $yedek | Out-Null
$bilgi = Cagir lambda get-function --function-name $LAMBDA
Invoke-WebRequest -Uri $bilgi.Code.Location -OutFile $canliZip -UseBasicParsing
Tamam $canliZip

Adim "Yeni paket hazırlanıyor"
$calisma = Join-Path $yedek "yeni"
Expand-Archive $canliZip -DestinationPath $calisma -Force
$digerleri = @(Get-ChildItem $calisma -Recurse -File | Where-Object { $_.Name -ne "lambda_function.py" })
Copy-Item $Dosya (Join-Path $calisma "lambda_function.py") -Force
$zip = Join-Path $yedek "yeni.zip"
ZipOlustur $calisma $zip
Tamam "lambda_function.py değişti; korunan diğer dosya: $($digerleri.Count)"

Adim "Yükleniyor"
$surum = ZipYukle $zip "lambda-yukle $damga"
Tamam "sürüm $surum"

Adim "Sağlık kontrolü ($ApiTaban/de/kaptcha)"
if (SaglikKontrolu) {
  Tamam "Lambda yanıt veriyor"
  Bilgi "Elle geri dönüş: .\lambda-yukle.ps1 -GeriYukle `"$canliZip`""
} else {
  Uyari "Lambda yanıt vermiyor — yedek geri yükleniyor"
  $s = ZipYukle $canliZip "otomatik geri yukleme $damga"
  throw "Yeni kod sağlık kontrolünden geçmedi; önceki kod geri yüklendi (sürüm $s). CloudWatch: /aws/lambda/$LAMBDA"
}
