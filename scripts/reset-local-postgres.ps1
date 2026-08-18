Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$composeFile = Join-Path $repoRoot 'infrastructure/docker-compose.local-postgres.yml'
$migration001 = Join-Path $repoRoot 'infrastructure/migrations/001_initial_schema.sql'
$migration002 = Join-Path $repoRoot 'infrastructure/migrations/002_rls_policies.sql'

if (-not (Test-Path -LiteralPath $composeFile)) {
  throw "Local PostgreSQL compose file not found: $composeFile"
}

if (-not (Test-Path -LiteralPath $migration001) -or -not (Test-Path -LiteralPath $migration002)) {
  throw 'Expected local migration files were not found. Refusing to reset.'
}

Push-Location $repoRoot
try {
  docker compose -f $composeFile -p travel-platform-local-postgres down -v
  docker compose -f $composeFile -p travel-platform-local-postgres up -d
}
finally {
  Pop-Location
}
