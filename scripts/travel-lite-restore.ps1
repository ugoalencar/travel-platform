param(
  [Parameter(Mandatory = $true)]
  [string]$Archive,
  [switch]$Force
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Travel Lite — restaura um backup local (.sql.gz) no banco dedicado.
# DESTRUTIVO: o schema public atual é descartado antes da restauração.
# Uso: .\scripts\travel-lite-restore.ps1 -Archive backups\travel-lite-<ts>.sql.gz
# Nunca rode contra produção/staging.

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
if (-not (Test-Path -LiteralPath $Archive)) {
  throw "Backup file not found: $Archive"
}
$fullArchive = (Resolve-Path -LiteralPath $Archive).Path

if (-not $Force) {
  $answer = Read-Host "Isso DESCARTA o schema public atual e restaura $fullArchive. Digite \"restaure\" para confirmar"
  if ($answer -ne 'restaure') { throw 'Abortado: confirmação não recebida.' }
}

$running = "$(docker inspect -f '{{.State.Running}}' travel-lite-postgres 2>$null)".Trim()
if ($running -ne 'true') { throw 'Container travel-lite-postgres não está em execução.' }

docker cp $fullArchive 'travel-lite-postgres:/tmp/travel-lite-restore.sql.gz'
if ($LASTEXITCODE -ne 0) { throw 'docker cp do arquivo de backup falhou.' }

docker exec travel-lite-postgres sh -c "set -e; psql -U travel_lite_admin -d travel_lite -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE;' -c 'CREATE SCHEMA public;'; gunzip -c /tmp/travel-lite-restore.sql.gz | psql -U travel_lite_admin -d travel_lite -v ON_ERROR_STOP=1; rm -f /tmp/travel-lite-restore.sql.gz"
if ($LASTEXITCODE -ne 0) {
  throw 'Restauração falhou (ON_ERROR_STOP). O banco pode estar incompleto — restaure de novo a partir do backup.'
}

Write-Output "Restaurado a partir de: $fullArchive"
