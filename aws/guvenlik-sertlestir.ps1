<#
  guvenlik-sertlestir.ps1 - Canli sertlestirme: API Gateway throttle + WAF
  (IP rate-limit) + Lambda reserved concurrency. Idempotenttir.

  Ne yapar:
    1) API Gateway stage'ine varsayilan method throttle (rate/sn + burst).
    2) WAFv2 (REGIONAL) WebACL + IP basina rate-based kural; API stage'ine baglar.
    3) Ana Lambda'ya reserved concurrency (hesap limiti elverirse; best-effort).

  Guvenlik BASLIKLARI (CSP/HSTS/...) ayridir: panel-*/public/customHttp.yml
  ile gelir, web yeniden yayinlaninca (hepsini-kur.ps1 -Atla ...) etkinlesir.

  Kullanim (PowerShell, C:\dennis\aws):
    .\guvenlik-sertlestir.ps1
    .\guvenlik-sertlestir.ps1 -RateSn 50 -Burst 100 -IpDk5Limit 3000 -Eszaman 50
#>
[CmdletBinding()]
param(
  [string]$ApiTaban,                 # bos ise ortak.ps1'deki varsayilan
  [int]$RateSn = 50,                 # istek/sn (varsayilan method)
  [int]$Burst = 100,                 # ani patlama
  [int]$IpDk5Limit = 3000,           # WAF: IP basina 5 dk'da istek (min 100)
  [int]$Eszaman = 50,                # Lambda reserved concurrency
  [string]$Bolge,
  [string]$Profil
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"

Adim "Hesap dogrulaniyor"
$kim = HesapDogrula
Tamam "hesap $($kim.Account) - bolge $Bolge"

if (-not $ApiTaban) { $ApiTaban = $API_TABAN_VARSAYILAN }
# https://<id>.execute-api.<bolge>.amazonaws.com/<stage>
if ($ApiTaban -notmatch 'https://([a-z0-9]+)\.execute-api\.[^/]+/([^/]+)') {
  throw "API taban beklenen bicimde degil: $ApiTaban"
}
$apiId = $Matches[1]; $stage = $Matches[2]
Tamam "REST API: $apiId  stage: $stage"

# ── 1) API Gateway throttle ──────────────────────────────────────────────
Adim "1/3 API Gateway throttle (rate=$RateSn/sn, burst=$Burst)"
Cagir apigateway update-stage --rest-api-id $apiId --stage-name $stage `
  --patch-operations `
    "op=replace,path=/*/*/throttling/rateLimit,value=$RateSn" `
    "op=replace,path=/*/*/throttling/burstLimit,value=$Burst" | Out-Null
Tamam "throttle uygulandi"

# ── 2) WAF (REGIONAL) IP rate-based ──────────────────────────────────────
Adim "2/3 WAF: IP basina rate-based kural (5 dk'da $IpDk5Limit)"
$aclAdi = "dennis-waf"
$gorunur = @{ SampledRequestsEnabled = $true; CloudWatchMetricsEnabled = $true; MetricName = "dennisWaf" }
$kurallar = @(@{
  Name = "ip-rate"; Priority = 1
  Statement = @{ RateBasedStatement = @{ Limit = $IpDk5Limit; AggregateKeyType = "IP" } }
  Action = @{ Block = @{} }
  VisibilityConfig = @{ SampledRequestsEnabled = $true; CloudWatchMetricsEnabled = $true; MetricName = "ipRate" }
})

$mevcut = (Dene wafv2 list-web-acls --scope REGIONAL --region $Bolge)
$acl = $null
if ($mevcut) { $acl = @($mevcut.WebACLs) | Where-Object { $_.Name -eq $aclAdi } | Select-Object -First 1 }
if ($acl) {
  Tamam "WebACL zaten var ($aclAdi)"
  $aclArn = $acl.ARN
} else {
  $rulesDosya = JsonDosyasi $kurallar
  $gorDosya = JsonDosyasi $gorunur
  $olusturulan = Cagir wafv2 create-web-acl --name $aclAdi --scope REGIONAL --region $Bolge `
    --default-action "Allow={}" --rules "file://$rulesDosya" --visibility-config "file://$gorDosya"
  Remove-Item $rulesDosya, $gorDosya -ErrorAction SilentlyContinue
  $aclArn = $olusturulan.Summary.ARN
  Tamam "WebACL olusturuldu"
}

$stageArn = "arn:aws:apigateway:${Bolge}::/restapis/$apiId/stages/$stage"
Adim "WAF -> API stage'ine baglaniyor"
# Yeni olusturulan WebACL AWS'de yayilana kadar associate reddedilebilir;
# once bagli mi diye bak, degilse kisa bekleme ile birkac kez dene.
$zatenBagli = $false
$mevcutBag = (Dene wafv2 get-web-acl-for-resource --resource-arn $stageArn --region $Bolge)
if ($mevcutBag -and $mevcutBag.WebACL -and $mevcutBag.WebACL.ARN -eq $aclArn) { $zatenBagli = $true }

if ($zatenBagli) {
  Tamam "zaten bagli"
} else {
  $bagliOldu = $false
  foreach ($bekle in 0, 3, 6, 10) {
    if ($bekle -gt 0) { Start-Sleep -Seconds $bekle }
    if (Dene wafv2 associate-web-acl --web-acl-arn $aclArn --resource-arn $stageArn --region $Bolge) {
      $bagliOldu = $true; break
    }
  }
  if ($bagliOldu) {
    Tamam "baglandi"
  } else {
    Uyari "Baglanamadi. Elle: wafv2 associate-web-acl --web-acl-arn $aclArn --resource-arn $stageArn --region $Bolge"
  }
}

# ── 3) Lambda reserved concurrency (best-effort) ─────────────────────────
Adim "3/3 Lambda reserved concurrency ($Eszaman)"
if (Dene lambda put-function-concurrency --function-name $LAMBDA --reserved-concurrent-executions $Eszaman) {
  Tamam "reserved concurrency = $Eszaman"
} else {
  Uyari "Ayarlanamadi (hesap eszamanlilik limiti dusuk olabilir; AWS en az 100 ayrilmamis ister). Atlandi."
}

Write-Host ""
Tamam "Sertlestirme tamam."
Bilgi "Guvenlik basliklari icin: panelleri yeniden yayinla (hepsini-kur.ps1 -Atla backend,hesap,lambda)."
Bilgi "WAF/throttle: CloudWatch > WAF & Shield / API Gateway metriklerinden izlenir."
Bilgi "Not: throttle cok dusukse mesru trafigi de keser; cihaz sayin artinca RateSn'i yukselt."
