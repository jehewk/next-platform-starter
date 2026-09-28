# Dennis Energy AWS betiklerinin ortak yardımcıları. Doğrudan çalıştırılmaz;
# diğer betikler ". $PSScriptRoot\ortak.ps1" ile içeri alır.
#
# Windows PowerShell 5.1 ve PowerShell 7 ile uyumludur. Dosyalar UTF-8 (BOM'lu)
# kaydedilir; aksi halde 5.1 Türkçe karakterleri bozar.

# Salt okunur: PowerShell değişken adlarında büyük/küçük harf ayırmaz; betikte
# "$havuz = ..." gibi bir atama sabiti ezerdi. Salt okunur olunca hemen hata verir.
$sabitler = [ordered]@{
  HESAP = "346532553636"; LAMBDA = "inverterai-api"; LAMBDA_ROLU = "inverterai-api-role-f8jnfm8t"
  HAVUZ = "eu-central-1_6Y1AK5Z3q"; ISTEMCI = "2ltj93e724e1tgg7v21ap95oqi"
  API_TABAN_VARSAYILAN = "https://xoja2a8sx5.execute-api.eu-central-1.amazonaws.com/prod"
}
foreach ($k in $sabitler.Keys) { Set-Variable -Name $k -Value $sabitler[$k] -Option ReadOnly -Force }

if (-not $Bolge) { $Bolge = "eu-central-1" }
if (-not $Profil) { $Profil = $env:AWS_PROFILE }

$komut = Get-Command aws -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $komut) { throw "AWS CLI bulunamadı. https://aws.amazon.com/cli adresinden AWS CLI v2'yi kurun." }
$AWS_CLI = $komut.Source

<#
  aws komutunu çalıştırır. JSON çıktıyı nesneye çevirir, hata olursa aws'nin
  kendi mesajıyla durur. Yardımcının adı "aws" OLAMAZ: PowerShell komut
  adlarında büyük/küçük harf ayırmaz, fonksiyon kendini çağırırdı.
  stderr ayrı dosyaya alınır: 5.1'de "2>&1" + Stop, aws'nin ilk uyarı
  satırında betiği durdururdu.
#>
function Cagir {
  param([Parameter(ValueFromRemainingArguments = $true)]$A)
  $ek = @("--region", $Bolge, "--output", "json")
  if ($Profil) { $ek += @("--profile", $Profil) }
  $hataDosyasi = [IO.Path]::GetTempFileName()
  $eski = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $cikti = & $AWS_CLI @A @ek 2> $hataDosyasi
    $kod = $LASTEXITCODE
  } finally { $ErrorActionPreference = $eski }
  $satirlar = @(Get-Content $hataDosyasi -ErrorAction SilentlyContinue)
  Remove-Item $hataDosyasi -ErrorAction SilentlyContinue
  if ($kod -ne 0) { throw "aws $($A[0..1] -join ' ') başarısız: $(AwsHatasi $satirlar)" }
  $metin = ($cikti | Out-String).Trim()
  if (-not $metin) { return $null }
  try { return ($metin | ConvertFrom-Json) } catch { return $metin }
}

# Windows PowerShell 5.1, aws'nin stderr'ini kendi hata biçimine sarar ve satırları
# konsol genişliğinde keser ("veri" / "fied"). Yalnızca AWS'nin mesajı alınır.
function AwsHatasi($satirlar) {
  $i = -1
  for ($k = 0; $k -lt $satirlar.Count; $k++) {
    if ($satirlar[$k] -match 'An error occurred|\[ERROR\]|aws: error|Unknown options|Could not connect|Unable to locate credentials') { $i = $k; break }
  }
  if ($i -lt 0) { return (($satirlar | Where-Object { "$_".Trim() }) -join ' ') }
  $metin = ""
  for ($k = $i; $k -lt $satirlar.Count -and "$($satirlar[$k])".Trim(); $k++) { $metin += $satirlar[$k] }
  return ($metin -replace '^.*?(An error occurred)', '$1').Trim()
}

# Başarısızlığı istisna yerine $null olarak döndürür (var mı / yok mu sorguları için).
function Dene {
  param([Parameter(ValueFromRemainingArguments = $true)]$A)
  try { return (Cagir @A) } catch { return $null }
}

# JSON'u geçici dosyaya yazar (Windows'ta tırnak kaçışı sorunlarını önler).
# -InputObject: boru hattı tek elemanlı diziyi nesneye çevirirdi.
function JsonDosyasi($nesne) {
  $yol = [IO.Path]::GetTempFileName()
  $metin = if ($nesne -is [string]) { $nesne } else { ConvertTo-Json -InputObject $nesne -Depth 20 -Compress }
  [IO.File]::WriteAllText($yol, $metin, (New-Object Text.UTF8Encoding($false)))
  return $yol
}

# Klasörü zip'ler. Compress-Archive (Windows PowerShell 5.1) alt klasör yollarını
# "\" ile yazar; Lambda (Linux) bunları klasör olarak görmez. Burada her zaman "/".
function ZipOlustur($klasor, $hedef) {
  Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
  if (Test-Path $hedef) { Remove-Item $hedef -Force }
  $kok = (Resolve-Path $klasor).Path.TrimEnd('\', '/')
  $zip = [IO.Compression.ZipFile]::Open($hedef, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($f in Get-ChildItem $kok -Recurse -File) {
      $ad = $f.FullName.Substring($kok.Length + 1).Replace('\', '/')
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $ad) | Out-Null
    }
  } finally { $zip.Dispose() }
}

# ── AWS Amplify Hosting ─────────────────────────────────────────────────
# HTTPS'li yayın. Yeni hesaplarda Amplify tek uygulamaya izin verir; bu yüzden
# iki web uygulaması TEK Amplify uygulamasının iki dalında yayınlanır
# (https://<dal>.<appId>.amplifyapp.com). S3 web sitesi yalnızca http sunar ve
# telefon tarayıcıları https'e zorladığı için açılmaz.
$AMPLIFY_SPA_KURALI = @(@{
  source = '</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp|webmanifest)$)([^.]+$)/>'
  target = "/index.html"; status = "200" })

# $adlar: kabul edilen uygulama adları (ilki yeni oluşturmada kullanılır)
function AmplifyUygulamasi($adlar, $dal = "main") {
  $adlar = @($adlar); $ad = $adlar[0]
  $var = (Cagir amplify list-apps).apps | Where-Object { $adlar -contains $_.name } | Select-Object -First 1
  if ($var) { $app = $var }
  else {
    $kural = JsonDosyasi $AMPLIFY_SPA_KURALI
    $app = (Cagir amplify create-app --name $ad --platform WEB --custom-rules "file://$kural").app
  }
  if (-not (Dene amplify get-branch --app-id $app.appId --branch-name $dal)) {
    Cagir amplify create-branch --app-id $app.appId --branch-name $dal --stage PRODUCTION | Out-Null
  }
  return $app
}

function AmplifyYayinla($appId, $dist, $dal = "main") {
  $zip = Join-Path ([IO.Path]::GetTempPath()) ("de-amplify-" + [guid]::NewGuid().ToString("N").Substring(0, 8) + ".zip")
  ZipOlustur $dist $zip
  $d = Cagir amplify create-deployment --app-id $appId --branch-name $dal
  Invoke-WebRequest -Method Put -Uri $d.zipUploadUrl -InFile $zip -ContentType "application/zip" -UseBasicParsing | Out-Null
  Remove-Item $zip -ErrorAction SilentlyContinue
  Cagir amplify start-deployment --app-id $appId --branch-name $dal --job-id $d.jobId | Out-Null
  $son = (Get-Date).AddMinutes(10)
  do {
    Start-Sleep -Seconds 5
    $durum = (Cagir amplify get-job --app-id $appId --branch-name $dal --job-id $d.jobId).job.summary.status
    if ($durum -eq "SUCCEED") { return }
    if ($durum -in @("FAILED", "CANCELLED")) { throw "Amplify yayını başarısız ($durum). Amplify konsolunda iş $($d.jobId) günlüğüne bakın." }
  } while ((Get-Date) -lt $son)
  throw "Amplify yayını 10 dakikada bitmedi; Amplify konsolundan durumu kontrol edin."
}

function Adim($metin)  { Write-Host "`n▶ $metin" -ForegroundColor Cyan }
function Tamam($metin) { Write-Host "  ✓ $metin" -ForegroundColor Green }
function Uyari($metin) { Write-Host "  ! $metin" -ForegroundColor Yellow }
function Bilgi($metin) { Write-Host "    $metin" -ForegroundColor Gray }

function HesapDogrula {
  $kim = Cagir sts get-caller-identity
  if ($kim.Account -ne $HESAP) { throw "Yanlış AWS hesabı: $($kim.Account) (beklenen $HESAP). Profil: '$Profil'" }
  return $kim
}
