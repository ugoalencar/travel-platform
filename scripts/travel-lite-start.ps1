param(
  [switch]$Seed,
  [switch]$NoMigrate
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Travel Lite — sobe a pilha local (PostgreSQL 17 + API servindo o frontend
# buildado), aplica migrations do diretório dedicado e opcionalmente roda o
# seed da agência. Uso: .\scripts\travel-lite-start.ps1 [-Seed] [-NoMigrate]

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$composeFile = Join-Path $repoRoot 'docker-compose.travel-lite.yml'
$migrateScript = Join-Path $repoRoot 'scripts/travel-lite-migrate.cjs'
$seedScript = Join-Path $repoRoot 'scripts/travel-lite-seed-gadotti.cjs'

if (-not (Test-Path -LiteralPath $composeFile)) {
  throw "Travel Lite compose file not found: $composeFile"
}

# Carrega .env.travel-lite (gitignored) no processo atual, sem imprimir valores.
$envFile = Join-Path $repoRoot '.env.travel-lite'
if (Test-Path -LiteralPath $envFile) {
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
      $value = $Matches[2].Trim().Trim('"').Trim("'")
      if ($value -ne '') {
        [Environment]::SetEnvironmentVariable($Matches[1], $value, 'Process')
      }
    }
  }
}

$dbPassword = if ($env:TRAVEL_LITE_DB_PASSWORD) { $env:TRAVEL_LITE_DB_PASSWORD } else { 'travel_lite_admin_password' }
$env:MIGRATIONS_DATABASE_URL = "postgresql://travel_lite_admin:$dbPassword@127.0.0.1:55436/travel_lite"

Push-Location $repoRoot
try {
  docker compose -f $composeFile up -d --build postgres
  if ($LASTEXITCODE -ne 0) { throw 'docker compose up (postgres) falhou.' }

  $deadline = (Get-Date).AddSeconds(90)
  $status = ''
  do {
    Start-Sleep -Seconds 2
    $status = "$(docker inspect -f '{{.State.Health.Status}}' travel-lite-postgres 2>$null)".Trim()
  } while ($status -ne 'healthy' -and (Get-Date) -lt $deadline)
  if ($status -ne 'healthy') { throw 'PostgreSQL não ficou healthy em 90s.' }

  if (-not $NoMigrate) {
    node $migrateScript
    if ($LASTEXITCODE -ne 0) { throw 'travel-lite-migrate.cjs falhou.' }
  }

  if ($Seed) {
    if (-not $env:TRAVEL_LITE_SEED_PASSWORD) {
      throw 'Defina TRAVEL_LITE_SEED_PASSWORD (em .env.travel-lite) antes de usar -Seed. Nenhuma senha é hardcoded.'
    }
    node $seedScript
    if ($LASTEXITCODE -ne 0) { throw 'travel-lite-seed-gadotti.cjs falhou.' }
  }

  docker compose -f $composeFile up -d --build api
  if ($LASTEXITCODE -ne 0) { throw 'docker compose up (api) falhou.' }

  Write-Output 'Travel Lite em execução:'
  Write-Output '  Aplicação: http://127.0.0.1:4010'
  Write-Output '  Health:     http://127.0.0.1:4010/health'
}
finally {
  Pop-Location
}
