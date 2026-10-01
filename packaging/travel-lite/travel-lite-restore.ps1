param(
  [Parameter(Mandatory = $true)]
  [string]$Archive,
  [switch]$Force
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Archive)) { throw "Backup file not found: $Archive" }
$fullArchive = (Resolve-Path -LiteralPath $Archive).Path

if (-not $Force) {
  $answer = Read-Host "This drops the current local public schema and restores $fullArchive. Type `"restore`" to confirm"
  if ($answer -ne 'restore') { throw 'Aborted: confirmation not received.' }
}

$running = "$(docker inspect -f '{{.State.Running}}' travel-lite-postgres 2>$null)".Trim()
if ($running -ne 'true') { throw 'Container travel-lite-postgres is not running.' }

docker cp $fullArchive 'travel-lite-postgres:/tmp/travel-lite-restore.sql.gz'
if ($LASTEXITCODE -ne 0) { throw 'docker cp restore file failed.' }

docker exec travel-lite-postgres sh -c "set -e; psql -U travel_lite_admin -d travel_lite -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE;' -c 'CREATE SCHEMA public;'; gunzip -c /tmp/travel-lite-restore.sql.gz | psql -U travel_lite_admin -d travel_lite -v ON_ERROR_STOP=1; rm -f /tmp/travel-lite-restore.sql.gz"
if ($LASTEXITCODE -ne 0) {
  throw 'Restore failed. The local database may be incomplete; restore again from a known-good backup.'
}

Write-Output "Restored from: $fullArchive"
