# Dennis Energy AWS betiklerinin ortak yardımcıları. Doğrudan çalıştırılmaz;
# diğer betikler ". $PSScriptRoot\ortak.ps1" ile içeri alır.
#
# Windows PowerShell 5.1 ve PowerShell 7 ile uyumludur. Dosyalar UTF-8 (BOM'lu)
# kaydedilir; aksi halde 5.1 Türkçe karakterleri bozar.

$HESAP   = "346532553636"
$LAMBDA  = "inverterai-api"
$LAMBDA_ROLU     = "inverterai-api-role-f8jnfm8t"
$HAVUZ   = "eu-central-1_6Y1AK5Z3q"
$ISTEMCI = "2ltj93e724e1tgg7v21ap95oqi"
$API_TABAN_VARSAYILAN = "https://xoja2a8sx5.execute-api.eu-central-1.amazonaws.com/prod"

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
  $hata = (Get-Content $hataDosyasi -Raw -ErrorAction SilentlyContinue)
  Remove-Item $hataDosyasi -ErrorAction SilentlyContinue
  if ($kod -ne 0) { throw "aws $($A[0..1] -join ' ') başarısız: $hata" }
  $metin = ($cikti | Out-String).Trim()
  if (-not $metin) { return $null }
  try { return ($metin | ConvertFrom-Json) } catch { return $metin }
}

# Başarısızlığı istisna yerine $null olarak döndürür (var mı / yok mu sorguları için).
function Dene {
  param([Parameter(ValueFromRemainingArguments = $true)]$A)
  try { return (Cagir @A) } catch { return $null }
}

# JSON'u geçici dosyaya yazar (Windows'ta tırnak kaçışı sorunlarını önler).
function JsonDosyasi($nesne) {
  $yol = [IO.Path]::GetTempFileName()
  $metin = if ($nesne -is [string]) { $nesne } else { $nesne | ConvertTo-Json -Depth 20 -Compress }
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

function Adim($metin)  { Write-Host "`n▶ $metin" -ForegroundColor Cyan }
function Tamam($metin) { Write-Host "  ✓ $metin" -ForegroundColor Green }
function Uyari($metin) { Write-Host "  ! $metin" -ForegroundColor Yellow }
function Bilgi($metin) { Write-Host "    $metin" -ForegroundColor Gray }

function HesapDogrula {
  $kim = Cagir sts get-caller-identity
  if ($kim.Account -ne $HESAP) { throw "Yanlış AWS hesabı: $($kim.Account) (beklenen $HESAP). Profil: '$Profil'" }
  return $kim
}
