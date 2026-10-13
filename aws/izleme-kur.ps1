<#
  izleme-kur.ps1 - Operasyon izleme: Lambda hata alarmi + log saklama.

  Ne yapar (idempotent):
    1) SNS konusu "dennis-operasyon" olusturur, e-postani abone eder
       (e-postana onay linki gelir -> tiklaman gerekir).
    2) CloudWatch alarmi: ana Lambda 5 dk icinde >=1 hata verirse SNS'e
       (yani sana e-posta) bildirir. Ayrica throttling alarmi.
    3) Lambda log grubuna saklama suresi (30 gun) koyar -> loglar sinirsiz
       buyumez, maliyet kontrol altinda. (Loglar zaten CloudWatch'ta;
       lambda_function.py'deki print'ler oraya yazar.)

  Kullanim (PowerShell, C:\dennis\aws):
    .\izleme-kur.ps1 -Eposta sansarkadir3@gmail.com

  Not: "Sessiz cihaz" (uzun sure veri gondermeyen) alarmi ayri bir adimdir
  (zamanlanmis kontrol); bu betik backend hata/uyari izlemesini kurar.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Eposta,
  [int]$SaklamaGun = 30,
  [string]$Bolge,
  [string]$Profil
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"

Adim "Hesap dogrulaniyor"
$kim = HesapDogrula
Tamam "hesap $($kim.Account) - bolge $Bolge - lambda $LAMBDA"

# 1) SNS konusu + e-posta aboneligi
Adim "SNS konusu (dennis-operasyon)"
$konu = (Cagir sns create-topic --name dennis-operasyon).TopicArn
Tamam "konu: $konu"

$abonelikler = (Cagir sns list-subscriptions-by-topic --topic-arn $konu).Subscriptions
$var = $abonelikler | Where-Object { $_.Endpoint -eq $Eposta -and $_.Protocol -eq "email" }
if ($var) {
  Tamam "e-posta zaten abone ($Eposta)"
} else {
  Cagir sns subscribe --topic-arn $konu --protocol email --notification-endpoint $Eposta | Out-Null
  Uyari "$Eposta adresine ONAY e-postasi gonderildi -> icindeki 'Confirm subscription' linkine tikla (yoksa alarm gelmez)."
}

# 2) CloudWatch alarmlari (ana Lambda)
Adim "CloudWatch alarmi: Lambda hatalari"
Cagir cloudwatch put-metric-alarm `
  --alarm-name "dennis-lambda-hata" `
  --alarm-description "Ana Lambda 5 dk icinde hata verdi" `
  --namespace "AWS/Lambda" --metric-name "Errors" `
  --dimensions "Name=FunctionName,Value=$LAMBDA" `
  --statistic Sum --period 300 --evaluation-periods 1 --threshold 1 `
  --comparison-operator GreaterThanOrEqualToThreshold --treat-missing-data notBreaching `
  --alarm-actions $konu | Out-Null
Tamam "dennis-lambda-hata kuruldu"

Adim "CloudWatch alarmi: Lambda throttling"
Cagir cloudwatch put-metric-alarm `
  --alarm-name "dennis-lambda-throttle" `
  --alarm-description "Ana Lambda throttle ediliyor (kapasite/limit)" `
  --namespace "AWS/Lambda" --metric-name "Throttles" `
  --dimensions "Name=FunctionName,Value=$LAMBDA" `
  --statistic Sum --period 300 --evaluation-periods 1 --threshold 1 `
  --comparison-operator GreaterThanOrEqualToThreshold --treat-missing-data notBreaching `
  --alarm-actions $konu | Out-Null
Tamam "dennis-lambda-throttle kuruldu"

# 3) Log saklama suresi
Adim "Lambda log grubu saklama suresi ($SaklamaGun gun)"
$grup = "/aws/lambda/$LAMBDA"
Dene logs create-log-group --log-group-name $grup | Out-Null   # yoksa olustur (varsa hata yutulur)
Cagir logs put-retention-policy --log-group-name $grup --retention-in-days $SaklamaGun | Out-Null
Tamam "saklama $SaklamaGun gun"

Write-Host ""
Tamam "Operasyon izleme kuruldu."
Bilgi "Loglar: CloudWatch > Log groups > $grup"
Bilgi "Alarmlar: CloudWatch > Alarms (dennis-lambda-hata, dennis-lambda-throttle)"
Bilgi "ONEMLI: E-postana gelen SNS onayina tiklamadan alarm bildirimi gelmez."
Bilgi "Sonraki adim (istege bagli): 'sessiz cihaz' alarmi (zamanlanmis kontrol)."
