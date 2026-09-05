# Local Business Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic local demo that proves Travel Platform works as a real travel-agency operating system, with Finance connected from sale to receivables, payments, payables, cash, reconciliation, margin, and customer portal visibility.

**Architecture:** Keep the existing Fastify, PostgreSQL, Prisma-derived schema, React, and Vitest stack. Add the smallest coherent business simulation layer: stable seed data, targeted financial source-of-truth decisions, one presenter-safe sale financial story path, and tests that prove the seeded records are connected. Do not replace the existing finance module.

**Tech Stack:** Node.js, TypeScript, Fastify, PostgreSQL, Prisma schema derived from SQL migrations, React, Vite, Vitest, npm workspaces, Turborepo.

## Global Constraints

- Security and tenant isolation take priority over speed.
- Do not trust tenant identifiers from the frontend.
- Do not run `prisma migrate`, `prisma db push`, or `prisma generate` unless explicitly authorized.
- Do not run migrations automatically.
- Do not install dependencies without explicit authorization.
- Do not commit, push, configure remotes, or open PRs without explicit authorization.
- Use Fastify patterns for backend HTTP examples and code.
- Use Vitest for tests.
- Use decimal-safe money handling; never use naive float logic for persisted financial truth.
- Customer Portal must never expose internal financial management, costs, margin, supplier exposure, tenant IDs, or staff notes.
- Use synthetic data only for demo mode.
- Preserve RLS and application-level tenant isolation.

---

## File Structure

- Modify: `docs/decisions/D5-FINANCIAL-INSTALLMENTS-DEMO-DECISION.md`
  - Records the source-of-truth decision for demo installments.
- Modify: `scripts/seed-tenant-demo-data.cjs`
  - Calls deterministic story seeding after generic tenant seed setup.
- Create: `scripts/demo-business-stories.cjs`
  - Owns stable IDs and inserts for five coherent business stories.
- Modify: `services/api/tests/demo-seed-stability.test.ts`
  - Proves deterministic story IDs and key financial values survive reseed.
- Modify: `services/api/tests/financial.test.ts`
  - Adds unit/integration proof for sale margin and payment allocation on the main scenario shape.
- Modify: `services/api/src/financial.ts`
  - Adds a sale financial story query only if existing endpoints cannot provide one screen efficiently.
- Modify: `services/api/src/app.ts`
  - Registers `GET /financial/sales/:id/story` if the new query is needed.
- Modify: `apps/agency/src/lib/api.ts`
  - Adds typed client for the sale financial story endpoint if needed.
- Create: `apps/agency/src/pages/SaleFinancialStoryPage.tsx`
  - Presenter-safe view for one sale's financial lifecycle.
- Modify: `apps/agency/src/App.tsx`
  - Adds route for sale financial story page.
- Modify: `apps/agency/src/pages/FinancialPage.tsx`
  - Adds a link to the main demo sale or story detail when data is present.
- Create: `apps/agency/src/pages/SaleFinancialStoryPage.test.tsx`
  - Verifies the UI shows sold, received, remaining, supplier obligations, cash impact, and margin.
- Modify: `docs/product/LOCAL_DEMO_SCRIPT.md`
  - Replaces "target" notes with exact route and record names after implementation.
- Modify: `docs/product/PRODUCT_GAP_ANALYSIS.md`
  - Updates PASS/FAIL matrix after implementation.

---

### Task 1: Record Installment Source Of Truth

**Files:**
- Create: `docs/decisions/D5-FINANCIAL-INSTALLMENTS-DEMO-DECISION.md`
- Modify: `docs/product/PRODUCT_GAP_ANALYSIS.md`

**Interfaces:**
- Consumes: current schema where `receivables` has `UNIQUE(agency_id, sale_id)`.
- Produces: explicit decision for whether demo installments use `revenues` or require receivable schema redesign.

- [ ] **Step 1: Create the decision document**

Create `docs/decisions/D5-FINANCIAL-INSTALLMENTS-DEMO-DECISION.md` with this content:

```markdown
# D5: Financial Installments For Local Business Simulation

Status: Accepted for local demo planning
Date: 2026-09-03

## Context

The local business simulation requires one sale of BRL 18,000 to be shown as
three customer installments of BRL 6,000 each.

The current `receivables` table has a unique `(agency_id, sale_id)` constraint,
which prevents multiple receivable rows for the same sale.

## Decision

For the first deterministic local demo, use `revenues` as the installment
schedule and keep `receivables` as the sale-level open obligation.

The demo must label this clearly:

- Sale total: source of truth is `sales.total`.
- Installment schedule: source of truth is `revenues` linked to `sale_id`.
- Payment received: source of truth is `payments` plus `payment_allocations`.
- Open receivable summary: source of truth is `receivables`.

## Consequences

This avoids a migration during demo stabilization.

The product still needs a future financial modeling decision if `receivables`
should become installment-level instead of sale-level.

No customer portal page may expose this internal distinction.
```

- [ ] **Step 2: Update gap analysis**

In `docs/product/PRODUCT_GAP_ANALYSIS.md`, change the installment recommendation to say the first implementation uses `revenues` for demo installments and keeps receivable schema unchanged.

- [ ] **Step 3: Verify docs**

Run:

```powershell
rg -n "T[B]D|T[O]DO|<{7}|={7}|>{7}" docs\decisions\D5-FINANCIAL-INSTALLMENTS-DEMO-DECISION.md docs\product\PRODUCT_GAP_ANALYSIS.md
```

Expected: no matches, exit code 1.

---

### Task 2: Add Deterministic Business Story Seed Data

**Files:**
- Create: `scripts/demo-business-stories.cjs`
- Modify: `scripts/seed-tenant-demo-data.cjs`

**Interfaces:**
- Consumes: an existing local `pg` pool, `agencyId`, primary staff `userId`, and existing tenant data.
- Produces: `seedBusinessStories(pool, { agencyId, userId })`.

- [ ] **Step 1: Create the seed module**

Create `scripts/demo-business-stories.cjs`:

```javascript
const STORY_IDS = {
  marianaCancun: {
    customer: 'd0d50001-0000-4000-8000-000000000001',
    dependent: 'd0d50001-0000-4000-8000-000000000002',
    address: 'd0d50001-0000-4000-8000-000000000003',
    document: 'd0d50001-0000-4000-8000-000000000004',
    wish: 'd0d50001-0000-4000-8000-000000000005',
    capture: 'd0d50001-0000-4000-8000-000000000006',
    offer: 'd0d50001-0000-4000-8000-000000000007',
    proposal: 'd0d50001-0000-4000-8000-000000000008',
    sale: 'd0d50001-0000-4000-8000-000000000009',
    receivable: 'd0d50001-0000-4000-8000-000000000010',
    payment: 'd0d50001-0000-4000-8000-000000000011',
    allocation: 'd0d50001-0000-4000-8000-000000000012',
    trip: 'd0d50001-0000-4000-8000-000000000013',
  },
  disney: {
    proposal: 'd0d50002-0000-4000-8000-000000000001',
    sale: 'd0d50002-0000-4000-8000-000000000002',
    trip: 'd0d50002-0000-4000-8000-000000000003',
  },
  honeymoon: {
    proposal: 'd0d50003-0000-4000-8000-000000000001',
    sale: 'd0d50003-0000-4000-8000-000000000002',
    trip: 'd0d50003-0000-4000-8000-000000000003',
  },
  domestic: {
    proposal: 'd0d50004-0000-4000-8000-000000000001',
    sale: 'd0d50004-0000-4000-8000-000000000002',
    trip: 'd0d50004-0000-4000-8000-000000000003',
  },
  europe: {
    proposal: 'd0d50005-0000-4000-8000-000000000001',
    sale: 'd0d50005-0000-4000-8000-000000000002',
    trip: 'd0d50005-0000-4000-8000-000000000003',
  },
};

async function seedBusinessStories(pool, { agencyId, userId }) {
  await seedMarianaCancun(pool, { agencyId, userId });
  await seedSupportingStory(pool, { agencyId, userId, key: 'disney', customerName: 'Fernando Costa Gomes', destination: 'Orlando / Disney', total: 24800 });
  await seedSupportingStory(pool, { agencyId, userId, key: 'honeymoon', customerName: 'Roberto Fernandes', destination: 'Paris', total: 17800 });
  await seedSupportingStory(pool, { agencyId, userId, key: 'domestic', customerName: 'Carla Mendes', destination: 'Gramado', total: 7200 });
  await seedSupportingStory(pool, { agencyId, userId, key: 'europe', customerName: 'Juliana Santos Ribeiro', destination: 'Portugal', total: 28600 });
}

async function seedMarianaCancun(pool, { agencyId, userId }) {
  const ids = STORY_IDS.marianaCancun;

  await pool.query(
    `INSERT INTO customers (id, agency_id, name, email, phone, cpf, rg, status, created_at, updated_at)
     VALUES ($1, $2, 'Mariana Alves Silva', 'mariana.cancun.demo@example.test', '11987654321', '12345678901', '123456789', 'ACTIVE', now(), now())
     ON CONFLICT (agency_id, email) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone
     RETURNING id`,
    [ids.customer, agencyId],
  );

  await pool.query(
    `INSERT INTO customer_addresses (id, agency_id, customer_id, street, number, district, city, state, cep, country, type, is_primary, created_at, updated_at)
     VALUES ($1, $2, $3, 'Rua das Palmeiras', '100', 'Centro', 'Joinville', 'SC', '89200000', 'Brasil', 'RESIDENTIAL', true, now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.address, agencyId, ids.customer],
  );

  await pool.query(
    `INSERT INTO customer_dependents (id, agency_id, customer_id, name, relationship_type, birth_date, created_at, updated_at)
     VALUES ($1, $2, $3, 'Lucas Alves Silva', 'CHILD', '2015-05-10', now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.dependent, agencyId, ids.customer],
  );

  await pool.query(
    `INSERT INTO customer_documents
       (id, agency_id, customer_id, document_type, document_number, holder_name, issuing_country, issued_date, expiry_date, verification_status, created_at, updated_at)
     VALUES ($1, $2, $3, 'PASSPORT', 'DEMO-CANCUN-001', 'Mariana Alves Silva', 'BR', '2024-01-01', '2034-01-01', 'VERIFIED', now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.document, agencyId, ids.customer],
  );

  await pool.query(
    `INSERT INTO wishes (id, agency_id, customer_id, destination, start_date, end_date, travelers_count, notes, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'Cancun', '2027-05-01', '2027-05-10', 3, 'Familia quer resort all-inclusive com entrada e duas parcelas.', 'ACTIVE', now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.wish, agencyId, ids.customer],
  );

  await pool.query(
    `INSERT INTO external_offer_captures
       (id, agency_id, source_url, source_name, raw_content, normalized_title, normalized_description, found_price, currency, valid_until, status, created_at, updated_at)
     VALUES ($1, $2, 'https://supplier.example/demo-mariana-cancun', 'Supplier Demo', $3, 'Cancun All-Inclusive Familia', 'Hotel, aereo, transfer e seguro para familia', 18000, 'BRL', '2027-01-31', 'APPROVED', now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.capture, agencyId, JSON.stringify({ demoOnly: true, story: 'Mariana / Cancun' })],
  );

  await pool.query(
    `INSERT INTO offers (id, agency_id, name, description, price, valid_from, valid_until, status, created_at, updated_at)
     VALUES ($1, $2, 'Mariana / Cancun - pacote familia', 'Cancun all-inclusive com hotel, aereo, transfer e seguro.', 18000, '2026-09-01', '2027-01-31', 'ACTIVE', now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.offer, agencyId],
  );

  await pool.query(
    `INSERT INTO proposals (id, agency_id, customer_id, offer_id, wish_id, user_id, proposed_price, discount, total, valid_until, notes, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 18000, 0, 18000, '2027-01-31', 'Mariana / Cancun - entrada de 6000 e duas parcelas futuras.', 'ACCEPTED', now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.proposal, agencyId, ids.customer, ids.offer, ids.wish, userId],
  );

  await pool.query(
    `INSERT INTO sales (id, agency_id, customer_id, proposal_id, user_id, amount, discount, total, status, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 18000, 0, 18000, 'CONFIRMED', 'Demo principal: Mariana / Cancun', now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.sale, agencyId, ids.customer, ids.proposal, userId],
  );

  await pool.query(
    `INSERT INTO receivables (id, agency_id, sale_id, customer_id, description, amount, due_at, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Mariana / Cancun - saldo total da venda', 18000, '2027-03-10', 'PARTIALLY_PAID', now(), now())
     ON CONFLICT (agency_id, sale_id) DO UPDATE SET amount = EXCLUDED.amount, status = EXCLUDED.status, updated_at = now()`,
    [ids.receivable, agencyId, ids.sale, ids.customer],
  );

  await seedInstallmentRevenues(pool, { agencyId, saleId: ids.sale, customerId: ids.customer });
  await seedSupplierPayables(pool, { agencyId, saleId: ids.sale });

  await pool.query(
    `INSERT INTO payments (id, agency_id, direction, amount, occurred_at, method, reference, notes, created_by, created_at)
     VALUES ($1, $2, 'IN', 6000, '2026-09-03', 'PIX', 'DEMO-MARIANA-ENTRADA', 'Entrada Mariana / Cancun', $3, now())
     ON CONFLICT DO NOTHING`,
    [ids.payment, agencyId, userId],
  );

  await pool.query(
    `INSERT INTO payment_allocations (id, agency_id, payment_id, receivable_id, amount, created_at)
     VALUES ($1, $2, $3, $4, 6000, now())
     ON CONFLICT DO NOTHING`,
    [ids.allocation, agencyId, ids.payment, ids.receivable],
  );

  await pool.query(
    `INSERT INTO trips (id, agency_id, customer_id, sale_id, name, destination, start_date, end_date, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Mariana / Cancun', 'Cancun', '2027-05-01', '2027-05-10', 'CONFIRMED', now(), now())
     ON CONFLICT DO NOTHING`,
    [ids.trip, agencyId, ids.customer, ids.sale],
  );
}

async function seedInstallmentRevenues(pool, { agencyId, saleId, customerId }) {
  const categoryId = await getCategory(pool, agencyId, 'Pacotes de viagem', 'REVENUE');
  const rows = [
    ['Entrada Mariana / Cancun', 6000, '2026-09-03', 'PAID'],
    ['Parcela 2 Mariana / Cancun', 6000, '2026-10-03', 'OPEN'],
    ['Parcela 3 Mariana / Cancun', 6000, '2026-11-03', 'OPEN'],
  ];
  for (const [description, amount, dueDate, status] of rows) {
    await pool.query(
      `INSERT INTO revenues (id, agency_id, sale_id, customer_id, category_id, description, amount, currency, competency_date, due_date, receipt_date, payment_method, status, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, 'BRL', $7, $7, CASE WHEN $8 = 'PAID' THEN $7::date ELSE NULL END, 'PIX', $8, now(), now())
       ON CONFLICT DO NOTHING`,
      [agencyId, saleId, customerId, categoryId, description, amount, dueDate, status],
    );
  }
}

async function seedSupplierPayables(pool, { agencyId, saleId }) {
  const rows = [
    ['Hotel - Grand Palladium Cancun', 7000, '2026-09-20'],
    ['Aereo - Sao Paulo / Cancun', 5000, '2026-09-25'],
    ['Transfer - Aeroporto / Resort', 800, '2026-10-01'],
    ['Seguro viagem familia', 500, '2026-10-05'],
    ['Comissao agencia / vendedor', 700, '2026-10-10'],
  ];
  for (const [description, amount, dueDate] of rows) {
    await pool.query(
      `INSERT INTO payables (id, agency_id, sale_id, description, amount, due_at, status, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'OPEN', now(), now())
       ON CONFLICT DO NOTHING`,
      [agencyId, saleId, description, amount, dueDate],
    );
  }
}

async function seedSupportingStory(pool, { agencyId, userId, key, customerName, destination, total }) {
  const ids = STORY_IDS[key];
  const customer = await pool.query(
    `SELECT id FROM customers WHERE agency_id = $1 AND name = $2 LIMIT 1`,
    [agencyId, customerName],
  );
  const customerId = customer.rows[0]?.id;
  if (!customerId) return;

  const proposal = await pool.query(
    `INSERT INTO proposals (id, agency_id, customer_id, user_id, proposed_price, discount, total, valid_until, notes, status)
     VALUES ($1, $2, $3, $4, $5, 0, $5, '2027-01-31', $6, 'ACCEPTED')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [ids.proposal, agencyId, customerId, userId, total, `Demo ${key}: ${destination}`],
  );
  const proposalId = proposal.rows[0]?.id ?? ids.proposal;
  const sale = await pool.query(
    `INSERT INTO sales (id, agency_id, customer_id, proposal_id, user_id, amount, discount, total, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, 0, $6, 'CONFIRMED', $7)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [ids.sale, agencyId, customerId, proposalId, userId, total, `Demo ${key}: ${destination}`],
  );
  const saleId = sale.rows[0]?.id ?? ids.sale;
  await pool.query(
    `INSERT INTO trips (id, agency_id, customer_id, sale_id, name, destination, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, '2027-06-01', '2027-06-10', 'CONFIRMED')
     ON CONFLICT DO NOTHING`,
    [ids.trip, agencyId, customerId, saleId, `Demo ${key}: ${destination}`, destination],
  );
}

async function getCategory(pool, agencyId, name, type) {
  const result = await pool.query(
    `INSERT INTO financial_categories (id, agency_id, name, type, description, is_active, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, true, now(), now())
     ON CONFLICT (agency_id, type, name) DO UPDATE SET is_active = true
     RETURNING id`,
    [agencyId, name, type, `${name} demo`],
  );
  return result.rows[0].id;
}

module.exports = { STORY_IDS, seedBusinessStories };
```

- [ ] **Step 2: Wire the module into tenant seed**

At the top of `scripts/seed-tenant-demo-data.cjs`, add:

```javascript
const { seedBusinessStories } = require('./demo-business-stories.cjs');
```

After users are seeded and a primary `userId` is available, call:

```javascript
await seedBusinessStories(pool, { agencyId, userId: users[0].id });
```

- [ ] **Step 3: Run targeted seed stability test**

Run:

```powershell
npm run test -- --run services/api/tests/demo-seed-stability.test.ts
```

Expected initially: fail until Task 3 updates test expectations.

---

### Task 3: Prove Demo Story Stability

**Files:**
- Modify: `services/api/tests/demo-seed-stability.test.ts`

**Interfaces:**
- Consumes: `STORY_IDS.marianaCancun` from `scripts/demo-business-stories.cjs`.
- Produces: tests that prove the main story is stable and financially connected.

- [ ] **Step 1: Import stable story IDs**

Add:

```typescript
const { STORY_IDS } = require('../../scripts/demo-business-stories.cjs') as {
  STORY_IDS: {
    marianaCancun: {
      customer: string;
      sale: string;
      receivable: string;
      payment: string;
      allocation: string;
      trip: string;
    };
  };
};
```

- [ ] **Step 2: Add the main story test**

Add this test:

```typescript
it('seeds Mariana / Cancun as a deterministic connected financial story', async () => {
  const ids = STORY_IDS.marianaCancun;

  const result = await adminPool.query(
    `SELECT
       c.name AS customer_name,
       s.total::text AS sale_total,
       r.amount::text AS receivable_amount,
       r.status AS receivable_status,
       p.amount::text AS payment_amount,
       pa.amount::text AS allocated_amount,
       t.destination AS trip_destination
     FROM customers c
     JOIN sales s ON s.agency_id = c.agency_id AND s.customer_id = c.id
     JOIN receivables r ON r.agency_id = s.agency_id AND r.sale_id = s.id
     JOIN payments p ON p.agency_id = s.agency_id AND p.id = $4
     JOIN payment_allocations pa ON pa.agency_id = p.agency_id AND pa.payment_id = p.id AND pa.receivable_id = r.id
     JOIN trips t ON t.agency_id = s.agency_id AND t.sale_id = s.id
     WHERE c.id = $1 AND s.id = $2 AND r.id = $3`,
    [ids.customer, ids.sale, ids.receivable, ids.payment],
  );

  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]).toMatchObject({
    customer_name: 'Mariana Alves Silva',
    sale_total: '18000.00',
    receivable_amount: '18000.00',
    receivable_status: 'PARTIALLY_PAID',
    payment_amount: '6000.00',
    allocated_amount: '6000.00',
    trip_destination: 'Cancun',
  });
});
```

- [ ] **Step 3: Add installment proof**

Add:

```typescript
it('seeds Mariana / Cancun installment schedule through revenues', async () => {
  const rows = await adminPool.query(
    `SELECT description, amount::text, status
     FROM revenues
     WHERE sale_id = $1
     ORDER BY due_date ASC`,
    [STORY_IDS.marianaCancun.sale],
  );

  expect(rows.rows.map((row) => row.amount)).toEqual(['6000.00', '6000.00', '6000.00']);
  expect(rows.rows.map((row) => row.status)).toEqual(['PAID', 'OPEN', 'OPEN']);
});
```

- [ ] **Step 4: Run test**

Run:

```powershell
npm run test -- --run services/api/tests/demo-seed-stability.test.ts
```

Expected: pass.

---

### Task 4: Add Sale Financial Story API

**Files:**
- Modify: `services/api/src/financial.ts`
- Modify: `services/api/src/app.ts`
- Modify: `services/api/tests/financial-http.test.ts`

**Interfaces:**
- Produces: `getSaleFinancialStory(database: DatabaseRuntime, saleId: string): Promise<SaleFinancialStory>`.
- API: `GET /financial/sales/:id/story`.

- [ ] **Step 1: Add type in `financial.ts`**

```typescript
export interface SaleFinancialStory {
  saleId: string;
  customerName: string;
  tripName: string | null;
  grossSale: number;
  received: number;
  remainingReceivable: number;
  supplierPayables: Array<{ description: string; amount: number; dueAt: Date; status: FinancialObligationStatus }>;
  totalSupplierPayable: number;
  installmentSchedule: Array<{ description: string; amount: number; dueDate: Date; status: RevenueStatus }>;
  margin: {
    grossSale: number;
    supplierCosts: number;
    commissionAndFees: number;
    grossMargin: number;
    netMargin: number;
  };
}
```

- [ ] **Step 2: Add implementation**

```typescript
export async function getSaleFinancialStory(
  database: DatabaseRuntime,
  saleId: string,
): Promise<SaleFinancialStory> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const saleResult = await client.query<{
      sale_id: string;
      customer_name: string;
      trip_name: string | null;
      total: string;
    }>(
      `SELECT s.id AS sale_id, c.name AS customer_name, t.name AS trip_name, s.total::text AS total
       FROM sales s
       JOIN customers c ON c.agency_id = s.agency_id AND c.id = s.customer_id
       LEFT JOIN trips t ON t.agency_id = s.agency_id AND t.sale_id = s.id
       WHERE s.agency_id = $1 AND s.id = $2`,
      [agencyId, saleId],
    );
    const sale = saleResult.rows[0];
    if (!sale) throw new NotFoundError('Sale not found');

    const payablesResult = await client.query<{
      description: string;
      amount: string;
      due_at: string;
      status: FinancialObligationStatus;
    }>(
      `SELECT description, amount::text, due_at, status
       FROM payables
       WHERE agency_id = $1 AND sale_id = $2
       ORDER BY due_at ASC`,
      [agencyId, saleId],
    );

    const installmentsResult = await client.query<{
      description: string;
      amount: string;
      due_date: string;
      status: RevenueStatus;
    }>(
      `SELECT description, amount::text, due_date, status
       FROM revenues
       WHERE agency_id = $1 AND sale_id = $2
       ORDER BY due_date ASC`,
      [agencyId, saleId],
    );

    const receivedResult = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(pa.amount), 0)::text AS total
       FROM payment_allocations pa
       JOIN receivables r ON r.agency_id = pa.agency_id AND r.id = pa.receivable_id
       WHERE pa.agency_id = $1 AND r.sale_id = $2`,
      [agencyId, saleId],
    );

    const grossSale = roundMoney(Number(sale.total));
    const received = roundMoney(Number(receivedResult.rows[0]?.total ?? 0));
    const supplierPayables = payablesResult.rows.map((row) => ({
      description: row.description,
      amount: roundMoney(Number(row.amount)),
      dueAt: new Date(row.due_at),
      status: row.status,
    }));
    const totalSupplierPayable = roundMoney(
      supplierPayables.reduce((sum, payable) => sum + payable.amount, 0),
    );
    const commissionAndFees = roundMoney(
      supplierPayables
        .filter((payable) => /comissao|comissão|taxa|fee/i.test(payable.description))
        .reduce((sum, payable) => sum + payable.amount, 0),
    );
    const supplierCosts = roundMoney(totalSupplierPayable - commissionAndFees);

    return {
      saleId,
      customerName: sale.customer_name,
      tripName: sale.trip_name,
      grossSale,
      received,
      remainingReceivable: roundMoney(grossSale - received),
      supplierPayables,
      totalSupplierPayable,
      installmentSchedule: installmentsResult.rows.map((row) => ({
        description: row.description,
        amount: roundMoney(Number(row.amount)),
        dueDate: new Date(row.due_date),
        status: row.status,
      })),
      margin: {
        grossSale,
        supplierCosts,
        commissionAndFees,
        grossMargin: roundMoney(grossSale - supplierCosts),
        netMargin: roundMoney(grossSale - supplierCosts - commissionAndFees),
      },
    };
  });
}
```

- [ ] **Step 3: Register route in `app.ts`**

Import `getSaleFinancialStory`, then add near the existing financial sale margin route:

```typescript
app.get<{ Params: { id: string } }>(
  '/financial/sales/:id/story',
  { preHandler: protectedHooks },
  async (request) => {
    const story = await getSaleFinancialStory(options.database, request.params.id);
    return { story };
  },
);
```

- [ ] **Step 4: Add HTTP test**

In `services/api/tests/financial-http.test.ts`, add an ADMIN/MANAGER read test that creates a sale, receivable, payment allocation, revenues, and payables, then asserts:

```typescript
expect(response.statusCode).toBe(200);
expect(response.json().story).toMatchObject({
  grossSale: 18000,
  received: 6000,
  remainingReceivable: 12000,
  totalSupplierPayable: 14000,
});
```

- [ ] **Step 5: Run targeted tests**

```powershell
npm run test -- --run services/api/tests/financial-http.test.ts services/api/tests/financial.test.ts
```

Expected: pass.

---

### Task 5: Add Presenter-Safe Sale Financial Story Page

**Files:**
- Modify: `apps/agency/src/lib/api.ts`
- Create: `apps/agency/src/pages/SaleFinancialStoryPage.tsx`
- Create: `apps/agency/src/pages/SaleFinancialStoryPage.test.tsx`
- Modify: `apps/agency/src/App.tsx`
- Modify: `apps/agency/src/pages/FinancialPage.tsx`

**Interfaces:**
- Consumes: `GET /financial/sales/:id/story`.
- Produces: `/financial/sales/:saleId/story`.

- [ ] **Step 1: Add client type and function**

Add to `apps/agency/src/lib/api.ts`:

```typescript
export interface SaleFinancialStory {
  saleId: string;
  customerName: string;
  tripName: string | null;
  grossSale: number;
  received: number;
  remainingReceivable: number;
  supplierPayables: Array<{ description: string; amount: number; dueAt: string; status: FinancialObligationStatus }>;
  totalSupplierPayable: number;
  installmentSchedule: Array<{ description: string; amount: number; dueDate: string; status: string }>;
  margin: {
    grossSale: number;
    supplierCosts: number;
    commissionAndFees: number;
    grossMargin: number;
    netMargin: number;
  };
}

export async function getSaleFinancialStory(saleId: string): Promise<SaleFinancialStory> {
  const data = await request<{ story: SaleFinancialStory }>(
    `/api/financial/sales/${encodeURIComponent(saleId)}/story`,
  );
  return data.story;
}
```

- [ ] **Step 2: Create page**

Create `apps/agency/src/pages/SaleFinancialStoryPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { LoadingState } from '../components/ui/loading-state';
import { ErrorState } from '../components/ui/error-state';
import { Button } from '../components/ui/button';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import { ApiError, getSaleFinancialStory, type SaleFinancialStory } from '../lib/api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; story: SaleFinancialStory };

export function SaleFinancialStoryPage() {
  const { saleId } = useParams<{ saleId: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!saleId) return;
    let cancelled = false;
    setState({ status: 'loading' });
    getSaleFinancialStory(saleId)
      .then((story) => {
        if (!cancelled) setState({ status: 'success', story });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof ApiError ? error.message : 'Nao foi possivel carregar a historia financeira.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  if (!saleId) return <ErrorState description="Venda nao informada." />;
  if (state.status === 'loading') return <LoadingState label="Carregando historia financeira..." />;
  if (state.status === 'error') return <ErrorState description={state.message} />;

  const { story } = state;
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Historia financeira - ${story.customerName}`}
        description={story.tripName ?? 'Venda com recebiveis, fornecedores, caixa e margem.'}
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Financeiro', to: '/financial' }]}
        actions={<Link to="/financial"><Button size="sm" variant="outline">Voltar</Button></Link>}
      />

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Venda bruta" value={formatBRL(story.grossSale)} />
        <Metric label="Recebido" value={formatBRL(story.received)} />
        <Metric label="A receber" value={formatBRL(story.remainingReceivable)} />
        <Metric label="Margem liquida" value={formatBRL(story.margin.netMargin)} />
      </section>

      <Card>
        <CardHeader><CardTitle>Parcelas do cliente</CardTitle></CardHeader>
        <CardContent>
          {story.installmentSchedule.map((item) => (
            <Row key={item.description} left={item.description} middle={formatDateBR(item.dueDate, { assumeDateOnly: true })} right={formatBRL(item.amount)} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Compromissos com fornecedores</CardTitle></CardHeader>
        <CardContent>
          {story.supplierPayables.map((item) => (
            <Row key={item.description} left={item.description} middle={formatDateBR(item.dueAt, { assumeDateOnly: true })} right={formatBRL(item.amount)} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Margem</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Row left="Venda" middle="Receita total" right={formatBRL(story.margin.grossSale)} />
          <Row left="Custos de fornecedores" middle="Hotel, aereo, transfer e seguro" right={`-${formatBRL(story.margin.supplierCosts)}`} />
          <Row left="Taxas e comissao" middle="Custos comerciais" right={`-${formatBRL(story.margin.commissionAndFees)}`} />
          <Row left="Margem liquida" middle="Resultado esperado" right={formatBRL(story.margin.netMargin)} strong />
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Row({ left, middle, right, strong = false }: { left: string; middle: string; right: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0 ${strong ? 'font-semibold' : ''}`}>
      <span className="text-slate-900">{left}</span>
      <span className="text-slate-500">{middle}</span>
      <span className="text-slate-900">{right}</span>
    </div>
  );
}
```

- [ ] **Step 3: Add route**

In `apps/agency/src/App.tsx`, import the page and add:

```tsx
<Route path="financial/sales/:saleId/story" element={<SaleFinancialStoryPage />} />
```

- [ ] **Step 4: Add UI test**

Create `apps/agency/src/pages/SaleFinancialStoryPage.test.tsx` and mock `getSaleFinancialStory` to return:

```typescript
{
  saleId: 'd0d50001-0000-4000-8000-000000000009',
  customerName: 'Mariana Alves Silva',
  tripName: 'Mariana / Cancun',
  grossSale: 18000,
  received: 6000,
  remainingReceivable: 12000,
  totalSupplierPayable: 14000,
  installmentSchedule: [
    { description: 'Entrada Mariana / Cancun', amount: 6000, dueDate: '2026-09-03', status: 'PAID' },
    { description: 'Parcela 2 Mariana / Cancun', amount: 6000, dueDate: '2026-10-03', status: 'OPEN' },
    { description: 'Parcela 3 Mariana / Cancun', amount: 6000, dueDate: '2026-11-03', status: 'OPEN' },
  ],
  supplierPayables: [
    { description: 'Hotel - Grand Palladium Cancun', amount: 7000, dueAt: '2026-09-20', status: 'OPEN' },
  ],
  margin: { grossSale: 18000, supplierCosts: 13300, commissionAndFees: 700, grossMargin: 4700, netMargin: 4000 },
}
```

Assert the page contains `Mariana Alves Silva`, `Venda bruta`, `R$ 18.000,00`, `Recebido`, `R$ 6.000,00`, `A receber`, `R$ 12.000,00`, `Hotel - Grand Palladium Cancun`, and `Margem liquida`.

- [ ] **Step 5: Run agency tests**

```powershell
npm run test -- --run apps/agency/src/pages/SaleFinancialStoryPage.test.tsx apps/agency/src/App.test.tsx
```

Expected: pass.

---

### Task 6: Update Product Demo Docs To PASS/FAIL Truth

**Files:**
- Modify: `docs/product/LOCAL_DEMO_SCRIPT.md`
- Modify: `docs/product/PRODUCT_GAP_ANALYSIS.md`

**Interfaces:**
- Consumes: implemented routes and deterministic story IDs.
- Produces: final demo handoff docs.

- [ ] **Step 1: Update script readiness**

In `docs/product/LOCAL_DEMO_SCRIPT.md`, replace the readiness blocker note with exact route:

```text
Main financial story route:
/financial/sales/d0d50001-0000-4000-8000-000000000009/story
```

- [ ] **Step 2: Update acceptance checklist**

Mark implemented deterministic items as checked only after tests pass:

```markdown
- [x] Mariana/Cancun exists as a complete linked BRL 18,000 story.
- [x] Three BRL 6,000 installments exist for the main sale.
- [x] BRL 6,000 paid is represented by payment and allocation records.
- [x] Supplier payables are linked to the main sale and named services.
```

- [ ] **Step 3: Update gap analysis final verdict**

If all targeted tests pass, update:

```text
LOCAL DEMO: PASS FOR LOCAL BUSINESS UAT SEED
FINAL VERDICT:
PRODUCT MODEL COHERENT FOR LOCAL BUSINESS SIMULATION - READY FOR LOCAL BUSINESS UAT AFTER BROWSER QA
```

If browser QA has not run, keep:

```text
READY FOR LOCAL BUSINESS UAT AFTER BROWSER QA
```

- [ ] **Step 4: Verify docs**

```powershell
rg -n "T[B]D|T[O]DO|<{7}|={7}|>{7}" docs\product docs\decisions
```

Expected: no matches, exit code 1.

---

### Task 7: Run Final Verification

**Files:**
- No new files.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: evidence for completion.

- [ ] **Step 1: Run targeted backend tests**

```powershell
npm run test -- --run services/api/tests/demo-seed-stability.test.ts services/api/tests/financial.test.ts services/api/tests/financial-http.test.ts
```

Expected: pass.

- [ ] **Step 2: Run targeted frontend tests**

```powershell
npm run test -- --run apps/agency/src/pages/SaleFinancialStoryPage.test.tsx apps/agency/src/App.test.tsx
```

Expected: pass.

- [ ] **Step 3: Run repository gates if scope allows**

```powershell
npm run lint
npm run typecheck
npm run test
```

Expected: pass.

- [ ] **Step 4: Browser QA if demo reset is explicitly authorized**

Run:

```powershell
npm run demo:reset
npm run demo
```

Then verify:

```text
http://localhost:5173/financial
http://localhost:5173/financial/sales/d0d50001-0000-4000-8000-000000000009/story
http://localhost:5174
```

Expected:

- Agency finance shows meaningful totals.
- Sale story shows BRL 18,000 sold, BRL 6,000 received, BRL 12,000 open, BRL
  14,000 supplier/commission obligations, BRL 4,000 net margin.
- Customer portal shows trip/proposal/booking data without internal finance.

---

## Self-Review

Spec coverage:

- Finance as core business domain: covered by Tasks 1, 4, 5, and 7.
- Five demo stories: covered by Task 2.
- Mariana / Cancun exact story: covered by Tasks 2, 3, 4, and 5.
- Local demo script and gap analysis: covered by Task 6.
- Tests and verification: covered by Tasks 3, 4, 5, and 7.
- Tenant/security constraints: included in Global Constraints and backend route scope.

Residual risk:

- The plan intentionally avoids a receivables migration by using `revenues` for
  installments. If product wants receivables to be installment-level, create a
  separate ADR and migration plan before Task 2.
- Exact enum values for `customer_documents.document_type` and dependent
  relationship types must be checked against the current SQL schema before
  implementation. If `PASSPORT` or `CHILD` differs from the schema, use the
  existing enum value already used by seed files.
- Existing worktree has many unrelated changes. Implementers must not revert
  unrelated files.
