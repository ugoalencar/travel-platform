# Environments

## Current Status

Only local development and CI test environments are documented as active.

Staging and production are not configured yet.

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

## Rules

- Do not access production or staging without explicit authorization.
- Do not store real secrets in repository files.
- Do not use production/staging `DATABASE_URL` in tests.
- Do not expose credentials in logs.
