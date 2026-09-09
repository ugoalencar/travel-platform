# Task 1: Customer Core Field Extensions

## Overview
Extend the PostgreSQL `customers` table with new profile fields (RG, national ID type, birth date, nationality, WhatsApp) and create a new `customer_addresses` table to replace the legacy JSON address field with structured, tenant-scoped data.

## Deliverables

### 1. Create Migration 019: Customer Core Fields + Structured Addresses

**File:** `infrastructure/migrations/019_customer_360_addresses.sql`

**SQL Requirements:**
- Add 5 new columns to `customers` table (all nullable):
  - `rg TEXT` - National ID (RG in Brazil)
  - `national_id_type TEXT` - Type identifier
  - `birth_date DATE` - Birth date
  - `nationality TEXT` - Nationality
  - `whatsapp TEXT` - WhatsApp number
  
- Create `AddressType` ENUM with values: `RESIDENTIAL`, `COMMERCIAL`, `TEMPORARY`

- Create `customer_addresses` table with:
  - `id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT`
  - `agency_id TEXT NOT NULL` (FK to agencies)
  - `customer_id TEXT NOT NULL` (composite FK with agency_id to customers)
  - `type AddressType NOT NULL DEFAULT 'RESIDENTIAL'`
  - `is_primary BOOLEAN NOT NULL DEFAULT false`
  - `cep TEXT` (CEP/postal code)
  - `street TEXT NOT NULL`
  - `number TEXT NOT NULL`
  - `complement TEXT`
  - `district TEXT NOT NULL`
  - `city TEXT NOT NULL`
  - `state TEXT NOT NULL`
  - `country TEXT NOT NULL DEFAULT 'Brazil'`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `deleted_at TIMESTAMPTZ`

**Constraints:**
- Composite FK: `agency_id, customer_id` → `customers(agency_id, id)` ON DELETE RESTRICT
- Unique constraint: `(agency_id, id)` for tenant scoping
- Unique constraint: `(agency_id, customer_id, is_primary) WHERE is_primary = true` (one primary per customer)
- CHECK constraint: street, number, district, city, state are not blank

**Indexes:**
- `(agency_id, customer_id) WHERE deleted_at IS NULL`
- `(agency_id, customer_id, is_primary) WHERE deleted_at IS NULL AND is_primary = true`

### 2. Update Schema: Add CustomerAddress Model & Enum

**File:** `packages/database/schema.prisma`

**Add to file (APPEND ONLY, no edits to existing models):**

1. New enum `AddressType`:
```prisma
enum AddressType {
  RESIDENTIAL
  COMMERCIAL
  TEMPORARY
}
```

2. New model `CustomerAddress`:
```prisma
model CustomerAddress {
  id           String        @id @default(dbgenerated("(gen_random_uuid())::text"))
  agencyId     String        @map("agency_id")
  customerId   String        @map("customer_id")
  type         AddressType   @default(RESIDENTIAL)
  isPrimary    Boolean       @default(false) @map("is_primary")
  cep          String?
  street       String
  number       String
  complement   String?
  district     String
  city         String
  state        String
  country      String        @default("Brazil")
  createdAt    DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt    DateTime?     @map("deleted_at") @db.Timestamptz(6)

  agency       Agency        @relation(fields: [agencyId], references: [id], onDelete: Restrict, map: "customer_addresses_agency_fk")
  customer     Customer      @relation("CustomerAddresses", fields: [agencyId, customerId], references: [agencyId, id], onDelete: Restrict, map: "customer_addresses_customer_tenant_fk")

  @@unique([agencyId, id], map: "customer_addresses_agency_id_key")
  @@unique([agencyId, customerId, isPrimary], name: "customer_addresses_one_primary_per_customer", where: @@raw("is_primary = true"))
  @@index([agencyId, customerId], map: "customer_addresses_agency_customer_idx")
  @@map("customer_addresses")
}
```

3. Update `Customer` model (find existing Customer block, add these relations + fields):
   - Add field: `rg String?`
   - Add field: `nationalIdType String? @map("national_id_type")`
   - Add field: `birthDate DateTime? @map("birth_date") @db.Date`
   - Add field: `nationality String?`
   - Add field: `whatsapp String?`
   - Add relation: `addresses CustomerAddress[] @relation("CustomerAddresses")`

4. Update `Agency` model to add relation:
   - Add: `addresses CustomerAddress[]`

## Testing

- Migration applies cleanly with no errors
- Schema validates with `npx prisma validate`
- No typecheck errors after schema update
- No linting errors in generated schema

## Global Constraints (must verify)

- ✓ Additive migration only (no edits to existing migrations 001-018)
- ✓ All tables tenant-scoped with composite FK (agency_id, id)
- ✓ RLS policies will be added in Task 4
- ✓ No breaking changes to existing Customer model
- ✓ P0 = 0, P1 = 0 (no errors, no warnings)

## Report File

Write your implementation report to: `D:\travel-platform\.superpowers\sdd\task-1-report.md`

Include:
1. Migration created successfully (yes/no)
2. Schema updated without errors (yes/no)
3. Validation passed (typecheck, lint) (yes/no)
4. Test results (if any)
5. Commits made (git log -1 --oneline each)
6. Any concerns or deviations from spec

## Success Criteria

- [ ] Migration 019 file exists and applies cleanly
- [ ] Schema.prisma appended (not modified) with AddressType enum, CustomerAddress model, Customer/Agency relation updates
- [ ] No typecheck errors
- [ ] No linting errors
- [ ] Commits follow convention: "feat(database): add customer core fields and address entity"
- [ ] Report file filled with all sections
