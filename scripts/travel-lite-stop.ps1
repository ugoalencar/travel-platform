param(
  [switch]$Purge
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Travel Lite — para a pilha local. -Purge apaga TAMBÉM o volume do banco
# (exige confirmação explícita). Nunca rode contra produção/staging.

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$composeFile = Join-Path $repoRoot 'docker-compose.travel-lite.yml'

if (-not (Test-Path -LiteralPath $composeFile)) {
  throw "Travel Lite compose file not found: $composeFile"
}

Push-Location $repoRoot
try {
  if ($Purge) {
    $answer = Read-Host 'Isso APAGA o volume do banco local do Travel Lite (dados perdidos). Digite "purge" para confirmar'
    if ($answer -ne 'purge') { throw 'Abortado: confirmação não recebida.' }
    docker compose -f $composeFile down -v
  }
  else {
    docker compose -f $composeFile down
  }
  if ($LASTEXITCODE -ne 0) { throw 'docker compose down falhou.' }
}
finally {
  Pop-Location
}
