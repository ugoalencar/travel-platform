# Database Conventions

## Naming

### Tables

- Use plural table names: `users`, `customers`, `trips`.
- Use snake_case: `customer_accounts`, `offer_status`.

### Columns

- Use snake_case: `agency_id`, `created_at`, `updated_at`.
- Use `id` for primary keys.
- Use explicit foreign key names such as `user_id`, `customer_id`, `sale_id`.

### Indexes

- Prefix index names with the table name.
- Include `agency_id` in indexes used for tenant-scoped queries.
- Create indexes for important foreign keys and high-traffic filters.

## Required Tenant Columns

Tenant-scoped tables must include:

- `id`
- `agency_id`
- `created_at`
- `updated_at`

Soft-deletable tables should include:

- `deleted_at`

## Data Types

| Concept | PostgreSQL | Notes |
|---------|------------|-------|
| IDs | `TEXT` with UUID values | Current SQL uses `gen_random_uuid()::TEXT` |
| Strings | `TEXT` | General text values |
| Money | `NUMERIC(10, 2)` | Non-negative checks where applicable |
| Dates | `DATE` or `TIMESTAMPTZ` | Use `DATE` for trip/wish calendar dates |
| JSON | `JSONB` | Only when structured columns are not appropriate |

## Migration Rules

1. Do not execute migrations without explicit authorization.
2. Do not use `prisma migrate`, `prisma db push`, or `prisma generate` without explicit authorization.
3. Version approved SQL artifacts in `infrastructure/migrations/`.
4. Test migrations with `npm run test:db`.
5. Preserve `agency_id`, tenant-safe FKs, and RLS.
6. Document decision changes in ADRs when the architecture changes.

## Review Checklist

- [ ] Migration tested locally with disposable PostgreSQL.
- [ ] RLS enabled and forced where required.
- [ ] Runtime role tested, not only admin role.
- [ ] `agency_id` present in tenant-scoped entities.
- [ ] Indexes created for tenant-scoped access paths.
- [ ] Documentation updated.
