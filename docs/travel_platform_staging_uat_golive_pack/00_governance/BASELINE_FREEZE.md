# Freeze do baseline

Registrar:
- main HEAD
- appVersion
- buildSha
- migrationVersion

Rodar antes do staging:
- git status
- typecheck
- lint
- unit
- security tests
- build
- secrets scan
- migrations validate

Durante UAT, nenhuma feature nova entra sem reabrir baseline.
