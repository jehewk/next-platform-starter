<#
.SYNOPSIS
  Müşteri kayıt başvurusu "Kayit olusturulamadi" hatası veriyorsa nedenini bulur
  ve -Duzelt ile giderir.

.DESCRIPTION
  Backend (/de/musteri/kayit) müşteri kaydını yazar, ardından Cognito'da
  hesap açar (sign_up). Hesap açılamazsa kaydı geri alır ve genel
  "Kayit olusturulamadi" mesajı döner; asıl neden CloudWatch'a yazılır
  ("kayit hatasi: ..."). Bu betik:

   1) CloudWatch'taki son kayıt hatalarını gösterir
   2) Cognito havuzunu ve istemcisini sign_up açısından denetler:
      - kendi kendine kayıt (self sign-up) açık mı
      - custom:rol ve custom:musteri_id öznitelikleri var mı
      - istemci bu öznitelikleri yazabiliyor / okuyabiliyor mu
      - istemcinin gizli anahtarı (secret) var mı
      - e-posta dışında zorunlu öznitelik var mı
      - ön kayıt (pre sign-up) Lambda tetikleyicisi var mı
   3) -Duzelt verilirse güvenle düzeltilebilenleri düzeltir. Değiştirmeden
      önce havuz ve istemci ayarları aws\yedekler\ altına kaydedilir.

  -Duzelt olmadan hiçbir şey değiştirmez.

.EXAMPLE
  .\kayit-teshis.ps1            # yalnızca rapor
  .\kayit-teshis.ps1 -Duzelt    # düzelt
#>
[CmdletBinding()]
param(
  [switch]$Duzelt,
  [int]$Saat = 72,
  [string]$Bolge = "eu-central-1",
  [string]$Profil = $env:AWS_PROFILE
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"

$sorunlar = @()   # otomatik düzeltilemeyenler
$duzeltmeler = @()  # -Duzelt ile yapılacaklar
function Sorun($metin) { Write-Host "  ✗ $metin" -ForegroundColor Red }

HesapDogrula | Out-Null

# ── 1) CloudWatch ─────────────────────────────────────────────────────────
Adim "Son kayıt hataları (CloudWatch, son $Saat saat)"
$bas = [DateTimeOffset]::UtcNow.AddHours(-$Saat).ToUnixTimeMilliseconds()
$olaylar = Dene logs filter-log-events --log-group-name "/aws/lambda/$LAMBDA" `
  --start-time $bas --filter-pattern "kayit hatasi"
$mesajlar = @($olaylar.events | Select-Object -Last 5 | ForEach-Object {
  $z = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$_.timestamp).LocalDateTime.ToString("dd.MM HH:mm")
  "$z  $("$($_.message)".Trim())"
})
if (-not $olaylar) { Uyari "günlükler okunamadı (izin ya da günlük grubu yok)" }
elseif (-not $mesajlar.Count) { Bilgi "son $Saat saatte kayıt hatası yok" }
else { $mesajlar | ForEach-Object { Bilgi $_ } }
$gunluk = $mesajlar -join "`n"

# ── 2) Havuz ──────────────────────────────────────────────────────────────
Adim "Cognito havuzu ($HAVUZ)"
$havuzBilgi = (Cagir cognito-idp describe-user-pool --user-pool-id $HAVUZ).UserPool

$kendiKaydi = -not $havuzBilgi.AdminCreateUserConfig.AllowAdminCreateUserOnly
if ($kendiKaydi) { Tamam "kendi kendine kayıt açık" }
else {
  Sorun "kendi kendine kayıt KAPALI (yalnızca yönetici hesap açabilir) — sign_up reddedilir"
  $duzeltmeler += "kendi kendine kaydı aç"
}

$sema = @($havuzBilgi.SchemaAttributes | ForEach-Object { $_.Name })
$eksikOz = @("custom:rol", "custom:musteri_id" | Where-Object { $sema -notcontains $_ })
if (-not $eksikOz.Count) { Tamam "custom:rol ve custom:musteri_id tanımlı" }
else {
  Sorun "havuzda tanımlı olmayan öznitelik: $($eksikOz -join ', ')"
  $duzeltmeler += "öznitelik ekle: $($eksikOz -join ', ')"
}

# Backend yaması (ekler\yamala.py) ad → given_name, soyad → family_name,
# telefon → phone_number gönderir; başka zorunlu öznitelik elle çözülmeli.
$YAMA_KARSILAR = @("given_name", "family_name", "phone_number")
$zorunlu = @($havuzBilgi.SchemaAttributes | Where-Object { $_.Required -and $_.Name -notin @("email", "sub") } | ForEach-Object { $_.Name })
$yamaGerekli = $false
if ($zorunlu.Count) {
  Uyari "havuz şu öznitelikleri zorunlu tutuyor: $($zorunlu -join ', ')"
  $karsilanmaz = @($zorunlu | Where-Object { $YAMA_KARSILAR -notcontains $_ })
  if ($karsilanmaz.Count) {
    Sorun "backend bunları gönderemez: $($karsilanmaz -join ', ')"
    $sorunlar += "Zorunlu öznitelik ($($karsilanmaz -join ', ')): Cognito'da sonradan değiştirilemez; backend'e ek alan gerekir."
  }
  # Canlı kod zaten gönderiyor mu?
  $gecici = Join-Path ([IO.Path]::GetTempPath()) ("de-canli-" + [guid]::NewGuid().ToString("N").Substring(0, 8) + ".zip")
  $canliKod = ""
  try {
    Invoke-WebRequest -Uri (Cagir lambda get-function --function-name $LAMBDA).Code.Location -OutFile $gecici -UseBasicParsing
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $z = [IO.Compression.ZipFile]::OpenRead($gecici)
    try {
      $g = $z.Entries | Where-Object { $_.FullName -eq "lambda_function.py" } | Select-Object -First 1
      if ($g) { $o = New-Object IO.StreamReader($g.Open()); $canliKod = $o.ReadToEnd(); $o.Dispose() }
    } finally { $z.Dispose() }
  } catch { Uyari "canlı Lambda kodu okunamadı: $($_.Exception.Message)" }
  finally { Remove-Item $gecici -ErrorAction SilentlyContinue }
  $eksikGonderim = @($zorunlu | Where-Object { $YAMA_KARSILAR -contains $_ -and $canliKod -notmatch "'$_'" })
  if ($canliKod -and -not $eksikGonderim.Count) { Tamam "backend bu öznitelikleri gönderiyor" }
  else {
    Sorun "backend kayıtta bunları göndermiyor: $((@($eksikGonderim) + @()) -join ', ')"
    $yamaGerekli = $true
    $duzeltmeler += "Lambda yaması: kayıtta ad, soyad, telefon Cognito'ya gönderilsin"
  }
} else { Tamam "e-posta dışında zorunlu öznitelik yok" }

if ($havuzBilgi.LambdaConfig -and $havuzBilgi.LambdaConfig.PreSignUp) {
  Uyari "ön kayıt tetikleyicisi var: $($havuzBilgi.LambdaConfig.PreSignUp) — kaydı o reddediyor olabilir"
  $sorunlar += "Pre sign-up tetikleyicisi ($($havuzBilgi.LambdaConfig.PreSignUp)) kaydı reddediyor olabilir; CloudWatch'ta o fonksiyonun günlüğüne bakın."
}
if ($havuzBilgi.UsernameAttributes -and $havuzBilgi.UsernameAttributes -notcontains "email") {
  Sorun "kullanıcı adı olarak yalnızca $($havuzBilgi.UsernameAttributes -join ', ') kabul ediliyor; backend e-posta kullanıyor"
  $sorunlar += "Havuz kullanıcı adı olarak e-posta kabul etmiyor; havuz yeniden oluşturulmadan değiştirilemez."
}

# ── 3) İstemci ────────────────────────────────────────────────────────────
Adim "Cognito istemcisi ($ISTEMCI)"
$istemciBilgi = (Cagir cognito-idp describe-user-pool-client --user-pool-id $HAVUZ --client-id $ISTEMCI).UserPoolClient
if ($istemciBilgi.ClientSecret) {
  Sorun "istemcinin gizli anahtarı (client secret) var — sign_up SECRET_HASH ister, backend göndermiyor"
  $sorunlar += "İstemcinin gizli anahtarı var. Gizli anahtarsız yeni bir uygulama istemcisi açılıp backend'deki COGNITO_CLIENT_ID güncellenmeli."
} else { Tamam "gizli anahtar yok" }

# sign_up bunları YAZAR; backend oturumda yalnızca custom öznitelikleri OKUR
$gerekli = @("custom:rol", "custom:musteri_id")
$yazGerekli = @($gerekli + @($zorunlu | Where-Object { $YAMA_KARSILAR -contains $_ }))
$yazEksik = @()
if ($istemciBilgi.WriteAttributes) { $yazEksik = @($yazGerekli | Where-Object { $istemciBilgi.WriteAttributes -notcontains $_ }) }
$okuEksik = @()
if ($istemciBilgi.ReadAttributes) { $okuEksik = @($gerekli | Where-Object { $istemciBilgi.ReadAttributes -notcontains $_ }) }
if ($yazEksik.Count) { Sorun "istemci şunları yazamıyor: $($yazEksik -join ', ')"; $duzeltmeler += "istemciye yazma izni: $($yazEksik -join ', ')" }
else { Tamam "istemci öznitelikleri yazabiliyor" }
if ($okuEksik.Count) { Sorun "istemci şunları okuyamıyor: $($okuEksik -join ', ')"; $duzeltmeler += "istemciye okuma izni: $($okuEksik -join ', ')" }
else { Tamam "istemci öznitelikleri okuyabiliyor" }

# ── Özet ──────────────────────────────────────────────────────────────────
Write-Host "`n══════════════ SONUÇ ══════════════" -ForegroundColor White
if ($gunluk -match 'SecretHash|secret hash') { $sorunlar += "Günlük: gizli anahtar (SECRET_HASH) hatası." }
if (-not $duzeltmeler.Count -and -not $sorunlar.Count) {
  Tamam "Cognito ayarlarında sign_up'ı engelleyen bir şey bulunamadı."
  Bilgi "Başvuruyu tekrar deneyin. Yukarıdaki günlük satırları önceki denemelere ait olabilir;"
  Bilgi "hata sürerse bu betiği tekrar çalıştırıp çıktısını paylaşın."
  return
}
foreach ($s in $sorunlar) { Uyari $s }
if (-not $duzeltmeler.Count) { return }
if (-not $Duzelt) {
  Write-Host "`nOtomatik düzeltilebilir:" -ForegroundColor White
  $duzeltmeler | ForEach-Object { Bilgi "- $_" }
  Write-Host "Uygulamak için: .\kayit-teshis.ps1 -Duzelt" -ForegroundColor Yellow
  return
}

# ── Düzeltme ──────────────────────────────────────────────────────────────
$yedek = Join-Path (Join-Path $PSScriptRoot "yedekler") ("cognito-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force -Path $yedek | Out-Null
[IO.File]::WriteAllText((Join-Path $yedek "havuz.json"), ($havuzBilgi | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding($false)))
$istemciYedek = $istemciBilgi | Select-Object * -ExcludeProperty ClientSecret
[IO.File]::WriteAllText((Join-Path $yedek "istemci.json"), ($istemciYedek | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding($false)))
Adim "Yedek: $yedek"

if ($eksikOz.Count) {
  Adim "Öznitelikler ekleniyor"
  $oz = @($eksikOz | ForEach-Object { @{ Name = $_ -replace '^custom:', ''; AttributeDataType = "String"; Mutable = $true } })
  $d = JsonDosyasi $oz
  Cagir cognito-idp add-custom-attributes --user-pool-id $HAVUZ --custom-attributes "file://$d" | Out-Null
  Tamam "eklendi: $($eksikOz -join ', ')"
}

if ($yazEksik.Count -or $okuEksik.Count) {
  Adim "İstemci öznitelik izinleri"
  # update-user-pool-client verilmeyen alanları varsayılana döndürür: mevcut
  # yapılandırmanın tamamı geri yazılır, yalnızca öznitelik listeleri değişir.
  # describe çıktısı yalnızca bu CLI sürümünün tanıdığı alanları içerir.
  $izinli = "ClientName","RefreshTokenValidity","AccessTokenValidity","IdTokenValidity","TokenValidityUnits",
            "ReadAttributes","WriteAttributes","ExplicitAuthFlows","SupportedIdentityProviders","CallbackURLs",
            "LogoutURLs","DefaultRedirectURI","AllowedOAuthFlows","AllowedOAuthScopes","AllowedOAuthFlowsUserPoolClient",
            "AnalyticsConfiguration","PreventUserExistenceErrors","EnableTokenRevocation",
            "EnablePropagateAdditionalUserContextData","AuthSessionValidity","RefreshTokenRotation"
  $girdi = [ordered]@{ UserPoolId = $HAVUZ; ClientId = $ISTEMCI }
  foreach ($p in $istemciBilgi.PSObject.Properties) { if ($izinli -contains $p.Name -and $null -ne $p.Value) { $girdi[$p.Name] = $p.Value } }
  if ($yazEksik.Count) { $girdi.WriteAttributes = @(@($istemciBilgi.WriteAttributes) + $yazEksik) }
  if ($okuEksik.Count) { $girdi.ReadAttributes = @(@($istemciBilgi.ReadAttributes) + $okuEksik) }
  $d = JsonDosyasi $girdi
  Cagir cognito-idp update-user-pool-client --cli-input-json "file://$d" | Out-Null
  Tamam "güncellendi"
}

if (-not $kendiKaydi) {
  Adim "Kendi kendine kayıt açılıyor"
  # update-user-pool da verilmeyen ayarları sıfırlar: mevcut ayarlar geri yazılır.
  $izinli = "Policies","DeletionProtection","LambdaConfig","AutoVerifiedAttributes","SmsAuthenticationMessage",
            "UserAttributeUpdateSettings","MfaConfiguration","DeviceConfiguration","EmailConfiguration",
            "SmsConfiguration","UserPoolTags","AdminCreateUserConfig","UserPoolAddOns","AccountRecoverySetting",
            "VerificationMessageTemplate","UserPoolTier"
  $girdi = [ordered]@{ UserPoolId = $HAVUZ }
  foreach ($p in $havuzBilgi.PSObject.Properties) { if ($izinli -contains $p.Name -and $null -ne $p.Value) { $girdi[$p.Name] = $p.Value } }
  # Şablon yoksa eski tekil mesaj alanları kullanılır (ikisi birlikte verilirse çakışabilir)
  if (-not $havuzBilgi.VerificationMessageTemplate) {
    foreach ($a in "EmailVerificationMessage", "EmailVerificationSubject", "SmsVerificationMessage") {
      if ($havuzBilgi.$a) { $girdi[$a] = $havuzBilgi.$a }
    }
  }
  $yeni = [ordered]@{ AllowAdminCreateUserOnly = $false }
  foreach ($p in $havuzBilgi.AdminCreateUserConfig.PSObject.Properties) {
    # UnusedAccountValidityDays eskidi; TemporaryPasswordValidityDays ile birlikte verilince hata verir
    if ($p.Name -notin @("AllowAdminCreateUserOnly", "UnusedAccountValidityDays")) { $yeni[$p.Name] = $p.Value }
  }
  $girdi.AdminCreateUserConfig = $yeni
  $d = JsonDosyasi $girdi
  Cagir cognito-idp update-user-pool --cli-input-json "file://$d" | Out-Null
  $son = (Cagir cognito-idp describe-user-pool --user-pool-id $HAVUZ).UserPool
  if ($son.AdminCreateUserConfig.AllowAdminCreateUserOnly) { throw "Güncelleme sonrası kayıt hâlâ kapalı görünüyor." }
  Tamam "açıldı"
}

if ($yamaGerekli) {
  Adim "Lambda yaması (kayıt öznitelikleri)"
  & (Join-Path $PSScriptRoot "hepsini-kur.ps1") -Atla backend, hesap, web -Onayla -TarayiciAcma -Bolge $Bolge -Profil $Profil
  if ($LASTEXITCODE) { throw "Lambda yaması uygulanamadı; yukarıdaki hataya bakın." }
}

Write-Host "`nDüzeltildi. Müşteri uygulamasından başvuruyu tekrar deneyin." -ForegroundColor Green
if ($sorunlar.Count) { Uyari "Yukarıdaki diğer sorunlar elle çözülmeli." }
