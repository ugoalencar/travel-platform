# Deployment

Deployment is deferred.

The application now exposes separate `/health` and `/readiness` endpoints for
deployment orchestration. `/health` confirms the API process is alive;
`/readiness` is wired by `services/api/src/server.ts` to a PostgreSQL
connectivity check and returns 503 without leaking dependency details when the
check fails.

## Current CI

The current workflow is CI only:

- `.github/workflows/ci.yml`
- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:db`
- `npm run build`

The CI uses PostgreSQL 15 as an ephemeral service container for database/RLS
tests.

## Not Configured Yet

The repository does not currently define:

- production deploy;
- staging deploy;
- Docker registry publishing;
- Terraform execution;
- cloud provider deployment;
- production database migration workflow.

## Rules

- Do not deploy without explicit authorization.
- Do not configure production or staging without an approved decision.
- Do not use real credentials in CI.
- Do not run `prisma migrate`, `prisma db push`, or `prisma generate` unless explicitly authorized.
- Do not run migrations against production, staging, shared databases, or real data unless explicitly authorized.

## Future Work

A future deployment design must define:

- target platform;
- environment strategy;
- secret management;
- migration process;
- rollback process;
- backup and recovery process;
- monitoring and incident response;
- branch protection and required checks.

See also `docs/08-devops/backup-and-recovery.md`.
