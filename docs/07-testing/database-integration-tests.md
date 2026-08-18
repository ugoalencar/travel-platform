# Testes de integração de banco e RLS

Os testes de banco validam localmente as migrations SQL versionadas e as policies de RLS.

## Escopo

- Sobe PostgreSQL local descartável via Docker Compose.
- Aplica `infrastructure/migrations/001_initial_schema.sql`.
- Executa testes de constraints e FKs tenant-safe.
- Aplica `infrastructure/migrations/002_rls_policies.sql`.
- Cria uma role runtime local sem `SUPERUSER` e sem `BYPASSRLS`.
- Executa testes RLS usando a role runtime.
- Derruba o container e remove o volume local ao final.

## Execução

```powershell
npm run test:db
```

O teste usa somente:

- host: `127.0.0.1`
- porta: `55432`
- database: `travel_platform_test`
- container: `travel-platform-postgres-local`

## Segurança

Nunca aponte `test:db` para banco externo.

A suite aborta se detectar:

- host diferente de `localhost` ou `127.0.0.1`;
- porta diferente da porta local aprovada;
- database sem marcador `test`;
- ambiente marcado como `production`, `prod`, `staging` ou `stage`;
- `DATABASE_URL` apontando para banco fora do ambiente local/teste aprovado.

Senhas e connection strings completas não devem ser impressas em logs.

## Reset local

A suite executa reset seguro do compose local antes dos testes e remove o volume ao final.

Para reset manual do mesmo ambiente:

```powershell
.\scripts\reset-local-postgres.ps1
```

Esse script usa apenas `infrastructure/docker-compose.local-postgres.yml`.

## Interpretação de falhas

- Falha na migration 001: corrigir primeiro o schema SQL inicial.
- Falha nos testes de constraints: corrigir constraints, FKs compostas ou fixtures fictícias.
- Falha na migration 002: corrigir funções/policies RLS antes de testar runtime.
- Falha RLS: investigar tenant context SQL, policies, `FORCE RLS`, grants ou role runtime.

## CI futuro

O workflow `.github/workflows/ci.yml` executa estes testes com PostgreSQL efêmero como service container do GitHub Actions.

O job define somente variáveis fictícias de teste:

- `DATABASE_TEST_MODE=ci`
- `DATABASE_TEST_HOST=127.0.0.1`
- `DATABASE_TEST_PORT=5432`
- `DATABASE_TEST_NAME=travel_platform_test`
- `DATABASE_TEST_USER=travel_test`
- `DATABASE_TEST_PASSWORD=travel_test_password`

A suite continua usando `assertSafeTestDatabase()` no CI. Não existe bypass especial para GitHub Actions.

O CI executa:

```powershell
npm ci
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run build
```

O workflow não configura deploy, staging, production, Terraform, registry publish ou secrets reais.
