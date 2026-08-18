# Deployment

Deployment is deferred.

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
- monitoring and incident response;
- branch protection and required checks.
