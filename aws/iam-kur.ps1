<#
  iam-kur.ps1 - Root yerine yonetici IAM kullanicisi olusturur.

  Root (kok) hesap anahtariyla gunluk is yapmak risklidir. Bu betik bir
  yonetici IAM kullanicisi + erisim anahtari uretir. Sonra AWS CLI'yi bu
  kullaniciya gecirir, ve root erisim anahtarini SILMENI soyler (o adim
  konsoldan yapilir; betik root anahtarini goremez/silemez).

  ONEMLI: Bu betigi SON KEZ root (ya da zaten yetkili) kimlikle calistir.
  Erisim anahtari ekranda BIR KEZ gosterilir; guvenli yere kaydet, repoya
  KOYMA.

  Kullanim (PowerShell, C:\dennis\aws):
    .\iam-kur.ps1
    .\iam-kur.ps1 -KullaniciAdi dennis-admin
#>
[CmdletBinding()]
param(
  [string]$KullaniciAdi = "dennis-yonetici",
  [string]$PolitikaArn = "arn:aws:iam::aws:policy/AdministratorAccess",
  [string]$Bolge,
  [string]$Profil
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"

Adim "Hesap dogrulaniyor"
$kim = HesapDogrula
Tamam "hesap $($kim.Account) - $($kim.Arn)"
if ($kim.Arn -notmatch ":root") {
  Uyari "Zaten IAM kimligiyle calisiyor gibisin ($($kim.Arn)). Yine de yeni kullanici olusturabilirsin."
}

# 1) Kullanici
Adim "IAM kullanicisi: $KullaniciAdi"
if (Dene iam get-user --user-name $KullaniciAdi) {
  Tamam "kullanici zaten var"
} else {
  Cagir iam create-user --user-name $KullaniciAdi | Out-Null
  Tamam "olusturuldu"
}

# 2) Yonetici politikasi
Adim "Yonetici yetkisi ekleniyor (AdministratorAccess)"
Cagir iam attach-user-policy --user-name $KullaniciAdi --policy-arn $PolitikaArn | Out-Null
Tamam "yetki eklendi"

# 3) Konsol sifresi (opsiyonel degil ama bilgi): sadece eri­sim anahtari uretiyoruz
Adim "Erisim anahtari uretiliyor"
$mevcut = (Cagir iam list-access-keys --user-name $KullaniciAdi).AccessKeyMetadata
if ($mevcut -and $mevcut.Count -ge 2) {
  throw "Bu kullanicinin zaten 2 erisim anahtari var (IAM limiti). Once eskisini sil: aws iam delete-access-key --user-name $KullaniciAdi --access-key-id <ID>"
}
$ak = Cagir iam create-access-key --user-name $KullaniciAdi
$id = $ak.AccessKey.AccessKeyId
$secret = $ak.AccessKey.SecretAccessKey

# GUVENLIK: Secret ASLA ekrana/loga basilmaz (ekran goruntusu/kopyala-yapistir
# ile sizar). Repo DISINDAKI kullanici profiline, yalnizca sahibinin okuyabilecegi
# bir dosyaya yazilir; ekranda sadece zararsiz Access Key ID gorunur.
$anahtarDosyasi = Join-Path $env:USERPROFILE "dennis-iam-$KullaniciAdi.env"
$icerik = "# Dennis IAM erisim anahtari ($KullaniciAdi) - $(Get-Date -Format s)`r`n" +
          "# Kullandiktan sonra bu dosyayi SIL. Repoya KOYMA, kimseyle paylasma.`r`n" +
          "AWS_ACCESS_KEY_ID=$id`r`n" +
          "AWS_SECRET_ACCESS_KEY=$secret`r`n"
Set-Content -Path $anahtarDosyasi -Value $icerik -Encoding ASCII
# Dosyayi yalnizca mevcut kullaniciya kisitla (kalitimi kaldir)
try {
  icacls $anahtarDosyasi /inheritance:r /grant:r "$($env:USERNAME):F" | Out-Null
} catch { Uyari "Dosya izni kisitlanamadi; dosyayi elle koruyun: $anahtarDosyasi" }
# Bellekteki sirri temizle
$secret = $null; $ak = $null; [System.GC]::Collect()

Write-Host ""
Write-Host "==================== ERISIM ANAHTARI OLUSTURULDU ====================" -ForegroundColor Cyan
Write-Host "  AWS_ACCESS_KEY_ID = $id" -ForegroundColor White
Write-Host "  SECRET            = (ekrana BASILMADI; dosyaya yazildi)" -ForegroundColor DarkGray
Write-Host "  Dosya             = $anahtarDosyasi" -ForegroundColor White
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""
Bilgi "1) CLI'yi bu kullaniciya gecir (secret'i dosyadan kopyala, sohbete YAPISTIRMA):"
Bilgi "   aws configure    # region: $Bolge, format: json"
Bilgi "2) Dogrula:  aws sts get-caller-identity   (Arn artik .../$KullaniciAdi olmali)"
Bilgi "3) CLI calisinca anahtar dosyasini SIL:"
Bilgi "   Remove-Item `"$anahtarDosyasi`""
Bilgi "4) SONRA root anahtarini SIL (konsoldan, cok onemli):"
Bilgi "   https://console.aws.amazon.com/iam/home#/security_credentials"
Bilgi "   > Access keys > root anahtarini Deactivate sonra Delete."
Bilgi "Not: Secret ekrana hic basilmadi; yalnizca yukaridaki dosyada. Repoya KOYMA."
