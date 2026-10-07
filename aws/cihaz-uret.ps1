<#
  cihaz-uret.ps1 — Wokwi/saha testi icin dennis-cihazlar tablosuna bir cihaz
  kaydi ekler ve firmware'e yapistirilacak CIHAZ_ID + ANAHTAR'i yazar.

  Uretim hattinin yaptigi isin elle karsiligi: cihaz_id + rastgele anahtar
  uretir, tabloya yazar. Firmware (ayarlar.h) bu ciftle POST /de/aku/veri
  (ya da /de/inverter/veri) gonderir; backend _cihaz_dogrula ile dogrular.

  Kullanim (PowerShell, C:\dennis\aws):
    .\cihaz-uret.ps1                      # yeni aku cihazi
    .\cihaz-uret.ps1 -Tip inverter        # yeni inverter cihazi
    .\cihaz-uret.ps1 -MusteriId M-0001    # bir musteriye atanmis
    .\cihaz-uret.ps1 -CihazId AKU-TEST-1  # kimligi kendin ver

  Cikis kodu 0 = eklendi/mevcut, degilse hata.
#>
[CmdletBinding()]
param(
  [ValidateSet("aku", "inverter")] [string]$Tip = "aku",
  [string]$CihazId,
  [string]$MusteriId,
  [string]$Model,
  [double]$KapasiteAh = 100,
  [int]$HucreSayisi = 16,
  [double]$GucKw = 5,
  [string]$Parti,
  [switch]$Zorla,          # var olan cihazin uzerine yaz (anahtari degistirir)
  [string]$Tablo = "dennis-cihazlar",
  [string]$Bolge,
  [string]$Profil
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"

Adim "Hesap dogrulaniyor"
$kim = HesapDogrula
Tamam "hesap $($kim.Account) · bolge $Bolge"

# Kimlik ve anahtar — AKU-DENNIS-<tarih><rastgele> (hepsi rakam, benzersiz seri)
if (-not $CihazId) {
  $onek = if ($Tip -eq "inverter") { "INV" } else { "AKU" }
  $seri = (Get-Date -Format "yyMMdd") + ("{0:D4}" -f (Get-Random -Minimum 0 -Maximum 10000))
  $CihazId = "$onek-DENNIS-$seri"
}
if (-not $Model) { $Model = if ($Tip -eq "inverter") { "DE-INV-5K" } else { "DE-LFP-16S-100" } }
if (-not $Parti) { $Parti = "DE-" + (Get-Date -Format "yyyyMM") }
$anahtar = "DEV-" + [guid]::NewGuid().ToString("N")

Adim "Cihaz tablosu kontrol ediliyor ($Tablo)"
if (-not (Dene dynamodb describe-table --table-name $Tablo)) {
  throw "Tablo '$Tablo' yok. Once .\hazirlik-kur.ps1 calistirin (backend kurulu olmali)."
}

$anahtarDosyasi = JsonDosyasi @{ cihaz_id = @{ S = $CihazId } }
$mevcut = Dene dynamodb get-item --table-name $Tablo --key "file://$anahtarDosyasi"
Remove-Item $anahtarDosyasi -ErrorAction SilentlyContinue
if ($mevcut -and $mevcut.Item -and -not $Zorla) {
  Uyari "Cihaz '$CihazId' zaten var. Anahtari degistirmeden birakildi."
  Bilgi "Uzerine yazmak (yeni anahtar) icin: -Zorla ekleyin, ya da -CihazId ile baska bir ad verin."
  Bilgi "Not: Mevcut anahtari bu betik gosteremez (tabloda sakli). Bilmiyorsan -Zorla ile yenile."
  exit 0
}

# DynamoDB kalem (attribute-value bicimi)
$kalem = [ordered]@{
  cihaz_id      = @{ S = $CihazId }
  anahtar       = @{ S = $anahtar }
  tip           = @{ S = $Tip }
  model         = @{ S = $Model }
  parti         = @{ S = $Parti }
  durum         = @{ S = "sahada" }
  uretim_tarihi = @{ S = (Get-Date -Format "yyyy-MM-dd") }
}
if ($MusteriId) { $kalem["musteri_id"] = @{ S = $MusteriId } }
if ($Tip -eq "aku") {
  $kalem["kapasite_ah"] = @{ N = "$KapasiteAh" }
  $kalem["hucre_sayisi"] = @{ N = "$HucreSayisi" }
} else {
  $kalem["guc_kw"] = @{ N = "$GucKw" }
}

Adim "Cihaz yaziliyor"
$dosya = JsonDosyasi $kalem
Cagir dynamodb put-item --table-name $Tablo --item "file://$dosya" | Out-Null
Remove-Item $dosya -ErrorAction SilentlyContinue
Tamam "cihaz eklendi: $CihazId ($Tip)"

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " Firmware ayarlar.h'ye yapistir:" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ("#define CIHAZ_ID       `"{0}`"" -f $CihazId) -ForegroundColor White
Write-Host ("#define CIHAZ_ANAHTARI `"{0}`"" -f $anahtar) -ForegroundColor White
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Bilgi "Hedef uc: $(if ($Tip -eq 'inverter') { '/de/inverter/veri' } else { '/de/aku/veri' })"
Bilgi "Anahtari guvende tut; acik agda tasindigi icin paylasma."
if (-not $MusteriId) { Bilgi "Bir musteriye atamak icin: -MusteriId <id> ile tekrar uret ya da panelden ata." }
