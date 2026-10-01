param(
  [string]$InstallDir = "$env:USERPROFILE\TravelLite",
  [switch]$NoSeed,
  [switch]$NoShortcut,
  [switch]$NoBrowser
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function New-Secret([int]$Bytes = 32) {
  $buffer = [byte[]]::new($Bytes)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function ConvertTo-PlainText([securestring]$Value) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Assert-Docker() {
  docker version | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'Docker Desktop/Engine is not available. Start Docker Desktop and run the installer again.'
  }
}

function Wait-ContainerHealth([string]$Name, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    Start-Sleep -Seconds 2
    $health = "$(docker inspect -f '{{.State.Health.Status}}' $Name 2>$null)".Trim()
  } while ($health -ne 'healthy' -and (Get-Date) -lt $deadline)
  if ($health -ne 'healthy') { throw "$Name did not become healthy in $Seconds seconds." }
}

$packageDir = Resolve-Path $PSScriptRoot
$targetDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($InstallDir)
$composeFile = Join-Path $targetDir 'docker-compose.travel-lite.local.yml'
$envFile = Join-Path $targetDir '.env.travel-lite'
$imageArchive = Join-Path $targetDir 'images\travel-lite-api.tar'

Assert-Docker

if (-not (Test-Path -LiteralPath $targetDir)) {
  New-Item -ItemType Directory -Path $targetDir | Out-Null
}

Copy-Item -Path (Join-Path $packageDir '*') -Destination $targetDir -Recurse -Force

if (Test-Path -LiteralPath $imageArchive) {
  docker load -i $imageArchive
  if ($LASTEXITCODE -ne 0) { throw 'Failed to load Travel Lite Docker image.' }
}
else {
  Write-Warning "Image archive not found at $imageArchive. The image must already exist locally."
}

if (-not (Test-Path -LiteralPath $envFile)) {
  $databaseCredential = New-Secret
  $runtimeCredential = New-Secret
  @(
    'TRAVEL_LITE_IMAGE=travel-lite-local:latest'
    'TRAVEL_LITE_APP_PORT=4010'
    'TRAVEL_LITE_DB_PORT=55436'
    "TRAVEL_LITE_DB_PASSWORD=$databaseCredential"
    "TRAVEL_LITE_RUNTIME_DB_PASSWORD=$runtimeCredential"
  ) | Set-Content -LiteralPath $envFile -Encoding utf8
}

$initialCredential = $null
if (-not $NoSeed) {
  if ($env:TRAVEL_LITE_SEED_PASSWORD) {
    $initialCredential = $env:TRAVEL_LITE_SEED_PASSWORD
  }
  else {
    $secure = Read-Host 'Senha inicial para os logins Gadotti (mínimo 8 caracteres)' -AsSecureString
    $initialCredential = ConvertTo-PlainText $secure
  }
  if ($initialCredential.Length -lt 8) { throw 'Initial password must be at least 8 characters.' }
}

Push-Location $targetDir
try {
  docker compose --env-file $envFile -f $composeFile up -d postgres
  if ($LASTEXITCODE -ne 0) { throw 'Failed to start PostgreSQL.' }
  Wait-ContainerHealth 'travel-lite-postgres' 90

  $databaseCredentialLine = Select-String -LiteralPath $envFile -Pattern '^TRAVEL_LITE_DB_PASSWORD='
  if (-not $databaseCredentialLine) { throw 'TRAVEL_LITE_DB_PASSWORD is missing from .env.travel-lite.' }
  $databaseCredential = ($databaseCredentialLine.Line -replace '^TRAVEL_LITE_DB_PASSWORD=', '')
  $adminUrl = "postgresql://travel_lite_admin:$databaseCredential@postgres:5432/travel_lite"

  docker compose --env-file $envFile -f $composeFile run --rm -e "MIGRATIONS_DATABASE_URL=$adminUrl" -e NODE_ENV=local api node scripts/travel-lite-migrate.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Travel Lite migrations failed.' }

  if (-not $NoSeed) {
    docker compose --env-file $envFile -f $composeFile run --rm -e "MIGRATIONS_DATABASE_URL=$adminUrl" -e NODE_ENV=local -e "TRAVEL_LITE_SEED_PASSWORD=$initialCredential" api node scripts/travel-lite-seed-gadotti.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Travel Lite Gadotti seed failed.' }
  }

  docker compose --env-file $envFile -f $composeFile up -d
  if ($LASTEXITCODE -ne 0) { throw 'Failed to start Travel Lite.' }
  Wait-ContainerHealth 'travel-lite-api' 90

  if (-not $NoShortcut) {
    $shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Travel Lite.lnk'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = 'powershell.exe'
    $shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$targetDir\travel-lite-start.ps1`""
    $shortcut.WorkingDirectory = $targetDir
    $shortcut.Save()
  }

  Write-Output 'Travel Lite installed successfully.'
  Write-Output 'Open: http://127.0.0.1:4010'
  if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:4010' | Out-Null }
}
finally {
  if ($null -ne $initialCredential) { $initialCredential = $null }
  Pop-Location
}
