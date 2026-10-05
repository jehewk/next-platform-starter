<#
  aku-gecmis-tohumla.ps1 — Bir aku cihazina GERIYE DONUK tarihli, saglikli
  olcum gecmisi yazar (demo/test). Amac: gercekte haftalarca biriken "saglikli
  baseline"i taklit etmek, boylece fizik motoru arizada guven yuzdesi + kalan
  sure + uretim/kullanim sinifi hesaplayabilsin.

  Backend olcum zamanini normalde KENDI damgalar; bu yuzden Wokwi'de 42 gunluk
  gecmis asla olusmaz. Bu betik, gecmisi dogrudan olcum tablosuna backdate
  ederek o eksigi kapatir (yalniz demo/test icindir).

  Kullanim (PowerShell, C:\dennis\aws):
    .\aku-gecmis-tohumla.ps1 -CihazId AKU-WOKWI-CB10
    .\aku-gecmis-tohumla.ps1 -CihazId AKU-WOKWI-CB10 -Adet 30 -Gun 45
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$CihazId,
  [int]$Adet = 30,               # kac olcum
  [int]$Gun = 45,                # kac gune yayilsin (baseline 42 gunu asmali)
  [int]$HucreSayisi = 16,
  [double]$TabanMv = 3340,       # saglikli hucre gerilimi (mV)
  [double]$SaglikliFarkMv = 4,   # saglikli paket ici fark
  [double]$TabanDirenc = 0.0050, # saglikli ic direnc (ohm)
  [string]$OlcumTablosu = "dennis-aku-verileri",
  [string]$CihazTablosu = "dennis-cihazlar",
  [string]$Bolge,
  [string]$Profil
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"
$ci = [System.Globalization.CultureInfo]::InvariantCulture
function N($x) { return ([double]$x).ToString($ci) }

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

Adim "$Adet saglikli olcum yaziliyor ($Gun gune yayili, geriye donuk)"
$rng = [System.Random]::new(20261005)
$simdi = [DateTime]::UtcNow
$arctr = if ($Adet -gt 1) { [double]$Gun / ($Adet - 1) } else { 0 }

for ($i = 0; $i -lt $Adet; $i++) {
  # En eski -> en yeni; zaman geriye donuk
  $gunOnce = $Gun - ($arctr * $i)
  $zaman = $simdi.AddDays(-$gunOnce).ToString("yyyy-MM-ddTHH:mm:ss")

  # Saglikli hucreler: taban +/- kucuk gurultu, fark ~SaglikliFarkMv
  $hucreler = @()
  for ($h = 0; $h -lt $HucreSayisi; $h++) {
    $sapma = ($rng.NextDouble() - 0.5) * $SaglikliFarkMv
    $hucreler += [int][math]::Round($TabanMv + $sapma)
  }
  $enY = [int]($hucreler | Measure-Object -Maximum).Maximum
  $enD = [int]($hucreler | Measure-Object -Minimum).Minimum
  $fark = $enY - $enD
  $minNo = ($hucreler.IndexOf($enD)) + 1
  $gerilim = [math]::Round(($hucreler | Measure-Object -Sum).Sum / 1000.0, 2)
  $soc = [math]::Round(55 + $rng.NextDouble() * 35, 1)             # 55-90
  $akim = [math]::Round(-25 + $rng.NextDouble() * 50, 1)           # -25..+25
  $sic1 = [math]::Round(28 + $rng.NextDouble() * 4, 0)             # 28-32
  $direnc = [math]::Round($TabanDirenc + ($rng.NextDouble() - 0.5) * 0.0004, 5)
  $cevrim = 10 + [int]($i / 6)

  $hucreL = @($hucreler | ForEach-Object { @{ N = N $_ } })
  $sicL = @(@{ N = N $sic1 }, @{ N = N ($sic1 + 1) }, @{ N = N $sic1 }, @{ N = "-40" })

  $kalem = [ordered]@{
    cihaz_id       = @{ S = $CihazId }
    zaman          = @{ S = $zaman }
    gerilim        = @{ N = N $gerilim }
    akim           = @{ N = N $akim }
    soc            = @{ N = N $soc }
    cevrim         = @{ N = N $cevrim }
    hucreler       = @{ L = $hucreL }
    sicakliklar    = @{ L = $sicL }
    max_hucre_mv   = @{ N = N $enY }
    min_hucre_mv   = @{ N = N $enD }
    hucre_farki_mv = @{ N = N $fark }
    min_hucre_no   = @{ N = N $minNo }
    max_sicaklik   = @{ N = N ($sic1 + 1) }
    ic_direnc      = @{ N = N $direnc }
    tohum          = @{ BOOL = $true }    # demo tohumu isareti
  }
  $dyol = JsonDosyasi $kalem
  Cagir dynamodb put-item --table-name $OlcumTablosu --item "file://$dyol" | Out-Null
  Remove-Item $dyol -ErrorAction SilentlyContinue
  if (($i + 1) % 10 -eq 0) { Bilgi "$($i + 1)/$Adet yazildi" }
}
Tamam "$Adet saglikli olcum yazildi ($OlcumTablosu)"

# Cihaz kaydina baseline alanlarini da yaz (backend gecmisten hesaplamiyorsa
# dogrudan okusun diye; hesapliyorsa zararsiz).
Adim "Cihaz kaydina baseline yaziliyor (temel_fark_mv, temel_direnc)"
$vyol = JsonDosyasi @{ ":f" = @{ N = N $SaglikliFarkMv }; ":r" = @{ N = N $TabanDirenc } }
Cagir dynamodb update-item --table-name $CihazTablosu --key "file://$kyol" `
  --update-expression "SET temel_fark_mv = :f, temel_direnc = :r" `
  --expression-attribute-values "file://$vyol" | Out-Null
Remove-Item $kyol, $vyol -ErrorAction SilentlyContinue
Tamam "baseline: temel_fark_mv=$SaglikliFarkMv mV, temel_direnc=$TabanDirenc ohm"

Write-Host ""
Bilgi "Simdi Wokwi'de kirmizi dugmeye basip hucre 7'yi ayristir; fark artik"
Bilgi "saglikli baseline'in (${SaglikliFarkMv} mV) kati olarak gorunur ->"
Bilgi "motor uretim/kullanim sinifi + guven yuzdesi + kalan sure hesaplar."
Bilgi "Panelde cihaz detayini F5 ile yenile."
