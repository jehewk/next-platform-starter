<#
  cihaz-ata.ps1 — Var olan bir cihazi bir musteriye atar (musteri_id yazar).
  Cihaz anahtarini DEGISTIRMEZ; Wokwi'yi tekrar duzenlemen gerekmez.

  Musteri kimligini biliyorsan dogrudan ver; bilmiyorsan e-postandan buldurur.

  Kullanim (PowerShell, C:\dennis\aws):
    .\cihaz-ata.ps1 -CihazId AKU-WOKWI-CB10 -Eposta beni@ornek.com
    .\cihaz-ata.ps1 -CihazId AKU-WOKWI-CB10 -MusteriId M-0001
    .\cihaz-ata.ps1 -CihazId AKU-WOKWI-CB10 -Kaldir        # atamayi geri al
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$CihazId,
  [string]$MusteriId,
  [string]$Eposta,
  [switch]$Kaldir,
  [string]$CihazTablosu = "dennis-cihazlar",
  [string]$MusteriTablosu = "dennis-musteriler",
  [string]$Bolge,
  [string]$Profil
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"

Adim "Hesap dogrulaniyor"
$kim = HesapDogrula
Tamam "hesap $($kim.Account)"

# Cihaz var mi?
$kyol = JsonDosyasi @{ cihaz_id = @{ S = $CihazId } }
$cihaz = Dene dynamodb get-item --table-name $CihazTablosu --key "file://$kyol"
if (-not ($cihaz -and $cihaz.Item)) {
  Remove-Item $kyol -ErrorAction SilentlyContinue
  throw "Cihaz '$CihazId' bulunamadi. Once .\cihaz-uret.ps1 ile uret."
}

# Atamayi kaldir
if ($Kaldir) {
  Adim "Atama kaldiriliyor"
  Cagir dynamodb update-item --table-name $CihazTablosu --key "file://$kyol" `
    --update-expression "REMOVE musteri_id" | Out-Null
  Remove-Item $kyol -ErrorAction SilentlyContinue
  Tamam "$CihazId artik hic bir musteriye atanmamis durumda."
  exit 0
}

# Musteri kimligini coz
if (-not $MusteriId) {
  if (-not $Eposta) { throw "Ya -MusteriId ya da -Eposta vermelisin." }
  Adim "E-postadan musteri araniyor ($Eposta)"
  $vyol = JsonDosyasi @{ ":e" = @{ S = $Eposta } }
  $sonuc = Cagir dynamodb scan --table-name $MusteriTablosu `
    --filter-expression "email = :e" --expression-attribute-values "file://$vyol"
  Remove-Item $vyol -ErrorAction SilentlyContinue
  $bulunan = @($sonuc.Items)
  if ($bulunan.Count -eq 0) {
    throw "Bu e-postayla musteri bulunamadi: $Eposta. Musteri uygulamasindan kayit oldugundan emin ol."
  }
  if ($bulunan.Count -gt 1) {
    Uyari "Birden fazla musteri bulundu; ilki kullanilacak:"
    foreach ($m in $bulunan) { Bilgi "$($m.musteri_id.S)  ·  $($m.email.S)" }
  }
  $MusteriId = $bulunan[0].musteri_id.S
  Tamam "musteri: $MusteriId"
}

Adim "Cihaz musteriye atandi"
# Musteri uygulamasi yalnizca durum in (aktif,uyari,arizali) cihazlari gosterir.
# Bir musteriye atanan cihaz sahadadir -> durumu 'sahada'/'depoda'/bos ise 'aktif'
# yapilir (BLE eslestirmesinin yaptigi is). Mevcut uyari/arizali korunur.
$mevcutDurum = if ($cihaz.Item.durum) { $cihaz.Item.durum.S } else { "" }
$deg = @{ ":m" = @{ S = $MusteriId } }
$ifade = "SET musteri_id = :m"
if ($mevcutDurum -notin @("aktif", "uyari", "arizali")) {
  $ifade += ", durum = :d"
  $deg[":d"] = @{ S = "aktif" }
}
$vyol2 = JsonDosyasi $deg
Cagir dynamodb update-item --table-name $CihazTablosu --key "file://$kyol" `
  --update-expression $ifade --expression-attribute-values "file://$vyol2" | Out-Null
Remove-Item $kyol, $vyol2 -ErrorAction SilentlyContinue

Tamam "$CihazId  ->  musteri $MusteriId$(if ($deg.ContainsKey(':d')) { ' (durum: aktif)' } else { '' })"
Bilgi "Artik uretici panelinde 'Musteriler' altinda ve bu musterinin uygulamasinda gorunur."
Bilgi "Musteri uygulamasinda gorunmek icin durum aktif/uyari/arizali olmali (ayarlandi)."
