# Release Runbook

Antes:
- main clean
- CI green
- migration validate
- security green
- staging green
- backup atual
- rollback plan

Deploy:
- expand-safe migration
- deploy
- smoke
- monitor
- canary
- rollout

Depois:
- métricas
- erros
- tenant isolation
- registrar version/build/migration
