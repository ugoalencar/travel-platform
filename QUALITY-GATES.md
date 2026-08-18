# Quality Gates

This is the official source for mandatory quality gates in this repository.

## Principles

- Do not commit broken lint, typecheck, tests, or build.
- Do not bypass security checks to make a change pass.
- Do not run destructive commands without explicit authorization.
- Do not run migrations or database commands unless the task explicitly allows it.
- Database/RLS tests are explicit integration gates, not part of fast unit tests.

## Local Gates

For repository-wide validation, run:

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run build
```

`npm run test` is the fast test suite.

`npm run test:db` starts a disposable local PostgreSQL database, applies
`001_initial_schema.sql` and `002_rls_policies.sql`, and validates constraints,
tenant-safe FKs, runtime role behavior, RLS, fail-closed behavior, and grants.

## Pre-Commit Gate

Before a commit, run at minimum:

```powershell
npm run lint
npm run typecheck
npm run test
```

Use `.\pre-commit.ps1` when a PowerShell wrapper is desired.

## Pre-PR Gate

Before opening a PR, run:

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run build
npm run secrets:scan
npm run migrations:validate
```

Use `.\pre-pr.ps1` when a PowerShell wrapper is desired.

## CI Gate

The CI workflow in `.github/workflows/ci.yml` must fail the PR if any of these
steps fail:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run test:db`
6. `npm run build`

The CI uses PostgreSQL 15 as an ephemeral service container with fictitious
test credentials only.

## Security Gates

Required security checks:

- No real `.env` files committed.
- No secrets, credentials, private keys, tokens, or database dumps committed.
- No production or staging access from tests.
- No `prisma migrate`, `prisma db push`, or `prisma generate` unless explicitly authorized.
- Tenant isolation must be validated at application and database layers.
- RLS must fail closed when tenant context is absent.

## Documentation Links

- Script usage: `SCRIPTS.md`
- Pre-commit checklist: `.ai/checklists/pre-commit.md`
- Pre-PR checklist: `.ai/checklists/pre-pr.md`
- Destructive command checklist: `.ai/checklists/destructive-commands.md`
- Database integration tests: `docs/07-testing/database-integration-tests.md`
