<#
  musteri-konum.ps1 — Bir musterinin harita konumunu (lat/lng) ayarlar.
  Saha haritasi adresi degil, sayisal enlem/boylam'i kullanir; koordinati
  olmayan musteri haritada gorunmez.

  Koordinati Google Maps'ten al: adrese sag tikla -> cikan ilk sayi cifti
  (enlem, boylam), or. 41.0082, 28.9784.

  Kullanim (PowerShell, C:\dennis\aws):
    .\musteri-konum.ps1 -Eposta beni@ornek.com -Lat 41.0082 -Lng 28.9784
    .\musteri-konum.ps1 -MusteriId M-0001 -Lat 41.0082 -Lng 28.9784
#>
[CmdletBinding()]
param(
  [string]$MusteriId,
  [string]$Eposta,
  [Parameter(Mandatory = $true)] [double]$Lat,
  [Parameter(Mandatory = $true)] [double]$Lng,
  [string]$MusteriTablosu = "dennis-musteriler",
  [string]$Bolge,
  [string]$Profil
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"

if ($Lat -lt -90 -or $Lat -gt 90)   { throw "Enlem (-Lat) -90..90 arasinda olmali: $Lat" }
if ($Lng -lt -180 -or $Lng -gt 180) { throw "Boylam (-Lng) -180..180 arasinda olmali: $Lng" }

Adim "Hesap dogrulaniyor"
$kim = HesapDogrula
Tamam "hesap $($kim.Account)"

# Musteri kimligini coz
if (-not $MusteriId) {
  if (-not $Eposta) { throw "Ya -MusteriId ya da -Eposta vermelisin." }
  Adim "E-postadan musteri araniyor ($Eposta)"
  $vyol = JsonDosyasi @{ ":e" = @{ S = $Eposta } }
  $sonuc = Cagir dynamodb scan --table-name $MusteriTablosu `
    --filter-expression "email = :e" --expression-attribute-values "file://$vyol"
  Remove-Item $vyol -ErrorAction SilentlyContinue
  $bulunan = @($sonuc.Items)
  if ($bulunan.Count -eq 0) { throw "Bu e-postayla musteri bulunamadi: $Eposta" }
  if ($bulunan.Count -gt 1) {
    Uyari "Birden fazla musteri; ilki kullanilacak:"
    foreach ($m in $bulunan) { Bilgi "$($m.musteri_id.S)  ·  $($m.email.S)" }
  }
  $MusteriId = $bulunan[0].musteri_id.S
  Tamam "musteri: $MusteriId"
}

# Kayit var mi?
$kyol = JsonDosyasi @{ musteri_id = @{ S = $MusteriId } }
$m = Dene dynamodb get-item --table-name $MusteriTablosu --key "file://$kyol"
if (-not ($m -and $m.Item)) {
  Remove-Item $kyol -ErrorAction SilentlyContinue
  throw "Musteri '$MusteriId' bulunamadi."
}

Adim "Konum yaziliyor"
# Kultur bagimsiz nokta ayirici (tr-TR virgul yazar; DynamoDB nokta ister)
$latS = $Lat.ToString([System.Globalization.CultureInfo]::InvariantCulture)
$lngS = $Lng.ToString([System.Globalization.CultureInfo]::InvariantCulture)
$vyol2 = JsonDosyasi @{ ":la" = @{ N = $latS }; ":lo" = @{ N = $lngS } }
Cagir dynamodb update-item --table-name $MusteriTablosu --key "file://$kyol" `
  --update-expression "SET lat = :la, lng = :lo" --expression-attribute-values "file://$vyol2" | Out-Null
Remove-Item $kyol, $vyol2 -ErrorAction SilentlyContinue

Tamam "$MusteriId konumu: $latS, $lngS"
Bilgi "Saha haritasinda bu musterinin noktasi artik gorunur (cihazlari o noktada)."
