# Testing Strategy

## Principles

1. Tests document expected behavior.
2. Fast tests stay separate from database/RLS integration tests.
3. Tenant isolation and fail-closed behavior are mandatory security checks.
4. CI must fail on lint, typecheck, tests, database/RLS regressions, or build failures.

## Current Commands

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run test:coverage
npm run build
```

## Test Types

| Type | Command | Notes |
|------|---------|-------|
| Fast/unit/security | `npm run test` | Current fast Vitest suite |
| Database/RLS integration | `npm run test:db` | Disposable PostgreSQL locally, service container in CI |
| Coverage | `npm run test:coverage` | Informational unless a policy later defines thresholds |

## Database/RLS Integration

See `docs/07-testing/database-integration-tests.md`.

The database suite validates:

- SQL migrations 001 and 002;
- V1 table set;
- tenant-safe composite FKs;
- Wish constraints;
- Customer soft-delete uniqueness;
- CustomerAccount 0..1 behavior;
- Proposal snapshot behavior;
- runtime role without `BYPASSRLS`;
- RLS select/insert/update/delete;
- invalid tenant behavior;
- fail-closed behavior.

## CI

The CI workflow is `.github/workflows/ci.yml`.

Required steps:

```powershell
npm ci
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run build
```
