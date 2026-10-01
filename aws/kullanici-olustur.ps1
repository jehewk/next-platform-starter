<#
.SYNOPSIS
  Üretici paneli için personel hesabı açar (Cognito).

.DESCRIPTION
  Şifre kalıcı atanır (--permanent); atanmazsa Cognito ilk girişte şifre
  değiştirme akışı başlatır ve arayüz bunu desteklemez (DEVIR §2, §13.8).
  Hesap zaten varsa yalnızca rolünü ve şifresini günceller.
  Müşteri hesapları bu betikle açılmaz: müşteri uygulamadan başvurur,
  üretici panelinde Başvurular sayfasından onaylanır.

.EXAMPLE
  .\kullanici-olustur.ps1 -Eposta teknisyen@dennisenerji.com -Rol uretici
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Eposta,
  [ValidateSet("uretici", "admin")][string]$Rol = "uretici",
  [SecureString]$Sifre,
  [string]$Bolge = "eu-central-1",
  [string]$Profil = $env:AWS_PROFILE
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"

$Eposta = $Eposta.Trim().ToLowerInvariant()
if ($Eposta -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw "Geçersiz e-posta: $Eposta" }
if (-not $Sifre) { $Sifre = Read-Host "  $Eposta için şifre (en az 8 karakter; büyük/küçük harf ve rakam)" -AsSecureString }
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Sifre)
try { $duz = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
if ($duz.Length -lt 8 -or $duz -cnotmatch '[a-z]' -or $duz -cnotmatch '[A-Z]' -or $duz -notmatch '\d') {
  throw "Şifre kurala uymuyor: en az 8 karakter, büyük harf, küçük harf ve rakam."
}

$var = Dene cognito-idp admin-get-user --user-pool-id $HAVUZ --username $Eposta
if ($var) {
  Cagir cognito-idp admin-update-user-attributes --user-pool-id $HAVUZ --username $Eposta `
    --user-attributes "Name=custom:rol,Value=$Rol" | Out-Null
  Tamam "$Eposta zaten vardı; rol '$Rol' olarak güncellendi"
} else {
  $gecici = "Gecici-" + [guid]::NewGuid().ToString("N").Substring(0, 10) + "Aa1"
  Cagir cognito-idp admin-create-user --user-pool-id $HAVUZ --username $Eposta `
    --user-attributes "Name=email,Value=$Eposta" "Name=email_verified,Value=true" "Name=custom:rol,Value=$Rol" `
    --temporary-password $gecici --message-action SUPPRESS | Out-Null
  Tamam "$Eposta ($Rol) açıldı"
}
Cagir cognito-idp admin-set-user-password --user-pool-id $HAVUZ --username $Eposta --password $duz --permanent | Out-Null
$duz = $null
Tamam "şifre kalıcı olarak atandı"
