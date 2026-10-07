<#
  eslesme-tablo.ps1 - BLE kurulum eslestirme tablosunu (dennis-eslesmeler) olusturur.

  Musteri "Cihaz Ekle" dediginde backend (/de/kurulum/basla) buraya 8 haneli
  tek kullanimlik bir eslesme kodu yazar; cihaz WiFi'ye baglandiktan sonra
  (/de/kurulum/tanit) bu kodla kendini o musteriye baglar. Kod 'ttl' ile
  otomatik silinir (10 dk sonra gecersiz).

  Idempotenttir: tablo varsa dokunmaz, yalnizca eksikse olusturur ve TTL'i acar.

  Kullanim (PowerShell, C:\dennis\aws):
    .\eslesme-tablo.ps1

  Not: Lambda'nin bu tabloya erisimi backend-ayarlari.ps1'deki DennisTablolari
  politikasiyla gelir (dennis-* tablolarini kapsar). Yeni uc kodu ise
  .\hepsini-kur.ps1 (Lambda yamalari) ile canliya gider.
#>
[CmdletBinding()]
param(
  [string]$Tablo = "dennis-eslesmeler",
  [string]$Bolge,
  [string]$Profil
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"

Adim "Hesap dogrulaniyor"
$kim = HesapDogrula
Tamam "hesap $($kim.Account) - bolge $Bolge"

Adim "Eslestirme tablosu kontrol ediliyor ($Tablo)"
if (Dene dynamodb describe-table --table-name $Tablo) {
  Tamam "tablo zaten var"
} else {
  Adim "Tablo olusturuluyor (anahtar: kod)"
  Cagir dynamodb create-table --table-name $Tablo --billing-mode PAY_PER_REQUEST `
    --attribute-definitions "AttributeName=kod,AttributeType=S" `
    --key-schema "AttributeName=kod,KeyType=HASH" | Out-Null
  Cagir dynamodb wait table-exists --table-name $Tablo | Out-Null
  Tamam "tablo olusturuldu"
}

Adim "TTL (otomatik silme) ayari - alan: ttl"
$ttl = Dene dynamodb describe-time-to-live --table-name $Tablo
$durum = $ttl.TimeToLiveDescription.TimeToLiveStatus
if ($durum -eq "ENABLED" -or $durum -eq "ENABLING") {
  Tamam "TTL zaten acik ($durum)"
} else {
  Cagir dynamodb update-time-to-live --table-name $Tablo `
    --time-to-live-specification "Enabled=true,AttributeName=ttl" | Out-Null
  Tamam "TTL acildi (suresi gecen kodlar otomatik silinir)"
}

Write-Host ""
Tamam "Hazir. Simdi Lambda uclarini canliya al: .\hepsini-kur.ps1"
Bilgi "Eslestirme akisi: musteri app 'Cihaz Ekle' -> kod -> telefon BLE ile cihaza {ssid,sifre,kod} yazar."
