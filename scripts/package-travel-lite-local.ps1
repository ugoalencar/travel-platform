param(
  [string]$Version = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [string]$OutDir
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
if (-not $OutDir) { $OutDir = Join-Path $repoRoot "release\travel-lite-local-$Version" }
$outPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutDir)
$imageName = 'travel-lite-local:latest'
$dockerfile = Join-Path $repoRoot 'Dockerfile.travel-lite'
$packageSource = Join-Path $repoRoot 'packaging\travel-lite'
$imageDir = Join-Path $outPath 'images'

if (-not (Test-Path -LiteralPath $dockerfile)) { throw "Dockerfile not found: $dockerfile" }
if (-not (Test-Path -LiteralPath $packageSource)) { throw "Packaging source not found: $packageSource" }

if (Test-Path -LiteralPath $outPath) {
  throw "Output directory already exists: $outPath"
}

New-Item -ItemType Directory -Path $outPath | Out-Null
New-Item -ItemType Directory -Path $imageDir | Out-Null

Push-Location $repoRoot
try {
  npm --workspace services/api-lite run build
  if ($LASTEXITCODE -ne 0) { throw 'api-lite build failed.' }
  npm --workspace apps/travel-lite run build
  if ($LASTEXITCODE -ne 0) { throw 'travel-lite build failed.' }

  docker build -f $dockerfile -t $imageName .
  if ($LASTEXITCODE -ne 0) { throw 'Docker image build failed.' }

  docker save -o (Join-Path $imageDir 'travel-lite-api.tar') $imageName
  if ($LASTEXITCODE -ne 0) { throw 'Docker image save failed.' }

  Copy-Item -Path (Join-Path $packageSource '*') -Destination $outPath -Recurse -Force

  $readme = Join-Path $outPath 'README-USUARIO.txt'
  @(
    'TRAVEL LITE - PACOTE LOCAL WINDOWS'
    ''
    'Requisitos: Docker Desktop instalado e em execucao.'
    ''
    'Instalar:'
    '  1. Abra PowerShell nesta pasta.'
    '  2. Execute: powershell -ExecutionPolicy Bypass -File .\install-travel-lite.ps1'
    '  3. Informe a senha inicial quando solicitado.'
    ''
    'Abrir depois de instalado:'
    '  .\travel-lite-start.ps1'
    '  http://127.0.0.1:4010'
    ''
    'Backup:'
    '  .\travel-lite-backup.ps1'
    ''
    'Parar:'
    '  .\travel-lite-stop.ps1'
    ''
    'Restaurar backup local:'
    '  .\travel-lite-restore.ps1 -Archive .\backups\travel-lite-YYYYMMDD-HHMMSS.sql.gz'
    ''
    'Observacao: este pacote usa banco local dedicado do Travel Lite e nao deve apontar para o banco principal da Travel Platform.'
  ) | Set-Content -LiteralPath $readme -Encoding utf8

  Compress-Archive -Path (Join-Path $outPath '*') -DestinationPath "$outPath.zip" -Force
  Write-Output "Package directory: $outPath"
  Write-Output "Package archive:   $outPath.zip"
}
finally {
  Pop-Location
}
