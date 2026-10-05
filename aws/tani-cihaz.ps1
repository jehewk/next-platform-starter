<#
  tani-cihaz.ps1 — Bir cihazin musteri atamasi ile oturum kimligi uyusuyor mu
  diye bakar. "Cihaz atadim ama musteri uygulamasinda gorunmuyor" durumunu teshis eder.

  Uygulama cihazlari Cognito'daki custom:musteri_id'ye gore suzer. Bu betik:
   - Cognito hesabinin custom:musteri_id'sini,
   - o e-postayla musteri tablosundaki TUM kayitlari,
   - cihazin musteri_id'sini
  yan yana gosterir ve uyusmuyorsa duzeltme komutunu yazar. Hicbir sey degistirmez.

  Kullanim: .\tani-cihaz.ps1 -Eposta beni@ornek.com -CihazId AKU-WOKWI-CB10
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$Eposta,
  [Parameter(Mandatory = $true)] [string]$CihazId,
  [string]$MusteriTablosu = "dennis-musteriler",
  [string]$CihazTablosu = "dennis-cihazlar",
  [string]$Bolge,
  [string]$Profil
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ortak.ps1"
HesapDogrula | Out-Null

Adim "Cognito hesabi ($Eposta)"
$kullanici = Dene cognito-idp admin-get-user --user-pool-id $HAVUZ --username $Eposta
$cogMid = $null; $cogRol = $null
if ($kullanici -and $kullanici.UserAttributes) {
  foreach ($a in $kullanici.UserAttributes) {
    if ($a.Name -eq 'custom:musteri_id') { $cogMid = $a.Value }
    if ($a.Name -eq 'custom:rol') { $cogRol = $a.Value }
  }
  Tamam "Cognito custom:musteri_id = $(if ($cogMid) { $cogMid } else { '(bos!)' }) · rol = $cogRol"
} else {
  Uyari "Cognito'da bu e-postayla kullanici bulunamadi (musteri uygulamasindan kayit olundu mu?)."
}

Adim "Musteri tablosundaki kayitlar"
$vyol = JsonDosyasi @{ ":e" = @{ S = $Eposta } }
$sonuc = Cagir dynamodb scan --table-name $MusteriTablosu --filter-expression "email = :e" --expression-attribute-values "file://$vyol"
Remove-Item $vyol -ErrorAction SilentlyContinue
$kayitlar = @($sonuc.Items)
if ($kayitlar.Count -eq 0) { Uyari "Bu e-postayla musteri kaydi yok." }
foreach ($m in $kayitlar) {
  $durum = if ($m.kayit_durumu) { $m.kayit_durumu.S } else { '(durum yok)' }
  Bilgi "musteri_id = $($m.musteri_id.S) · durum = $durum"
}
if ($kayitlar.Count -gt 1) { Uyari "BIRDEN FAZLA kayit var; dogru olan Cognito'daki ile ayni olmali." }

Adim "Cihaz ($CihazId)"
$kyol = JsonDosyasi @{ cihaz_id = @{ S = $CihazId } }
$cihaz = Dene dynamodb get-item --table-name $CihazTablosu --key "file://$kyol"
Remove-Item $kyol -ErrorAction SilentlyContinue
$cihMid = if ($cihaz -and $cihaz.Item -and $cihaz.Item.musteri_id) { $cihaz.Item.musteri_id.S } else { $null }
Tamam "cihaz musteri_id = $(if ($cihMid) { $cihMid } else { '(atanmamis!)' })"

Write-Host ""
Write-Host "──────── SONUC ────────" -ForegroundColor Cyan
if (-not $cogMid) {
  Uyari "Cognito hesabinda custom:musteri_id YOK. Uygulama hic cihaz gosteremez."
  Bilgi "Bu e-postayla musteri uygulamasindan kayit olundugundan emin ol."
} elseif ($cogMid -eq $cihMid) {
  Tamam "UYUSUYOR ($cogMid). Cihaz bu hesaba bagli -> uygulamada GORUNMELI."
  Bilgi "Gorunmuyorsa: uygulamadan cikis yap/tekrar gir (liste onbellekten geliyor olabilir)."
} else {
  Uyari "UYUSMUYOR! Cihaz '$cihMid' kaydina bagli ama oturum kimligi '$cogMid'."
  Bilgi "Duzeltmek icin cihazi Cognito kimligine ata:"
  Write-Host "    .\cihaz-ata.ps1 -CihazId $CihazId -MusteriId $cogMid" -ForegroundColor White
}
