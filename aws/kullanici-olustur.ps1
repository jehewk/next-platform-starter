<#
.SYNOPSIS
  Üretici paneli için personel hesabı açar (Cognito).

.DESCRIPTION
  Şifre kalıcı atanır (--permanent). Atanmazsa Cognito ilk girişte şifre
  değiştirme akışı başlatır; arayüz bunu desteklemez (DEVIR §2, §13.8).
  Müşteri hesapları bu betikle AÇILMAZ: müşteri uygulamadan başvurur,
  üretici panelindeki Başvurular sayfasından onaylanır.

.EXAMPLE
  .\kullanici-olustur.ps1 -Eposta teknisyen@dennisenerji.com -Rol uretici
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Eposta,
  [ValidateSet("uretici", "admin")][string]$Rol = "uretici",
  [string]$Bolge = "eu-central-1",
  [string]$Profil = $env:AWS_PROFILE
)
$ErrorActionPreference = "Stop"
$HAVUZ = "eu-central-1_6Y1AK5Z3q"
$AWS_CLI = (Get-Command aws -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$ek = @("--region", $Bolge); if ($Profil) { $ek += @("--profile", $Profil) }

$Eposta = $Eposta.Trim().ToLower()
$sifre = Read-Host "Şifre (en az 8 karakter, büyük/küçük harf ve rakam)" -AsSecureString
$duz = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sifre))
if ($duz.Length -lt 8 -or $duz -cnotmatch '[a-z]' -or $duz -cnotmatch '[A-Z]' -or $duz -notmatch '\d') {
  throw "Şifre kurala uymuyor."
}

$gecici = "Gecici-" + [guid]::NewGuid().ToString("N").Substring(0, 10) + "A1"
& $AWS_CLI cognito-idp admin-create-user --user-pool-id $HAVUZ --username $Eposta `
  --user-attributes Name=email,Value=$Eposta Name=email_verified,Value=true Name=custom:rol,Value=$Rol `
  --temporary-password $gecici --message-action SUPPRESS @ek | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Hesap açılamadı (e-posta zaten kayıtlı olabilir)." }

& $AWS_CLI cognito-idp admin-set-user-password --user-pool-id $HAVUZ --username $Eposta `
  --password $duz --permanent @ek | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Şifre atanamadı." }
$duz = $null
Write-Host "✓ $Eposta ($Rol) açıldı. Üretici paneline bu e-posta ve şifreyle girilebilir." -ForegroundColor Green
