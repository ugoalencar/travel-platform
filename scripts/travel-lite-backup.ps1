param(
  [string]$OutDir
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Travel Lite — backup local (pg_dump SQL gzip) do banco dedicado.
# Uso: .\scripts\travel-lite-backup.ps1 [-OutDir <pasta>]
# Arquivos gerados em backups/ (gitignored) — podem conter dados reais.

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
if (-not $OutDir) { $OutDir = Join-Path $repoRoot 'backups' }
if (-not (Test-Path -LiteralPath $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$running = "$(docker inspect -f '{{.State.Running}}' travel-lite-postgres 2>$null)".Trim()
if ($running -ne 'true') { throw 'Container travel-lite-postgres não está em execução.' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dest = Join-Path $OutDir "travel-lite-$stamp.sql.gz"

docker exec travel-lite-postgres sh -c "pg_dump -U travel_lite_admin -f /tmp/travel-lite-backup.sql travel_lite && gzip -f /tmp/travel-lite-backup.sql"
if ($LASTEXITCODE -ne 0) { throw 'pg_dump falhou.' }

docker cp "travel-lite-postgres:/tmp/travel-lite-backup.sql.gz" $dest
if ($LASTEXITCODE -ne 0) { throw 'docker cp do backup falhou.' }

docker exec travel-lite-postgres sh -c "rm -f /tmp/travel-lite-backup.sql.gz" | Out-Null

Write-Output "Backup gerado: $dest"
