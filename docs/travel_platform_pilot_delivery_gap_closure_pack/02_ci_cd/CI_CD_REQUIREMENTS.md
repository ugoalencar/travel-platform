# CI/CD Requirements

Primeiro verificar histórico/worktrees para recuperar pipeline anterior.

Pipeline mínimo:
- typecheck
- lint
- test
- test:security
- test:db
- security:check
- secrets:scan
- migrations:validate
- build

PR crítico deve bloquear merge em falha.
DB/RLS usa PostgreSQL efêmero isolado por job.
