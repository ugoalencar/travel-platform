# Migration Runbook

Usar o mecanismo oficial de SQL migrations do repositório.

Não substituir por `prisma migrate deploy` sem evidência arquitetural explícita.

Ordem:
1. backup staging
2. migrations validate
3. aplicar migrations
4. confirmar schema
5. RLS runtime tests
6. seed sintético
7. smoke DB

Não reescrever migration já aplicada.
