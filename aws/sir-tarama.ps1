<#
  sir-tarama.ps1 - Gizli anahtar / sir sizintisi tarayicisi (yerel, ek program gerekmez).

  Repoda ve ozellikle DAGITILAN frontend ciktisinda (dist/, herkese acik) gizli
  anahtar, parola, token, AWS anahtari, private key sizmis mi diye tarar.
  Hicbir sey disariya gondermez; tamamen yerel calisir.

  Kullanim (PowerShell, C:\dennis):
    .\aws\sir-tarama.ps1
#>
[CmdletBinding()]
param(
  [string]$Kok = (Resolve-Path "$PSScriptRoot\..").Path
)
$ErrorActionPreference = "Continue"

# Taranacak uzantilar; node_modules / .git / yedekler haric tutulur.
$uzantilar = @('*.js','*.mjs','*.jsx','*.ts','*.tsx','*.py','*.json','*.yml','*.yaml',
               '*.ps1','*.html','*.css','*.env','*.env.*','*.txt','*.md')
$haric = '(\\|/)(node_modules|\.git|\.vite|coverage)(\\|/)'

# Desen -> aciklama (gercek sir desenleri; genel/public degerler disarida birakilir)
$desenler = [ordered]@{
  'AWS Access Key ID'       = 'A(KIA|SIA)[0-9A-Z]{16}'
  'Private key blogu'       = 'BEGIN ([A-Z ]*)?PRIVATE KEY'
  'Google API key'          = 'AIza[0-9A-Za-z_\-]{30,}'
  'OpenAI/sk- anahtar'      = 'sk-[A-Za-z0-9]{20,}'
  'Google OAuth token'      = 'ya29\.[A-Za-z0-9_\-]{20,}'
  'Slack token'             = 'xox[baprs]-[A-Za-z0-9\-]{10,}'
  'Gomulu parola/secret'    = '(?i)(password|passwd|secret|api[_-]?key|access[_-]?token|vapid[_-]?ozel|private[_-]?key)\s*[:=]\s*["''][^"''$\{<]{12,}["'']'
}
# Bunlari icerirse false-positive say (ornek/sablon/public degerler)
$gurultu = '(?i)(example|placeholder|your[_-]|xxxx|dummy|<[^>]+>|sample|VITE_|import\.meta|os\.environ|getenv|process\.env)'

Write-Host "`nDennis sir-tarama baslatiliyor: $Kok`n" -ForegroundColor Cyan
$dosyalar = Get-ChildItem -Path $Kok -Recurse -File -Include $uzantilar -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notmatch $haric }

$bulgu = 0
foreach ($f in $dosyalar) {
  $metin = Get-Content -Path $f.FullName -Raw -ErrorAction SilentlyContinue
  if (-not $metin) { continue }
  foreach ($ad in $desenler.Keys) {
    foreach ($m in [regex]::Matches($metin, $desenler[$ad])) {
      $parca = $m.Value
      if ($parca -match $gurultu) { continue }
      $bulgu++
      $goster = if ($parca.Length -gt 60) { $parca.Substring(0,60) + '...' } else { $parca }
      Write-Host ("  [!] {0}" -f $ad) -ForegroundColor Red
      Write-Host ("      {0}" -f ($f.FullName.Replace($Kok,'.'))) -ForegroundColor Yellow
      Write-Host ("      {0}" -f $goster) -ForegroundColor DarkGray
    }
  }
}

Write-Host ""
if ($bulgu -eq 0) {
  Write-Host "TEMIZ: Gizli anahtar / sir sizintisi bulunamadi." -ForegroundColor Green
  Write-Host "(Frontend dist/ dahil tarandi; VITE_* ve os.environ gibi public/guvenli kullanimlar haric tutuldu.)" -ForegroundColor DarkGray
} else {
  Write-Host "DIKKAT: $bulgu olasi sizinti bulundu. Yukaridaki satirlari incele." -ForegroundColor Red
  Write-Host "Not: Bazilari yanlis alarm olabilir; gercek bir anahtarsa HEMEN iptal/rotate et." -ForegroundColor Yellow
}
Write-Host ""
