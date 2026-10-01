<#
.SYNOPSIS
  Sohbet asistanı neden yanıt vermiyor? Hiçbir şeyi değiştirmeden denetler.

.DESCRIPTION
  Uygulama asistan ucuna ulaşamazsa yerel motora düşer ("Genel durum: ..."
  gibi kalıp yanıtlar). Bu betik zincirin her halkasını denetler:

   1) Lambda ayarları — katman (dennis-asistan), zaman aşımı, ortam değişkenleri
   2) Canlı kod — /de/asistan yönlendirmesi var mı
   3) CloudWatch — son 24 saatte asistan satırları (başarılı yanıt ya da hata)
   4) Yayınlanan uygulamalar — paketlerde /de/asistan çağrısı var mı

.EXAMPLE
  .\asistan-teshis.ps1
#>
[CmdletBinding()]
param(
  [int]$Saat = 24,
  [string]$Bolge = "eu-central-1",
  [string]$Profil = $env:AWS_PROFILE
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"
$sorunlar = @()
function Sorun($m) { Write-Host "  ✗ $m" -ForegroundColor Red; $script:sorunlar += $m }

HesapDogrula | Out-Null

# ── 1) Lambda ayarları ────────────────────────────────────────────────────
Adim "1/4 Lambda ayarları ($LAMBDA)"
$yap = Cagir lambda get-function-configuration --function-name $LAMBDA
Bilgi "$($yap.Runtime), $(@($yap.Architectures) -join ','), zaman aşımı $($yap.Timeout) sn, bellek $($yap.MemorySize) MB"
$katman = @($yap.Layers | Where-Object { $_.Arn -match ':layer:dennis-asistan:' })
if ($katman.Count) { Tamam "katman bağlı: $($katman[0].Arn.Split(':')[-1]). sürüm" } else { Sorun "dennis-asistan katmanı Lambda'ya bağlı değil" }
if ([int]$yap.Timeout -lt 30) { Sorun "zaman aşımı $($yap.Timeout) sn (en az 30 olmalı; dil modeli yanıtı birkaç saniye sürer)" } else { Tamam "zaman aşımı yeterli" }
$v = if ($yap.Environment -and $yap.Environment.Variables) { $yap.Environment.Variables } else { [pscustomobject]@{} }
$deger = { param($ad) $p = $v.PSObject.Properties[$ad]; if ($p) { $p.Value } else { $null } }
$saglayici = & $deger "ASISTAN_SAGLAYICI"
Bilgi "sağlayıcı: $(if ($saglayici) { $saglayici } else { '(tanımsız → bedrock)' }), model: $(& $deger 'ASISTAN_MODEL')"
if (-not (& $deger "ASISTAN_KOTA_TABLOSU")) { Sorun "ASISTAN_KOTA_TABLOSU tanımsız (asistan-kur.ps1 tamamlanmamış)" }
if ($saglayici -eq "anthropic") {
  if (& $deger "ANTHROPIC_API_KEY") { Tamam "ANTHROPIC_API_KEY tanımlı (değer gösterilmez)" } else { Sorun "ANTHROPIC_API_KEY tanımsız" }
}
if ($saglayici -eq "gemini") {
  if (& $deger "GEMINI_API_KEY") { Tamam "GEMINI_API_KEY tanımlı (değer gösterilmez)" } else { Sorun "GEMINI_API_KEY tanımsız" }
  $web = & $deger "ASISTAN_WEB_ARAMA"
  if ("$web" -eq "0") { Bilgi "web araması kapalı" }
  else { Bilgi "web araması açık$(if (& $deger 'ASISTAN_WEB_MODEL') { " (arama modeli: $(& $deger 'ASISTAN_WEB_MODEL'))" })" }
}

# ── 2) Canlı kod ──────────────────────────────────────────────────────────
Adim "2/4 Canlı kod"
$gecici = Join-Path ([IO.Path]::GetTempPath()) ("de-teshis-" + [guid]::NewGuid().ToString("N").Substring(0, 8) + ".zip")
try {
  Invoke-WebRequest -Uri (Cagir lambda get-function --function-name $LAMBDA).Code.Location -OutFile $gecici -UseBasicParsing
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $z = [IO.Compression.ZipFile]::OpenRead($gecici)
  try {
    $g = $z.Entries | Where-Object { $_.FullName -eq "lambda_function.py" } | Select-Object -First 1
    $o = New-Object IO.StreamReader($g.Open()); $kod = $o.ReadToEnd(); $o.Dispose()
  } finally { $z.Dispose() }
  if ($kod -match "/de/asistan") { Tamam "/de/asistan yönlendirmesi var" } else { Sorun "canlı kodda /de/asistan yok (Lambda yaması uygulanmamış)" }
} catch { Uyari "canlı kod okunamadı: $($_.Exception.Message)" }
finally { Remove-Item $gecici -ErrorAction SilentlyContinue }

# ── 3) CloudWatch ─────────────────────────────────────────────────────────
Adim "3/4 Son $Saat saatte asistan günlükleri"
$bas = [DateTimeOffset]::UtcNow.AddHours(-$Saat).ToUnixTimeMilliseconds()
$olaylar = @((Dene logs filter-log-events --log-group-name "/aws/lambda/$LAMBDA" --start-time $bas --filter-pattern "asistan").events)
$basarili = @($olaylar | Where-Object { "$($_.message)" -match '^\{"asistan"' })
$hatalar = @($olaylar | Where-Object { "$($_.message)" -notmatch '^\{"asistan"' })
if (-not $olaylar.Count) {
  Sorun "Lambda'ya hiç asistan isteği ulaşmamış — uygulama ucu çağırmıyor olabilir (4. adıma bakın)"
} else {
  if ($basarili.Count) { Tamam "$($basarili.Count) başarılı yanıt" }
  foreach ($e in ($hatalar | Select-Object -Last 8)) {
    $z = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$e.timestamp).LocalDateTime.ToString("dd.MM HH:mm")
    Sorun "$z  $("$($e.message)".Trim())"
  }
}
$cokme = @((Dene logs filter-log-events --log-group-name "/aws/lambda/$LAMBDA" --start-time $bas --filter-pattern "?Task ?timed ?Runtime.ImportModuleError ?MemoryError").events)
foreach ($e in ($cokme | Select-Object -Last 3)) { Sorun "Lambda: $("$($e.message)".Trim())" }

# ── 4) Yayınlanan uygulamalar ─────────────────────────────────────────────
Adim "4/4 Yayınlanan uygulamalar"
$durum = Join-Path $PSScriptRoot "kurulum-durumu.json"
if (-not (Test-Path $durum)) { Uyari "kurulum-durumu.json yok; uygulama adresleri bilinmiyor" }
else {
  $d = Get-Content $durum -Raw | ConvertFrom-Json
  foreach ($p in $d.PSObject.Properties) {
    $adres = if ($p.Value.adres) { $p.Value.adres } else { "https://$($p.Value.alan)" }
    try {
      $html = (Invoke-WebRequest -Uri $adres -UseBasicParsing -TimeoutSec 20).Content
      $ana = [regex]::Match($html, '/assets/index-[^"]+\.js').Value
      $js = (Invoke-WebRequest -Uri ($adres.TrimEnd('/') + $ana) -UseBasicParsing -TimeoutSec 30).Content
      $parcalar = @([regex]::Matches($js, 'assets/[A-Za-z0-9_-]+\.js') | ForEach-Object { $_.Value } | Select-Object -Unique)
      $var = $js -match '/de/asistan'
      foreach ($c in $parcalar) {
        if ($var) { break }
        $var = (Invoke-WebRequest -Uri ($adres.TrimEnd('/') + "/" + $c) -UseBasicParsing -TimeoutSec 30).Content -match '/de/asistan'
      }
      if ($var) { Tamam "$($p.Name): $adres asistan ucunu çağırıyor" }
      else { Sorun "$($p.Name): $adres paketinde /de/asistan yok (VITE_ASISTAN_YOLU olmadan derlenmiş)" }
    } catch { Uyari "$($p.Name): $adres okunamadı ($($_.Exception.Message))" }
  }
}

Write-Host "`n══════════════ SONUÇ ══════════════" -ForegroundColor White
if (-not $sorunlar.Count) { Tamam "Zincirde sorun görünmüyor. Telefonda sayfayı yenileyip (önbellek) tekrar deneyin." }
else {
  Write-Host "Bu çıktının tamamını paylaşın; düzeltmeyi buna göre yapacağım." -ForegroundColor Yellow
}
