<#
  ses-kur.ps1 - Amazon SES'i hazirlar: gonderen kimligi dogrular ve Cognito'ya
  baglamak icin gereken degerleri verir.

  Neden: Cognito'nun varsayilan e-postasi gunde ~50 ile sinirli; gercek
  musteri hacmi icin SES gerekir (dogrulama / sifremi unuttum e-postalari).

  Bu betik:
    1) SES'te bir GONDEREN e-postasini (ya da alan adini) dogrulamaya acar.
    2) Cognito'ya elle girecegin SourceArn + From degerlerini yazar.
  Cognito baglamasini KONSOLDAN yapariz (CLI update-user-pool diger havuz
  ayarlarini sifirlayabilir; riskli).

  Kullanim (PowerShell, C:\dennis\aws):
    .\ses-kur.ps1 -Gonderen no-reply@alanadiniz.com
    .\ses-kur.ps1 -Alan alanadiniz.com          # tum alan adi (DKIM; daha profesyonel)

  NOT: SES ilk acilista "sandbox" modundadir -> yalnizca DOGRULANMIS adreslere
  e-posta gider. Gercek musterilere gondermek icin "production access" iste
  (asagida link). Onay ~24 saat.
#>
[CmdletBinding()]
param(
  [string]$Gonderen,
  [string]$Alan,
  [string]$Havuz = $HAVUZ,
  [string]$Bolge,
  [string]$Profil
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"

if (-not $Gonderen -and -not $Alan) { throw "-Gonderen <e-posta> ya da -Alan <alanadi> ver." }

Adim "Hesap dogrulaniyor"
$kim = HesapDogrula
Tamam "hesap $($kim.Account) - bolge $Bolge"
Bilgi "Not: SES bolgesi Cognito havuzuyla AYNI olmali ($Bolge)."

if ($Gonderen) {
  Adim "SES gonderen e-postasi dogrulamaya aciliyor: $Gonderen"
  Cagir ses verify-email-identity --email-address $Gonderen | Out-Null
  Tamam "istek gonderildi"
  Uyari "$Gonderen adresine bir DOGRULAMA e-postasi geldi -> icindeki baglantiya tikla."
  $kimlik = $Gonderen
  $arn = "arn:aws:ses:${Bolge}:$($kim.Account):identity/$Gonderen"
}
if ($Alan) {
  Adim "SES alan adi dogrulamaya aciliyor: $Alan"
  $tokenlar = Cagir ses verify-domain-identity --domain $Alan
  Tamam "istek gonderildi"
  Uyari "Alan adi DNS'ine su TXT kaydini ekle (dogrulama icin):"
  Write-Host "   _amazonses.$Alan  TXT  `"$($tokenlar.VerificationToken)`"" -ForegroundColor White
  Bilgi "DKIM icin de: aws ses verify-domain-dkim --domain $Alan  (cikan 3 CNAME'i DNS'e ekle)"
  $kimlik = $Alan
  $arn = "arn:aws:ses:${Bolge}:$($kim.Account):identity/$Alan"
}

Write-Host ""
Write-Host "==================== COGNITO'YA GIR (konsol) ====================" -ForegroundColor Cyan
Bilgi "Kimlik DOGRULANDIKTAN sonra Cognito'yu SES'e bagla:"
Bilgi "Cognito konsolu > User pools > havuzun ($Havuz) > Messaging > Email"
Bilgi "  - 'Send email with Amazon SES' sec"
Bilgi "  - SES Region: $Bolge"
Bilgi "  - FROM / SES identity:"
Write-Host "      From ARN   : $arn" -ForegroundColor White
Write-Host "      FROM adresi : $kimlik" -ForegroundColor White
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""
Adim "Sandbox'tan cikis (gercek musterilere gondermek icin ZORUNLU)"
Bilgi "SES simdi sandbox'ta: yalnizca dogrulanmis adreslere gonderir."
Bilgi "Production access iste (onay ~24 sa):"
Bilgi "  https://console.aws.amazon.com/ses/home?region=$Bolge#/account  > Request production access"
Write-Host ""
Bilgi "Durumu kontrol:  aws ses get-identity-verification-attributes --identities $kimlik --region $Bolge"
