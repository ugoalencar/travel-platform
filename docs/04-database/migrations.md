# Database Migrations

## Current V1 Strategy

The current approved V1 database artifacts are versioned SQL files:

- `infrastructure/migrations/001_initial_schema.sql`
- `infrastructure/migrations/002_rls_policies.sql`

These files are validated by `npm run test:db`.

Do not replace these checks with Prisma migrations unless a future approved ADR
changes the strategy.

## Rules

- Do not run migrations without explicit authorization.
- Do not run migrations against production, staging, shared databases, or real data without explicit authorization.
- Do not run `prisma migrate`, `prisma db push`, or `prisma generate` unless the task explicitly allows it.
- New tenant-scoped tables must include `agency_id`.
- RLS policy changes must be tested with a runtime role, not only an admin role.
- Changes must preserve fail-closed behavior when tenant context is absent.

## Local Validation

Use:

```powershell
npm run test:db
```

This applies the SQL migrations to a disposable PostgreSQL database and validates:

- schema creation;
- V1 table set;
- tenant-safe composite FKs;
- Wish constraints;
- Customer soft-delete uniqueness;
- CustomerAccount 0..1 behavior;
- Proposal snapshot behavior;
- RLS select/insert/update/delete;
- invalid tenant behavior;
- fail-closed behavior;
- runtime role grants and `BYPASSRLS` flags.

## Review Checklist

- [ ] Migration file is versioned.
- [ ] No destructive operation is hidden in the migration.
- [ ] Tenant isolation is preserved.
- [ ] RLS is enabled and forced where required.
- [ ] Runtime grants are reviewed.
- [ ] `npm run test:db` passes.
- [ ] Documentation and ADRs are updated when decisions change.
