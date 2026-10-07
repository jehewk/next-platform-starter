<#
  kurulum-kodu.ps1 - Bir musteri icin BLE eslesme kodu uretir (elle test icin).

  Normalde bu kodu musteri uygulamasindaki "Cihaz Ekle" otomatik alir. Bu betik
  ayni kodu uretici tarafindan uretip dogrudan dennis-eslesmeler tablosuna yazar;
  boylece nRF Connect gibi bir araci kullanarak eslestirmeyi elle test edebilirsin.

  Kod tek kullanimliktir ve 10 dk sonra TTL ile silinir.

  Kullanim (PowerShell, C:\dennis\aws):
    .\kurulum-kodu.ps1 -Eposta sansarkadir3@gmail.com
    .\kurulum-kodu.ps1 -MusteriId MST-3397      # musteri_id biliniyorsa

  Cihaza (nRF ile) 6e400002 karakteristigine su JSON yazilir:
    {"ssid":"WIFI_ADI","sifre":"WIFI_SIFRESI","kod":"<bu kod>"}
#>
[CmdletBinding()]
param(
  [string]$Eposta,
  [string]$MusteriId,
  [int]$GecerlilikDk = 10,
  [string]$Tablo = "dennis-eslesmeler",
  [string]$MusteriTablo = "dennis-musteriler",
  [string]$Bolge,
  [string]$Profil
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"

Adim "Hesap dogrulaniyor"
$kim = HesapDogrula
Tamam "hesap $($kim.Account) - bolge $Bolge"

# musteri_id'yi coz (e-postadan tara, yoksa parametre)
if (-not $MusteriId) {
  if (-not $Eposta) { throw "-Eposta ya da -MusteriId verin." }
  $ep = $Eposta.Trim().ToLowerInvariant()
  Adim "Musteri araniyor (e-posta: $ep)"
  $filtre = JsonDosyasi @{ ":e" = @{ S = $ep } }
  $sonuc = Cagir dynamodb scan --table-name $MusteriTablo `
    --filter-expression "email = :e" --expression-attribute-values "file://$filtre"
  Remove-Item $filtre -ErrorAction SilentlyContinue
  $oge = @($sonuc.Items)[0]
  if (-not $oge) { throw "Bu e-postayla musteri bulunamadi: $ep (once musteri kaydi olmali)." }
  $MusteriId = $oge.musteri_id.S
  Tamam "musteri_id: $MusteriId"
}

# 8 haneli kod (karisabilen 0/O/1/I/l yok)
$abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray()
$kod = -join (1..8 | ForEach-Object { $abc | Get-Random })
$simdi = [int][double]::Parse((Get-Date -UFormat %s))
$ttl = $simdi + ($GecerlilikDk * 60)

Adim "Eslesme kodu yaziliyor ($Tablo)"
$kalem = JsonDosyasi @{
  kod        = @{ S = $kod }
  musteri_id = @{ S = $MusteriId }
  olusturma  = @{ N = "$simdi" }
  ttl        = @{ N = "$ttl" }
}
Cagir dynamodb put-item --table-name $Tablo --item "file://$kalem" | Out-Null
Remove-Item $kalem -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "==================== ESLESME KODU ====================" -ForegroundColor Cyan
Write-Host "  $kod" -ForegroundColor White
Write-Host "  musteri: $MusteriId   gecerli: $GecerlilikDk dk" -ForegroundColor Gray
Write-Host "======================================================" -ForegroundColor Cyan
Bilgi "nRF Connect -> cihaza baglan -> 6e400002 karakteristigine yaz:"
Bilgi "  {`"ssid`":`"WIFI_ADI`",`"sifre`":`"WIFI_SIFRESI`",`"kod`":`"$kod`"}"
Bilgi "Cihaz WiFi'ye baglanip /de/kurulum/tanit ile kendini musteriye baglar; dashboard'da gorunur."
