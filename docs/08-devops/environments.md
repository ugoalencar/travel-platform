# Environments

## Current Status

Only local development and CI test environments are active.

Staging and production infrastructure are not configured yet. A staging
readiness baseline exists for application checks, quality gates, and
backup/recovery expectations, but no external environment, provider, or secrets
are defined in this repository.

## Local Development

Use `.env.example` as the template for local environment variables.

Real `.env` files must not be committed.

The approved disposable PostgreSQL test environment is:

- Compose file: `infrastructure/docker-compose.local-postgres.yml`
- Host: `127.0.0.1`
- Port: `55432`
- Database: `travel_platform_test`
- Data: disposable Docker volume

## CI Test Environment

The GitHub Actions CI uses PostgreSQL 15 as an ephemeral service container with
fictitious credentials.

The database/RLS test suite requires:

- `DATABASE_TEST_MODE=ci`
- `DATABASE_TEST_HOST=127.0.0.1`
- `DATABASE_TEST_PORT=5432`
- `DATABASE_TEST_NAME=travel_platform_test`
- `DATABASE_TEST_USER=travel_test`
- `DATABASE_TEST_PASSWORD=travel_test_password`

These values are test-only and must not be reused for real environments.

## Future Environments

Development, staging, and production environments require a future approved
decision before configuration.

That decision must define:

- hosting provider;
- database provider;
- secret management;
- deployment workflow;
- migration workflow;
- monitoring and rollback procedures.
- backup and recovery implementation.

## Staging Readiness Baseline

Before a real staging environment or pilot is used:

- run all quality gates from `QUALITY-GATES.md`;
- apply all ordered SQL migrations from `infrastructure/migrations/*.sql` to an
  empty disposable database;
- verify `/health` and `/readiness`;
- run a staging smoke test that covers tenant proof, Customer Portal, booking
  concurrency/capacity, Field Operations checkpoint concurrency, Sale/Receivable
  synchronization, Commercial Cockpit, PipelineAccess, Customer 360, and
  Pescador manual capture;
- validate backup/restore expectations in
  `docs/08-devops/backup-and-recovery.md`.

## Rules

- Do not access production or staging without explicit authorization.
- Do not store real secrets in repository files.
- Do not use production/staging `DATABASE_URL` in tests.
- Do not expose credentials in logs.
