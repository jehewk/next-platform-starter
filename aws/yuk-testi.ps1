<#
  yuk-testi.ps1 - Canli API'ye KONTROLLU yuk/gecikme probu (senin elinle).

  DIKKAT: Bu, canli uretim API'sine gercek istek gonderir. Agresif degerler
  (binlerce istek) AWS maliyeti dogurur ve kotuye-kullanim tespitini
  tetikleyebilir. KUCUK basla. Yalnizca KENDI sistemine calistir.

  Varsayilan hedef: /de/kaptcha (kimlik istemez, hafif okuma). Olcum/yazma
  uclarina yuk BINDIRME (gercek veriyi kirletir).

  Kullanim (PowerShell):
    .\yuk-testi.ps1                       # 100 istek, /de/kaptcha
    .\yuk-testi.ps1 -Istek 500 -Uc /de/kaptcha
    .\yuk-testi.ps1 -Taban https://xoja2a8sx5.execute-api.eu-central-1.amazonaws.com/prod

  Cikti: basari/hata sayisi + gecikme (min/ort/p95/max). Hata orani yuksekse
  ya da gecikme patlıyorsa -> API Gateway throttle / Lambda eszamanlilik /
  WAF ayarlarina bak (GUVENLIK.md).

  Not: PowerShell 5.1'de gercek ESZAMANLI yuk sinirli. Ciddi stres icin k6
  onerilir (asagida ornek). Bu betik sirali gecikme/hata probudur.
#>
[CmdletBinding()]
param(
  [string]$Taban = "https://xoja2a8sx5.execute-api.eu-central-1.amazonaws.com/prod",
  [string]$Uc = "/de/kaptcha",
  [int]$Istek = 100,
  [int]$ZamanAsimiSn = 15
)

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$adres = "$Taban$Uc"
Write-Host "Hedef: $adres  ($Istek istek)" -ForegroundColor Cyan
Write-Host "UYARI: canli sisteme istek gidiyor. Ctrl+C ile durdur." -ForegroundColor Yellow

$gecikmeler = New-Object System.Collections.Generic.List[double]
$basari = 0; $hata = 0
$kodlar = @{}
for ($i = 1; $i -le $Istek; $i++) {
  $t = [Diagnostics.Stopwatch]::StartNew()
  try {
    $y = Invoke-WebRequest -Uri $adres -Method GET -TimeoutSec $ZamanAsimiSn -UseBasicParsing
    $t.Stop(); $gecikmeler.Add($t.Elapsed.TotalMilliseconds); $basari++
    $kodlar["$($y.StatusCode)"] = 1 + ($kodlar["$($y.StatusCode)"] | ForEach-Object { $_ })
  } catch {
    $t.Stop(); $hata++
    $kod = try { [int]$_.Exception.Response.StatusCode.value__ } catch { "baglanti" }
    $kodlar["$kod"] = 1 + ($kodlar["$kod"] | ForEach-Object { $_ })
  }
  if ($i % 25 -eq 0) { Write-Host "  $i/$Istek ..." -ForegroundColor DarkGray }
}

function Yuzdelik($liste, $p) {
  if ($liste.Count -eq 0) { return 0 }
  $s = $liste | Sort-Object
  $idx = [Math]::Ceiling(($p / 100.0) * $s.Count) - 1
  if ($idx -lt 0) { $idx = 0 }
  return [Math]::Round($s[$idx], 1)
}

Write-Host ""
Write-Host "==================== SONUC ====================" -ForegroundColor Cyan
Write-Host ("  basari: {0}   hata: {1}   ({2:P0} hata)" -f $basari, $hata, ($(if($Istek){$hata/$Istek}else{0}))) -ForegroundColor White
if ($gecikmeler.Count) {
  $ort = [Math]::Round(($gecikmeler | Measure-Object -Average).Average, 1)
  $min = [Math]::Round(($gecikmeler | Measure-Object -Minimum).Minimum, 1)
  $max = [Math]::Round(($gecikmeler | Measure-Object -Maximum).Maximum, 1)
  Write-Host ("  gecikme ms -> min {0}  ort {1}  p95 {2}  max {3}" -f $min, $ort, (Yuzdelik $gecikmeler 95), $max) -ForegroundColor White
}
Write-Host "  HTTP kodlari: $(( $kodlar.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" } ) -join '  ')" -ForegroundColor White
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ciddi eszamanli stres icin k6 (ayri kur):" -ForegroundColor Gray
Write-Host "  k6 run - <<'EOF'" -ForegroundColor DarkGray
Write-Host "  import http from 'k6/http'; export const options={vus:20,duration:'30s'};" -ForegroundColor DarkGray
Write-Host "  export default()=>{ http.get('$adres'); }" -ForegroundColor DarkGray
Write-Host "  EOF" -ForegroundColor DarkGray
