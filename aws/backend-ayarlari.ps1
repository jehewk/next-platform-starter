<#
.SYNOPSIS
  Dennis Energy — AWS backend ayarlarını (DEVIR.md §2) güvenle uygular.

.DESCRIPTION
  Her adım önce mevcut durumu okur, yalnızca eksik olanı değiştirir;
  tekrar çalıştırmak zararsızdır. -Uygula verilmezse hiçbir şey
  değiştirmez, yalnızca ne yapılacağını yazar (kuru çalışma).

  1) Lambda rolüne DynamoDB tablo izinleri          (DennisTablolari)
  2) Lambda rolüne Cognito kayıt/onay/giriş izinleri (KayitIzinleri)
  3) Cognito istemcisinde şifreyle giriş akışları
  4) Lambda ortam değişkeni KAPTCHA_GIZLI — DİĞER DEĞİŞKENLER KORUNUR
     (update-function-configuration --environment tüm değişkenleri
      değiştirir; bu betik mevcutları okuyup birleştirir)

.EXAMPLE
  .\backend-ayarlari.ps1              # kuru çalışma: yalnızca rapor
  .\backend-ayarlari.ps1 -Uygula      # değişiklikleri uygula

.NOTES
  Gerekenler: AWS CLI v2, yetkili bir profil (aws configure).
#>
[CmdletBinding()]
param(
  [switch]$Uygula,
  [string]$Bolge = "eu-central-1",
  [string]$Profil = $env:AWS_PROFILE
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"
$TABLOLAR = "dennis-cihazlar","dennis-aku-verileri","dennis-inverter-verileri","dennis-musteriler",
            "dennis-eslesmeler","dennis-garanti","dennis-partiler"

function Yapilacak($metin) {
  if ($Uygula) { Write-Host "  → $metin" -ForegroundColor Yellow }
  else { Write-Host "  (kuru) $metin" -ForegroundColor DarkYellow }
}

# ── 0) Kimlik ve hesap kontrolü ─────────────────────────────────────────
Adim "Hesap doğrulanıyor"
$kim = HesapDogrula
Tamam "$($kim.Arn)"

# ── 1) DynamoDB izinleri ────────────────────────────────────────────────
Adim "1/4 DynamoDB tablo izinleri ($LAMBDA_ROLU)"
$kaynaklar = foreach ($t in $TABLOLAR) {
  "arn:aws:dynamodb:${Bolge}:${HESAP}:table/$t"
  "arn:aws:dynamodb:${Bolge}:${HESAP}:table/$t/index/*"
}
$dynamoPolitika = @{
  Version = "2012-10-17"
  Statement = @(@{
    Effect = "Allow"
    Action = @("dynamodb:GetItem","dynamodb:PutItem","dynamodb:UpdateItem","dynamodb:DeleteItem",
               "dynamodb:Query","dynamodb:Scan","dynamodb:BatchGetItem","dynamodb:BatchWriteItem")
    Resource = $kaynaklar
  })
} | ConvertTo-Json -Depth 6 -Compress
$var = Dene iam get-role-policy --role-name $LAMBDA_ROLU --policy-name DennisTablolari
if ($var) { Tamam "DennisTablolari mevcut" }
else {
  Yapilacak "DennisTablolari politikası eklenecek"
  if ($Uygula) {
    $dosya = JsonDosyasi $dynamoPolitika
    Cagir iam put-role-policy --role-name $LAMBDA_ROLU --policy-name DennisTablolari --policy-document "file://$dosya" | Out-Null
    Remove-Item $dosya; Tamam "eklendi"
  }
}

# ── 2) Cognito yönetim izinleri ─────────────────────────────────────────
Adim "2/4 Cognito kayıt/onay izinleri"
$cognitoPolitika = @{
  Version = "2012-10-17"
  Statement = @(@{
    Effect = "Allow"
    Action = @("cognito-idp:SignUp","cognito-idp:AdminConfirmSignUp","cognito-idp:AdminDeleteUser",
               "cognito-idp:AdminUpdateUserAttributes","cognito-idp:AdminGetUser","cognito-idp:InitiateAuth")
    Resource = "arn:aws:cognito-idp:${Bolge}:${HESAP}:userpool/$HAVUZ"
  })
} | ConvertTo-Json -Depth 6 -Compress
$var = Dene iam get-role-policy --role-name $LAMBDA_ROLU --policy-name KayitIzinleri
if ($var) { Tamam "KayitIzinleri mevcut" }
else {
  Yapilacak "KayitIzinleri politikası eklenecek"
  if ($Uygula) {
    $dosya = JsonDosyasi $cognitoPolitika
    Cagir iam put-role-policy --role-name $LAMBDA_ROLU --policy-name KayitIzinleri --policy-document "file://$dosya" | Out-Null
    Remove-Item $dosya; Tamam "eklendi"
  }
}

# ── 3) Şifreyle giriş akışı ─────────────────────────────────────────────
Adim "3/4 Cognito istemci giriş akışları"
$istemciBilgi = (Cagir cognito-idp describe-user-pool-client --user-pool-id $HAVUZ --client-id $ISTEMCI).UserPoolClient
$gerekli = "ALLOW_USER_PASSWORD_AUTH","ALLOW_REFRESH_TOKEN_AUTH","ALLOW_USER_SRP_AUTH"
$eksik = $gerekli | Where-Object { $istemciBilgi.ExplicitAuthFlows -notcontains $_ }
if (-not $eksik) { Tamam "akışlar tamam: $($istemciBilgi.ExplicitAuthFlows -join ', ')" }
else {
  Yapilacak "eklenecek akışlar: $($eksik -join ', ')"
  if ($Uygula) {
    # update-user-pool-client verilmeyen alanları varsayılana döndürür; bu yüzden
    # mevcut yapılandırma okunup yalnızca akışlar değiştirilerek geri yazılır.
    $akislar = @($istemciBilgi.ExplicitAuthFlows + $eksik | Select-Object -Unique)
    $arg = @("cognito-idp","update-user-pool-client","--user-pool-id",$HAVUZ,"--client-id",$ISTEMCI,
             "--explicit-auth-flows") + $akislar
    if ($istemciBilgi.ClientName) { $arg += @("--client-name", $istemciBilgi.ClientName) }
    if ($istemciBilgi.RefreshTokenValidity) { $arg += @("--refresh-token-validity", $istemciBilgi.RefreshTokenValidity) }
    if ($istemciBilgi.AccessTokenValidity) { $arg += @("--access-token-validity", $istemciBilgi.AccessTokenValidity) }
    if ($istemciBilgi.IdTokenValidity) { $arg += @("--id-token-validity", $istemciBilgi.IdTokenValidity) }
    if ($istemciBilgi.TokenValidityUnits) {
      $u = $istemciBilgi.TokenValidityUnits
      $arg += @("--token-validity-units", "AccessToken=$($u.AccessToken),IdToken=$($u.IdToken),RefreshToken=$($u.RefreshToken)")
    }
    if ($istemciBilgi.ReadAttributes) { $arg += @("--read-attributes") + $istemciBilgi.ReadAttributes }
    if ($istemciBilgi.WriteAttributes) { $arg += @("--write-attributes") + $istemciBilgi.WriteAttributes }
    if ($istemciBilgi.PreventUserExistenceErrors) { $arg += @("--prevent-user-existence-errors", $istemciBilgi.PreventUserExistenceErrors) }
    if ($istemciBilgi.SupportedIdentityProviders) { $arg += @("--supported-identity-providers") + $istemciBilgi.SupportedIdentityProviders }
    if ($istemciBilgi.CallbackURLs) { $arg += @("--callback-urls") + $istemciBilgi.CallbackURLs }
    if ($istemciBilgi.LogoutURLs) { $arg += @("--logout-urls") + $istemciBilgi.LogoutURLs }
    if ($istemciBilgi.DefaultRedirectURI) { $arg += @("--default-redirect-uri", $istemciBilgi.DefaultRedirectURI) }
    if ($istemciBilgi.AllowedOAuthFlows) { $arg += @("--allowed-o-auth-flows") + $istemciBilgi.AllowedOAuthFlows }
    if ($istemciBilgi.AllowedOAuthScopes) { $arg += @("--allowed-o-auth-scopes") + $istemciBilgi.AllowedOAuthScopes }
    if ($istemciBilgi.AllowedOAuthFlowsUserPoolClient) { $arg += "--allowed-o-auth-flows-user-pool-client" }
    if ($null -ne $istemciBilgi.EnableTokenRevocation) {
      $arg += $(if ($istemciBilgi.EnableTokenRevocation) { "--enable-token-revocation" } else { "--no-enable-token-revocation" })
    }
    if ($istemciBilgi.AuthSessionValidity) { $arg += @("--auth-session-validity", $istemciBilgi.AuthSessionValidity) }
    Cagir @arg | Out-Null
    Tamam "güncellendi"
  }
}

# ── 4) KAPTCHA_GIZLI (diğer ortam değişkenleri korunur) ─────────────────
Adim "4/4 Lambda ortam değişkeni KAPTCHA_GIZLI"
$yap = Cagir lambda get-function-configuration --function-name $LAMBDA
$degiskenler = @{}
if ($yap.Environment -and $yap.Environment.Variables) {
  $yap.Environment.Variables.PSObject.Properties | ForEach-Object { $degiskenler[$_.Name] = $_.Value }
}
if ($degiskenler.ContainsKey("KAPTCHA_GIZLI") -and $degiskenler["KAPTCHA_GIZLI"] -ne "de-kaptcha-v1-degistir") {
  Tamam "KAPTCHA_GIZLI tanımlı (değer gösterilmez)"
} else {
  Yapilacak "rastgele 48 karakterlik KAPTCHA_GIZLI atanacak; mevcut $($degiskenler.Count) değişken korunacak"
  if ($Uygula) {
    $bayt = New-Object byte[] 36
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bayt)
    $degiskenler["KAPTCHA_GIZLI"] = [Convert]::ToBase64String($bayt)
    $dosya = JsonDosyasi @{ Variables = $degiskenler }
    Cagir lambda update-function-configuration --function-name $LAMBDA --environment "file://$dosya" | Out-Null
    Remove-Item $dosya
    Cagir lambda wait function-updated --function-name $LAMBDA | Out-Null
    Tamam "atandı (açık kaptcha token'ları geçersiz olur; kullanıcılar yeni kod alır)"
  }
}

Write-Host ""
if (-not $Uygula) { Write-Host "Kuru çalışma bitti. Uygulamak için: .\backend-ayarlari.ps1 -Uygula" -ForegroundColor DarkYellow }
else { Write-Host "Tüm ayarlar uygulandı." -ForegroundColor Green }
