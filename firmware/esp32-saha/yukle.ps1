<#
  yukle.ps1 - ESP32'ye TEK KOMUTLA derle + yukle + seri monitor (arduino-cli).
  Arduino IDE'yi acip tiklamana gerek yok.

  Kullanim (PowerShell, bu klasorde):
    .\yukle.ps1                 # otomatik port bul, derle, yukle, monitor ac
    .\yukle.ps1 -Port COM5      # portu kendin ver
    .\yukle.ps1 -Monitor:$false # monitor acma

  On kosul: arduino-cli kurulu olmali (yoksa betik nasil kurulacagini soyler).
  ESP32 cekirdegi ve kutuphaneler (ArduinoJson, NimBLE-Arduino) ilk calistirmada
  otomatik kurulur.
#>
[CmdletBinding()]
param(
  [string]$Port,
  [int]$Baud = 115200,
  [switch]$Monitor = $true,
  [string]$Fqbn = "esp32:esp32:esp32:PartitionScheme=huge_app"
)
$ErrorActionPreference = "Stop"
$sketch = $PSScriptRoot
$ESP_URL = "https://espressif.github.io/arduino-esp32/package_esp32_index.json"

function KomutVar($k) { [bool](Get-Command $k -ErrorAction SilentlyContinue) }
function Adim($m) { Write-Host "`n> $m" -ForegroundColor Cyan }
function Tamam($m) { Write-Host "  + $m" -ForegroundColor Green }
function Uyari($m) { Write-Host "  ! $m" -ForegroundColor Yellow }

if (-not (KomutVar "arduino-cli")) {
  Uyari "arduino-cli bulunamadi - kurulmaya calisiliyor"
  if (KomutVar "winget") {
    Adim "winget ile kuruluyor (ArduinoSA.CLI)"
    & winget install --id ArduinoSA.CLI -e --accept-source-agreements --accept-package-agreements
    # winget kurulumu mevcut oturumun PATH'ine hemen yansimaz; dogrudan dosyayi ara.
    if (-not (KomutVar "arduino-cli")) {
      $aday = @(
        "$env:LOCALAPPDATA\Microsoft\WinGet\Links\arduino-cli.exe",
        "$env:ProgramFiles\Arduino CLI\arduino-cli.exe"
      ) | Where-Object { Test-Path $_ } | Select-Object -First 1
      if ($aday) {
        $env:Path = (Split-Path $aday) + ";" + $env:Path
        Tamam "arduino-cli bu oturuma eklendi"
      }
    }
  }
  # winget yoksa / basarisizsa: resmi zip'i dogrudan indir (winget gerekmez).
  if (-not (KomutVar "arduino-cli")) {
    try {
      Adim "arduino-cli resmi paketi indiriliyor (winget gerekmez)"
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocol]::Tls12   # eski PS5.1 icin
      $mimari = if ([Environment]::Is64BitOperatingSystem) { "Windows_64bit" } else { "Windows_32bit" }
      $url = "https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_$mimari.zip"
      $hedef = Join-Path $env:LOCALAPPDATA "ArduinoCLI"
      $zip = Join-Path $env:TEMP "arduino-cli.zip"
      New-Item -ItemType Directory -Force -Path $hedef | Out-Null
      $eski = $ProgressPreference; $ProgressPreference = "SilentlyContinue"
      Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
      $ProgressPreference = $eski
      Expand-Archive -Path $zip -DestinationPath $hedef -Force
      Remove-Item $zip -ErrorAction SilentlyContinue
      $env:Path = "$hedef;$env:Path"
      # Kalici olsun diye kullanicinin PATH'ine da ekle (yeni pencerelerde de bulunur).
      $kullaniciPath = [Environment]::GetEnvironmentVariable("Path", "User")
      if ($kullaniciPath -notlike "*$hedef*") {
        [Environment]::SetEnvironmentVariable("Path", "$hedef;$kullaniciPath", "User")
      }
      if (KomutVar "arduino-cli") { Tamam "arduino-cli indirildi ve kuruldu ($hedef)" }
    } catch {
      Uyari "Otomatik indirme basarisiz: $($_.Exception.Message)"
    }
  }
  if (-not (KomutVar "arduino-cli")) {
    Write-Host "arduino-cli otomatik kurulamadi." -ForegroundColor Red
    Write-Host "Elle kur (birini sec):" -ForegroundColor Yellow
    Write-Host "  https://arduino.github.io/arduino-cli/latest/installation/ (zip indir, exe'yi bir klasore koy)"
    Write-Host "Kurduktan sonra YENI bir PowerShell acip tekrar calistir." -ForegroundColor Yellow
    exit 1
  }
}
Tamam "arduino-cli bulundu"

Adim "ESP32 cekirdegi ve kutuphaneler kontrol ediliyor (ilk sefer uzun surebilir)"
& arduino-cli config init --overwrite 2>&1 | Out-Null
& arduino-cli config add board_manager.additional_urls $ESP_URL 2>&1 | Out-Null
& arduino-cli core update-index 2>&1 | Out-Null
if (-not (& arduino-cli core list 2>$null | Select-String "esp32:esp32")) {
  Uyari "esp32 cekirdegi kuruluyor..."
  & arduino-cli core install esp32:esp32
}
Tamam "esp32 cekirdegi hazir"
foreach ($lib in @("ArduinoJson", "NimBLE-Arduino")) {
  if (-not (& arduino-cli lib list 2>$null | Select-String ([regex]::Escape($lib)))) {
    Uyari "$lib kuruluyor..."
    & arduino-cli lib install $lib
  }
}
Tamam "kutuphaneler hazir (ArduinoJson, NimBLE-Arduino)"

if (-not $Port) {
  Adim "ESP32 portu araniyor"
  $liste = & arduino-cli board list 2>$null
  # 1) Once bilinen USB-seri cipleri ara (kesin ESP32/USB-UART).
  $satir = $liste | Select-String "esp32|CP210|CH340|CH910|USB-SERIAL|Silicon|wchusb" | Select-Object -First 1
  # 2) Bulamazsan "Unknown" olsa da USB uzerinden gelen ilk seri portu al.
  if (-not $satir) { $satir = $liste | Select-String "Serial Port \(USB\)" | Select-Object -First 1 }
  # 3) Son care: COMx ile baslayan ilk satir.
  if (-not $satir) { $satir = $liste | Select-String "^COM\d+\s" | Select-Object -First 1 }
  if ($satir) { $Port = ($satir.ToString().Trim() -split '\s+')[0] }
}
if (-not $Port) {
  Write-Host "Port otomatik bulunamadi. Takili mi? Suradan secip -Port ile ver (or. -Port COM5):" -ForegroundColor Red
  & arduino-cli board list
  exit 1
}
Tamam "port: $Port"

Adim "Derleniyor"
& arduino-cli compile --fqbn $Fqbn $sketch
if ($LASTEXITCODE -ne 0) { Write-Host "Derleme hatasi (yukariya bak)." -ForegroundColor Red; exit 1 }
Tamam "derlendi"

Adim "Yukleniyor ($Port)"
& arduino-cli upload -p $Port --fqbn $Fqbn $sketch
if ($LASTEXITCODE -ne 0) {
  Write-Host "Yukleme hatasi. Port dogru mu? Kart BOOT dugmesine basili tutmayi deneyebilirsin." -ForegroundColor Red
  exit 1
}
Tamam "yuklendi"

if ($Monitor) {
  Adim "Seri monitor ($Baud) - cikmak icin Ctrl+C"
  & arduino-cli monitor -p $Port -c baudrate=$Baud
} else {
  Tamam "bitti (monitor atlandi)"
}
