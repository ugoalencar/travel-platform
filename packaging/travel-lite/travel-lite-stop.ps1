param(
  [switch]$Purge
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$installDir = Resolve-Path $PSScriptRoot
$composeFile = Join-Path $installDir 'docker-compose.travel-lite.local.yml'
$envFile = Join-Path $installDir '.env.travel-lite'

if (-not (Test-Path -LiteralPath $composeFile)) { throw "Compose file not found: $composeFile" }
if (-not (Test-Path -LiteralPath $envFile)) { throw "Environment file not found. Run install-travel-lite.ps1 first." }

Push-Location $installDir
try {
  if ($Purge) {
    $answer = Read-Host 'This deletes the local Travel Lite database volume. Type "purge" to confirm'
    if ($answer -ne 'purge') { throw 'Aborted: confirmation not received.' }
    docker compose --env-file $envFile -f $composeFile down -v
  } else {
    docker compose --env-file $envFile -f $composeFile down
  }
  if ($LASTEXITCODE -ne 0) { throw 'docker compose down failed.' }
}
finally {
  Pop-Location
}
