param(
  [switch]$NoBrowser
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
  docker compose --env-file $envFile -f $composeFile up -d
  if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed.' }

  $deadline = (Get-Date).AddSeconds(90)
  do {
    Start-Sleep -Seconds 2
    $health = "$(docker inspect -f '{{.State.Health.Status}}' travel-lite-api 2>$null)".Trim()
  } while ($health -ne 'healthy' -and (Get-Date) -lt $deadline)

  if ($health -ne 'healthy') { throw 'Travel Lite API did not become healthy in 90 seconds.' }

  Write-Output 'Travel Lite is running at http://127.0.0.1:4010'
  if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:4010' | Out-Null }
}
finally {
  Pop-Location
}
