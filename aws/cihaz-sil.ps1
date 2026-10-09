<#
  cihaz-sil.ps1 - Cihaz(lar)i siler (demo/test akulerini temizlemek icin).

  Once LISTELER (hicbir sey silmez). Silmek icin -Sil ile cihaz_id ver.
  Cihaz kaydiyla birlikte o cihazin olcum gecmisini de siler.

  Kullanim (PowerShell, C:\dennis\aws):
    .\cihaz-sil.ps1                              # tum cihazlari listele
    .\cihaz-sil.ps1 -Sil AKU-WOKWI-CB10          # tek cihaz sil (onay sorar)
    .\cihaz-sil.ps1 -Sil "AKU-1,AKU-2,AKU-3"     # birden fazla (virgulle)
    .\cihaz-sil.ps1 -Sil ... -Zorla              # onay sormadan sil

  DIKKAT: Silme geri alinamaz. Gercek (musteriye bagli) cihazi yanlislikla
  silmemek icin liste musteri_id'yi gosterir.
#>
[CmdletBinding()]
param(
  [string]$Sil,
  [switch]$Zorla,
  [string]$Tablo = "dennis-cihazlar",
  [string]$AkuOlcum = "dennis-aku-verileri",
  [string]$InvOlcum = "dennis-inverter-verileri",
  [string]$Bolge,
  [string]$Profil
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"

Adim "Hesap dogrulaniyor"
$kim = HesapDogrula
Tamam "hesap $($kim.Account) - bolge $Bolge"

# ── Listele ──────────────────────────────────────────────────────────────
Adim "Cihazlar ($Tablo)"
$tarama = Cagir dynamodb scan --table-name $Tablo
$cihazlar = @($tarama.Items)
if ($cihazlar.Count -eq 0) { Tamam "tabloda cihaz yok"; return }

"{0,-26} {1,-9} {2,-9} {3}" -f "CIHAZ_ID", "TIP", "DURUM", "MUSTERI_ID" | Write-Host -ForegroundColor Cyan
foreach ($c in $cihazlar) {
  "{0,-26} {1,-9} {2,-9} {3}" -f `
    $c.cihaz_id.S, $c.tip.S, ($c.durum.S), ($(if ($c.musteri_id) { $c.musteri_id.S } else { "-" })) | Write-Host
}
Write-Host ""

if (-not $Sil) {
  Bilgi "Silmek icin: .\cihaz-sil.ps1 -Sil `"CIHAZ_ID1,CIHAZ_ID2`""
  Bilgi "Musteriye bagli (musteri_id dolu) cihazlari silerken dikkat et."
  return
}

# ── Sil ──────────────────────────────────────────────────────────────────
$hedefler = $Sil.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }
$mevcutIdler = $cihazlar | ForEach-Object { $_.cihaz_id.S }
$yok = $hedefler | Where-Object { $_ -notin $mevcutIdler }
if ($yok) { Uyari "Bu id'ler tabloda yok, atlanacak: $($yok -join ', ')" }
$hedefler = $hedefler | Where-Object { $_ -in $mevcutIdler }
if (-not $hedefler) { Uyari "Silinecek gecerli cihaz yok."; return }

Write-Host "Silinecek: $($hedefler -join ', ')" -ForegroundColor Yellow
if (-not $Zorla) {
  $c = Read-Host "Bu cihazlar ve olcum gecmisleri SILINSIN mi? (E/H)"
  if ($c -notmatch '^[Ee]') { Uyari "Iptal edildi, hicbir sey silinmedi."; return }
}

foreach ($id in $hedefler) {
  Adim "Siliniyor: $id"
  # 1) Olcum gecmisi (iki tabloda da olabilir): cihaza ait kayitlari bul ve sil
  foreach ($olcumTablo in @($AkuOlcum, $InvOlcum)) {
    if (-not (Dene dynamodb describe-table --table-name $olcumTablo)) { continue }
    $anahtarDosyasi = JsonDosyasi @{ ":c" = @{ S = $id } }
    $sorgu = Dene dynamodb query --table-name $olcumTablo `
      --key-condition-expression "cihaz_id = :c" --expression-attribute-values "file://$anahtarDosyasi"
    Remove-Item $anahtarDosyasi -ErrorAction SilentlyContinue
    $olcumler = if ($sorgu) { @($sorgu.Items) } else { @() }
    foreach ($o in $olcumler) {
      $k = JsonDosyasi @{ cihaz_id = @{ S = $id }; zaman = $o.zaman }
      Cagir dynamodb delete-item --table-name $olcumTablo --key "file://$k" | Out-Null
      Remove-Item $k -ErrorAction SilentlyContinue
    }
    if ($olcumler.Count) { Bilgi "$olcumTablo: $($olcumler.Count) olcum silindi" }
  }
  # 2) Cihaz kaydi
  $ck = JsonDosyasi @{ cihaz_id = @{ S = $id } }
  Cagir dynamodb delete-item --table-name $Tablo --key "file://$ck" | Out-Null
  Remove-Item $ck -ErrorAction SilentlyContinue
  Tamam "$id silindi"
}

Write-Host ""
Tamam "Bitti. Panoyu yenile; silinen cihazlar gorunmeyecek."
