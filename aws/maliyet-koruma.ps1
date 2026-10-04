<#
.SYNOPSIS
  AWS maliyetini kontrol altında tutar: uyarılar + kontrolsüz harcamayı önleyen frenler.

.DESCRIPTION
  AWS'de "şu tutarda dur" diye kesin bir harcama tavanı yoktur. Bu betik iki katman kurar:

  UYARI (harcama artınca e-posta):
   1) AWS Budgets     — aylık bütçe; gerçekleşen %50/%80/%100 ve ay sonu tahmini
                        %100'ü geçince e-posta
   2) Anomali tespiti — normal dışı harcama artışında e-posta (Cost Explorer)

  FREN (sistem belirli hızın üstünde çalışamaz):
   3) API Gateway istek sınırı — saniyede en fazla X istek; fazlası 429 ile reddedilir
   4) Lambda eşzamanlılık      — aynı anda en fazla N kopya
   5) DynamoDB en yüksek hız   — isteğe bağlı (on-demand) tablolarda okuma/yazma tavanı
   6) CloudWatch günlükleri    — saklama süresi tanımsız gruplar N gün saklanır
   7) Ölçüm TTL                — eski ölçümler DynamoDB tarafından ücretsiz silinir
                                 (Lambda'ya küçük bir yama gerekir; yedekli yüklenir)

  Sınırlar cihaz sayısı ve gönderim aralığından hesaplanır; cihazların gerçek
  verisi reddedilmesin diye paylı tutulur. Cihaz sayısı artınca betiği yeni
  sayıyla tekrar çalıştırın.

  -Uygula verilmezse hiçbir şey değiştirmez, yalnızca ne yapacağını gösterir.

.EXAMPLE
  .\maliyet-koruma.ps1                                  # rapor (değişiklik yok)
  .\maliyet-koruma.ps1 -Uygula                          # uygula
  .\maliyet-koruma.ps1 -CihazSayisi 500 -AylikButce 800 -Uygula
#>
[CmdletBinding()]
param(
  [ValidateRange(1, 100000)][int]$CihazSayisi = 100,
  [ValidateRange(1, 3600)][int]$GonderimSaniye = 20,
  [ValidateRange(1, 100000)][decimal]$AylikButce = 500,
  [string]$Eposta,
  [ValidateRange(0, 3650)][int]$OlcumSaklamaGun = 180,
  [ValidateSet(1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365)][int]$GunlukSaklamaGun = 30,
  [switch]$Uygula,
  [string]$ApiTaban,
  [string]$Bolge = "eu-central-1",
  [string]$Profil = $env:AWS_PROFILE
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"
if (-not $ApiTaban) { $ApiTaban = $API_TABAN_VARSAYILAN }

$sonuc = [ordered]@{}
function Plan($metin) { Write-Host "  → $metin" -ForegroundColor Yellow }
function Kaydet($ad, $durum) { $sonuc[$ad] = $durum }
function EpostaAl {
  if (-not $script:Eposta) {
    $script:Eposta = (Read-Host "  Uyarı e-postaları hangi adrese gitsin").Trim()
  }
  if ($script:Eposta -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw "Geçersiz e-posta: $script:Eposta" }
  return $script:Eposta
}

HesapDogrula | Out-Null

# ── Sınırların hesabı ─────────────────────────────────────────────────────
$olcumHizi  = $CihazSayisi / $GonderimSaniye                  # cihazlardan gelen istek/sn
$apiHiz     = [int]([math]::Ceiling($olcumHizi * 2) + 20)     # 2 kat pay + paneller için 20
$apiPatlama = $apiHiz * 2
$lambdaEs   = $apiHiz                                          # ~0,5 sn/istek, 2 kat pay
$ddbYaz     = [int][math]::Max(25, [math]::Ceiling($olcumHizi * 5))
$ddbOku     = [int][math]::Max(500, $CihazSayisi * 5)

Adim "Hesaplanan sınırlar ($CihazSayisi cihaz, $GonderimSaniye sn'de bir veri)"
Bilgi ("cihaz verisi        : saniyede ~{0:0.##} istek" -f $olcumHizi)
Bilgi "API istek sınırı    : saniyede $apiHiz (anlık $apiPatlama)"
Bilgi "Lambda eşzamanlılık : $lambdaEs"
Bilgi "DynamoDB tavanı     : saniyede $ddbOku okuma, $ddbYaz yazma birimi (tablo başına)"
Bilgi "Günlük saklama      : $GunlukSaklamaGun gün"
Bilgi ("Ölçüm saklama       : " + $(if ($OlcumSaklamaGun) { "$OlcumSaklamaGun gün" } else { "kapalı" }))
if (-not $Uygula) { Write-Host "  (kuru çalışma — değişiklik yapılmayacak; uygulamak için -Uygula)" -ForegroundColor DarkGray }

# ── 1) Bütçe ──────────────────────────────────────────────────────────────
Adim "1/7 Aylık bütçe uyarısı ($AylikButce USD)"
try {
  $butceAdi = "dennis-aylik"
  $butce = (Dene budgets describe-budget --account-id $HESAP --budget-name $butceAdi --region us-east-1).Budget
  $tanim = @{ BudgetName = $butceAdi; BudgetType = "COST"; TimeUnit = "MONTHLY"
              BudgetLimit = @{ Amount = "$AylikButce"; Unit = "USD" } }
  if ($butce) {
    if ([decimal]$butce.BudgetLimit.Amount -eq $AylikButce) { Tamam "bütçe mevcut: $($butce.BudgetLimit.Amount) USD"; Kaydet "Bütçe" "zaten vardı" }
    else {
      Plan "bütçe $($butce.BudgetLimit.Amount) → $AylikButce USD"
      if ($Uygula) {
        $d = JsonDosyasi $tanim
        Cagir budgets update-budget --account-id $HESAP --new-budget "file://$d" --region us-east-1 | Out-Null
        Tamam "güncellendi"; Kaydet "Bütçe" "$AylikButce USD"
      }
    }
  } else {
    Plan "bütçe oluşturulacak; %50, %80, %100 ve tahmini %100'de e-posta"
    if ($Uygula) {
      $adres = EpostaAl
      $bildirimler = @(
        foreach ($esik in 50, 80, 100) { @{ Notification = @{ NotificationType = "ACTUAL"; ComparisonOperator = "GREATER_THAN"; Threshold = $esik; ThresholdType = "PERCENTAGE" }
                                            Subscribers = @(@{ SubscriptionType = "EMAIL"; Address = $adres }) } }
        @{ Notification = @{ NotificationType = "FORECASTED"; ComparisonOperator = "GREATER_THAN"; Threshold = 100; ThresholdType = "PERCENTAGE" }
           Subscribers = @(@{ SubscriptionType = "EMAIL"; Address = $adres }) }
      )
      $d = JsonDosyasi $tanim; $n = JsonDosyasi $bildirimler
      Cagir budgets create-budget --account-id $HESAP --budget "file://$d" --notifications-with-subscribers "file://$n" --region us-east-1 | Out-Null
      Tamam "oluşturuldu → $adres"; Kaydet "Bütçe" "$AylikButce USD → $adres"
    }
  }
} catch { Uyari $_.Exception.Message; Kaydet "Bütçe" "HATA: $($_.Exception.Message)" }

# ── 2) Anomali tespiti ────────────────────────────────────────────────────
Adim "2/7 Harcama anomalisi uyarısı"
try {
  $izleyici = (Cagir ce get-anomaly-monitors --region us-east-1).AnomalyMonitors |
    Where-Object { $_.MonitorType -eq "DIMENSIONAL" -and $_.MonitorDimension -eq "SERVICE" } | Select-Object -First 1
  $abone = (Cagir ce get-anomaly-subscriptions --region us-east-1).AnomalySubscriptions |
    Where-Object { $_.SubscriptionName -eq "dennis-anomali" } | Select-Object -First 1
  if ($izleyici -and $abone) { Tamam "mevcut"; Kaydet "Anomali uyarısı" "zaten vardı" }
  else {
    Plan "servis bazlı anomali izleme + günlük e-posta (etkisi 5 USD ve üzeri)"
    if ($Uygula) {
      $adres = EpostaAl
      if (-not $izleyici) {
        $d = JsonDosyasi @{ MonitorName = "dennis-servisler"; MonitorType = "DIMENSIONAL"; MonitorDimension = "SERVICE" }
        $arn = (Cagir ce create-anomaly-monitor --anomaly-monitor "file://$d" --region us-east-1).MonitorArn
      } else { $arn = $izleyici.MonitorArn }
      $d = JsonDosyasi @{
        SubscriptionName = "dennis-anomali"; MonitorArnList = @($arn); Frequency = "DAILY"
        Subscribers = @(@{ Address = $adres; Type = "EMAIL" })
        ThresholdExpression = @{ Dimensions = @{ Key = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"; Values = @("5"); MatchOptions = @("GREATER_THAN_OR_EQUAL") } }
      }
      Cagir ce create-anomaly-subscription --anomaly-subscription "file://$d" --region us-east-1 | Out-Null
      Tamam "kuruldu → $adres"; Kaydet "Anomali uyarısı" "kuruldu"
    }
  }
} catch {
  $m = $_.Exception.Message
  if ($m -match 'not enabled|OptInRequired|Cost Explorer') { $m = "Cost Explorer henüz açık değil (Billing > Cost Explorer'ı bir kez açın, 24 saat sonra tekrar deneyin)" }
  Uyari $m; Kaydet "Anomali uyarısı" "HATA: $m"
}

# ── 3) API Gateway istek sınırı ───────────────────────────────────────────
Adim "3/7 API Gateway istek sınırı"
try {
  if ($ApiTaban -notmatch '^https://([a-z0-9]+)\.execute-api\.[a-z0-9-]+\.amazonaws\.com/([^/]+)') { throw "API adresi çözülemedi: $ApiTaban" }
  $apiId = $Matches[1]; $asama = $Matches[2]
  $rest = Dene apigateway get-stage --rest-api-id $apiId --stage-name $asama
  if ($rest) {
    $ayar = if ($rest.methodSettings) { $rest.methodSettings.PSObject.Properties["*/*"].Value } else { $null }
    $simdi = if ($ayar) { "$($ayar.throttlingRateLimit)/$($ayar.throttlingBurstLimit)" } else { "hesap varsayılanı (10000/5000)" }
    if ($ayar -and [double]$ayar.throttlingRateLimit -eq $apiHiz -and [int]$ayar.throttlingBurstLimit -eq $apiPatlama) {
      Tamam "zaten $apiHiz/sn (anlık $apiPatlama)"; Kaydet "API sınırı" "zaten vardı"
    } else {
      Plan "$apiId/${asama}: $simdi → $apiHiz/sn (anlık $apiPatlama)"
      if ($Uygula) {
        Cagir apigateway update-stage --rest-api-id $apiId --stage-name $asama --patch-operations `
          "op=replace,path=/*/*/throttling/rateLimit,value=$apiHiz" "op=replace,path=/*/*/throttling/burstLimit,value=$apiPatlama" | Out-Null
        Tamam "uygulandı"; Kaydet "API sınırı" "$apiHiz/sn"
      }
    }
  } else {
    $v2 = (Cagir apigatewayv2 get-stage --api-id $apiId --stage-name $asama)
    $r = $v2.DefaultRouteSettings
    if ($r -and [double]$r.ThrottlingRateLimit -eq $apiHiz -and [int]$r.ThrottlingBurstLimit -eq $apiPatlama) {
      Tamam "zaten $apiHiz/sn (anlık $apiPatlama)"; Kaydet "API sınırı" "zaten vardı"
    } else {
      Plan "$apiId/$asama (HTTP API) → $apiHiz/sn (anlık $apiPatlama)"
      if ($Uygula) {
        Cagir apigatewayv2 update-stage --api-id $apiId --stage-name $asama `
          --default-route-settings "ThrottlingBurstLimit=$apiPatlama,ThrottlingRateLimit=$apiHiz" | Out-Null
        Tamam "uygulandı"; Kaydet "API sınırı" "$apiHiz/sn"
      }
    }
  }
} catch { Uyari $_.Exception.Message; Kaydet "API sınırı" "HATA: $($_.Exception.Message)" }

# ── 4) Lambda eşzamanlılık ────────────────────────────────────────────────
Adim "4/7 Lambda eşzamanlılık sınırı ($LAMBDA)"
try {
  $hesapLimiti = [int](Cagir lambda get-account-settings).AccountLimit.ConcurrentExecutions
  $mevcut = (Dene lambda get-function-concurrency --function-name $LAMBDA).ReservedConcurrentExecutions
  $enFazla = $hesapLimiti - 100   # AWS en az 100'ün ayrılmamış kalmasını ister
  if ($enFazla -lt 5) {
    Tamam "hesabın toplam Lambda sınırı zaten $hesapLimiti (yeni hesap); bu doğal bir fren"
    Bilgi "AWS en az 100'ün serbest kalmasını istediği için ayrıca sınır konamaz."
    Kaydet "Lambda sınırı" "hesap sınırı $hesapLimiti"
  } else {
    $hedef = [math]::Min($lambdaEs, $enFazla)
    if ($mevcut -eq $hedef) { Tamam "zaten $hedef"; Kaydet "Lambda sınırı" "zaten vardı" }
    else {
      Plan ("eşzamanlılık: " + $(if ($null -ne $mevcut) { $mevcut } else { "sınırsız" }) + " → $hedef")
      if ($Uygula) {
        Cagir lambda put-function-concurrency --function-name $LAMBDA --reserved-concurrent-executions $hedef | Out-Null
        Tamam "uygulandı"; Kaydet "Lambda sınırı" "$hedef"
      }
    }
  }
} catch { Uyari $_.Exception.Message; Kaydet "Lambda sınırı" "HATA: $($_.Exception.Message)" }

# ── 5) DynamoDB tavanı ────────────────────────────────────────────────────
Adim "5/7 DynamoDB en yüksek hız"
$tablolar = @()
try {
  $tablolar = @((Cagir dynamodb list-tables).TableNames)
  $degisen = 0
  foreach ($ad in $tablolar) {
    $t = (Cagir dynamodb describe-table --table-name $ad).Table
    $mod = if ($t.BillingModeSummary) { $t.BillingModeSummary.BillingMode } else { "PROVISIONED" }
    if ($mod -ne "PAY_PER_REQUEST") { Tamam "${ad}: sabit kapasite (zaten sınırlı)"; continue }
    $o = $t.OnDemandThroughput
    if ($o -and [int]$o.MaxReadRequestUnits -eq $ddbOku -and [int]$o.MaxWriteRequestUnits -eq $ddbYaz) { Tamam "${ad}: zaten sınırlı"; continue }
    if ($t.TableStatus -ne "ACTIVE") { Uyari "${ad}: tablo $($t.TableStatus); sonra tekrar deneyin"; continue }
    Plan "${ad}: okuma $ddbOku/sn, yazma $ddbYaz/sn tavanı"
    if ($Uygula) {
      Cagir dynamodb update-table --table-name $ad --on-demand-throughput "MaxReadRequestUnits=$ddbOku,MaxWriteRequestUnits=$ddbYaz" | Out-Null
      $degisen++
    }
  }
  if ($Uygula) { Kaydet "DynamoDB tavanı" "$($tablolar.Count) tablo, $degisen güncellendi" }
} catch {
  $m = $_.Exception.Message
  if ($m -match 'on-demand-throughput|Unknown options') { $m = "AWS CLI eski; https://aws.amazon.com/cli adresinden güncelleyin" }
  Uyari $m; Kaydet "DynamoDB tavanı" "HATA: $m"
}

# ── 6) Günlük saklama süresi ──────────────────────────────────────────────
Adim "6/7 CloudWatch günlük saklama ($GunlukSaklamaGun gün)"
try {
  $sinirsiz = @((Cagir logs describe-log-groups).logGroups | Where-Object { -not $_.retentionInDays })
  if (-not $sinirsiz.Count) { Tamam "tüm günlük gruplarının saklama süresi var"; Kaydet "Günlük saklama" "zaten vardı" }
  foreach ($g in $sinirsiz) {
    Plan "$($g.logGroupName): sonsuz → $GunlukSaklamaGun gün"
    if ($Uygula) { Cagir logs put-retention-policy --log-group-name $g.logGroupName --retention-in-days $GunlukSaklamaGun | Out-Null }
  }
  if ($Uygula -and $sinirsiz.Count) { Kaydet "Günlük saklama" "$($sinirsiz.Count) grup → $GunlukSaklamaGun gün" }
} catch { Uyari $_.Exception.Message; Kaydet "Günlük saklama" "HATA: $($_.Exception.Message)" }

# ── 7) Ölçüm TTL ──────────────────────────────────────────────────────────
Adim "7/7 Eski ölçümlerin otomatik silinmesi"
if (-not $OlcumSaklamaGun) {
  Bilgi "kapalı (-OlcumSaklamaGun 0)"
  if ($Uygula) { LambdaOrtamGuncelle @{ OLCUM_SAKLAMA_GUN = "0" } | Out-Null }
} else {
  try {
    $PYTHON = PythonBul
    if (-not $PYTHON) { throw "Python bulunamadı (python.org'dan kurun); bu adım atlandı." }
    # Ölçüm tablosu canlı koddan: /de/cihaz/gecmis işleyicisinin okuduğu tablo
    $is = Join-Path ([IO.Path]::GetTempPath()) ("de-ttl-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
    New-Item -ItemType Directory -Force -Path $is | Out-Null
    $zip = Join-Path $is "canli.zip"
    Invoke-WebRequest -Uri (Cagir lambda get-function --function-name $LAMBDA).Code.Location -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath (Join-Path $is "k") -Force
    $arac = Join-Path (Join-Path $PSScriptRoot "ekler") "yamala.py"
    $eski = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $cikti = & $PYTHON[0] @(@($PYTHON | Select-Object -Skip 1) + @($arac, "--olcum-tablolari", (Join-Path (Join-Path $is "k") "lambda_function.py"))) 2>&1
    $kod = $LASTEXITCODE; $ErrorActionPreference = $eski
    Remove-Item $is -Recurse -Force -ErrorAction SilentlyContinue
    if ($kod -ne 0) { throw "Ölçüm tablosu belirlenemedi: $(($cikti | Out-String).Trim())" }
    $bilgi = ($cikti | Where-Object { "$_".StartsWith("{") } | Select-Object -Last 1) | ConvertFrom-Json
    # Gerçek backend akü ve inverter ölçümlerini ayrı tablolarda tutar; ikisinde de TTL açılır
    $olcumTablolari = @($bilgi.adlar)
    if (-not $olcumTablolari.Count) { throw "Ölçüm tablosunun adı çözülemedi (kodda: $($bilgi.ifade))." }
    if (-not $tablolar.Count) { $tablolar = @((Cagir dynamodb list-tables).TableNames) }
    foreach ($t in $olcumTablolari) { if ($tablolar -notcontains $t) { throw "Ölçüm tablosu '$t' bu bölgede yok." } }
    Tamam "ölçüm tabloları: $($olcumTablolari -join ', ')"

    $alan = "silinme"
    foreach ($t in $olcumTablolari) {
      $ttl = (Cagir dynamodb describe-time-to-live --table-name $t).TimeToLiveDescription
      if ($ttl.TimeToLiveStatus -in @("ENABLED", "ENABLING")) { $alan = $ttl.AttributeName; Tamam "${t}: TTL açık (alan: $alan)" }
      else { Plan "$t tablosunda TTL açılacak (alan: $alan)" }
    }
    Plan "Lambda yaması: ölçüm kayıtlarına silinme zamanı eklenir (zaten varsa atlanır)"
    Plan "Lambda ortamı: OLCUM_SAKLAMA_GUN=$OlcumSaklamaGun, OLCUM_TTL_ALANI=$alan"

    if ($Uygula) {
      & (Join-Path $PSScriptRoot "hepsini-kur.ps1") -Atla backend, hesap, web -Onayla -TarayiciAcma -ApiTaban $ApiTaban -Bolge $Bolge -Profil $Profil
      if ($LASTEXITCODE) { throw "Lambda yaması uygulanamadı; yukarıdaki çıktıya bakın." }
      foreach ($t in $olcumTablolari) {
        $ttl = (Cagir dynamodb describe-time-to-live --table-name $t).TimeToLiveDescription
        if ($ttl.TimeToLiveStatus -notin @("ENABLED", "ENABLING")) {
          Cagir dynamodb update-time-to-live --table-name $t --time-to-live-specification "Enabled=true,AttributeName=$alan" | Out-Null
          Tamam "${t}: TTL açıldı"
        }
      }
      if (LambdaOrtamGuncelle @{ OLCUM_SAKLAMA_GUN = "$OlcumSaklamaGun"; OLCUM_TTL_ALANI = $alan }) { Tamam "Lambda ortamı güncellendi" }
      else { Tamam "Lambda ortamı zaten güncel" }
      Kaydet "Ölçüm TTL" "$($olcumTablolari -join ', '), $OlcumSaklamaGun gün"
    }
  } catch { Uyari $_.Exception.Message; Kaydet "Ölçüm TTL" "HATA: $($_.Exception.Message)" }
}

# ── Özet ──────────────────────────────────────────────────────────────────
Write-Host "`n══════════════ ÖZET ══════════════" -ForegroundColor White
if (-not $Uygula) {
  Write-Host "Kuru çalışma: hiçbir şey değiştirilmedi. Uygulamak için: .\maliyet-koruma.ps1 -Uygula" -ForegroundColor Yellow
  foreach ($k in $sonuc.Keys) { Write-Host ("  {0,-18} {1}" -f $k, $sonuc[$k]) }
  exit 0
}
foreach ($k in $sonuc.Keys) {
  $renk = if ("$($sonuc[$k])" -like "HATA*") { "Red" } else { "Green" }
  Write-Host ("  {0,-18} {1}" -f $k, $sonuc[$k]) -ForegroundColor $renk
}
Bilgi "Not: TTL yalnızca bundan sonra yazılan ölçümleri siler; öncekiler kalır."
Bilgi "Cihaz sayısı artınca: .\maliyet-koruma.ps1 -CihazSayisi <yeni sayı> -Uygula"
if (@($sonuc.Values | Where-Object { "$_" -like "HATA*" }).Count) { exit 1 }
exit 0
