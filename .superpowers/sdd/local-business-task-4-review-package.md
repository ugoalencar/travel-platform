# Task 4 Review Package - Rereview 3

## Git Status
```
 M docs/security/route-security-inventory.md
 M services/api/src/app.ts
 M services/api/src/financial.ts
 M services/api/src/route-inventory.ts
 M services/api/tests/financial-http.test.ts
?? .superpowers/sdd/local-business-task-4-report.md
```

## Diff
```diff
diff --git a/docs/security/route-security-inventory.md b/docs/security/route-security-inventory.md
index 0037a98..81c96f3 100644
--- a/docs/security/route-security-inventory.md
+++ b/docs/security/route-security-inventory.md
@@ -235,7 +235,7 @@
 | POST | `/sales/:id/cancel` | protectedHooks | MANAGER |
 | POST | `/sales/:id/mark-paid` | protectedHooks | MANAGER |
 
-#### Financial — Read (8 routes)
+#### Financial — Read (9 routes)
 
 | Method | Path | Auth | Role |
 |--------|------|------|------|
@@ -246,6 +246,7 @@
 | GET | `/financial/operational-costs` | protectedHooks | MANAGER |
 | GET | `/financial/allocations` | protectedHooks | MANAGER |
 | GET | `/financial/sales/:id/margin` | protectedHooks | MANAGER |
+| GET | `/financial/sales/:id/story` | protectedHooks | MANAGER |
 | GET | `/financial/dashboard` | protectedHooks | MANAGER |
 
 #### Financial — Write (5 routes)
diff --git a/services/api/src/app.ts b/services/api/src/app.ts
index aaac418..ad34c07 100644
--- a/services/api/src/app.ts
+++ b/services/api/src/app.ts
@@ -190,6 +190,7 @@ import {
   getCashFlowSummary,
   getCashBalance,
   getFinancialSummary,
+  getSaleFinancialStory,
   getSaleMargin,
   getExpense,
   getRevenue,
@@ -1962,6 +1963,17 @@ export function buildApp(options: BuildAppOptions): FastifyInstance {
     }
   );
 
+  app.get<{ Params: { id: string } }>(
+    '/financial/sales/:id/story',
+    { preHandler: protectedHooks },
+    async (request) => {
+      requireRole(UserRole.MANAGER);
+      const saleId = parseUuidParam(request.params.id, 'saleId');
+      const story = await getSaleFinancialStory(options.database, saleId);
+      return { story };
+    }
+  );
+
   app.get('/financial/dashboard', { preHandler: protectedHooks }, async (request) => {
     requireRole(UserRole.MANAGER);
     const period = parseCashFlowPeriod(request.query);
@@ -4317,6 +4329,18 @@ function parseRequiredString(value: unknown, field: string): string {
   return value;
 }
 
+function parseUuidParam(value: string, field: string): string {
+  const trimmed = value.trim();
+  if (
+    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
+      trimmed,
+    )
+  ) {
+    throw new ValidationError(`Param "${field}" must be a valid UUID`);
+  }
+  return trimmed;
+}
+
 function parsePositiveNumber(value: unknown, field: string): number {
   if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
     throw new ValidationError(`Field "${field}" must be a positive number`);
diff --git a/services/api/src/financial.ts b/services/api/src/financial.ts
index 2a86160..e350e3e 100644
--- a/services/api/src/financial.ts
+++ b/services/api/src/financial.ts
@@ -321,6 +321,35 @@ export interface SaleMargin {
   margin: number;
 }
 
+export interface SaleFinancialStory {
+  saleId: string;
+  customerName: string;
+  tripName: string | null;
+  grossSale: number;
+  received: number;
+  remainingReceivable: number;
+  supplierPayables: Array<{
+    description: string;
+    amount: number;
+    dueAt: Date;
+    status: FinancialObligationStatus;
+  }>;
+  totalSupplierPayable: number;
+  installmentSchedule: Array<{
+    description: string;
+    amount: number;
+    dueDate: Date;
+    status: RevenueStatus;
+  }>;
+  margin: {
+    grossSale: number;
+    supplierCosts: number;
+    commissionAndFees: number;
+    grossMargin: number;
+    netMargin: number;
+  };
+}
+
 export interface FinancialSummary {
   salesThisMonth: {
     total: number;
@@ -1687,6 +1716,123 @@ export async function getSaleMargin(database: DatabaseRuntime, saleId: string):
   });
 }
 
+export async function getSaleFinancialStory(
+  database: DatabaseRuntime,
+  saleId: string,
+): Promise<SaleFinancialStory> {
+  const agencyId = getAgencyId();
+  return database.withTenantTransaction(async (client) => {
+    const saleResult = await client.query<{
+      sale_id: string;
+      customer_id: string;
+      customer_name: string;
+      trip_name: string | null;
+      total: string;
+      notes: string | null;
+    }>(
+      `SELECT s.id AS sale_id, s.customer_id, c.name AS customer_name, t.name AS trip_name,
+              s.total::text AS total, s.notes
+       FROM sales s
+       JOIN customers c ON c.agency_id = s.agency_id AND c.id = s.customer_id
+       LEFT JOIN trips t ON t.agency_id = s.agency_id AND t.sale_id = s.id
+       WHERE s.agency_id = $1 AND s.id = $2`,
+      [agencyId, saleId],
+    );
+    const sale = saleResult.rows[0];
+    if (!sale) throw new NotFoundError('Sale not found');
+    const demoScheduleNote = sale.notes?.startsWith('Demo principal: ')
+      ? `Demo installment schedule for ${sale.notes.slice('Demo principal: '.length)} sale`
+      : null;
+
+    const payablesResult = await client.query<{
+      description: string;
+      amount: string;
+      due_at: string;
+      status: FinancialObligationStatus;
+    }>(
+      `SELECT description, amount::text, due_at, status
+       FROM payables
+       WHERE agency_id = $1 AND sale_id = $2
+       ORDER BY due_at ASC`,
+      [agencyId, saleId],
+    );
+
+    const installmentsResult = await client.query<{
+      description: string;
+      amount: string;
+      due_date: string;
+      status: RevenueStatus;
+    }>(
+      `SELECT description, amount::text, due_date, status
+       FROM revenues
+       WHERE agency_id = $1
+         AND (
+           sale_id = $2
+           OR (
+             sale_id IS NULL
+             AND customer_id = $3
+             AND notes = $4
+           )
+         )
+       ORDER BY due_date ASC`,
+      [agencyId, saleId, sale.customer_id, demoScheduleNote],
+    );
+
+    const receivedResult = await client.query<{ total: string }>(
+      `SELECT COALESCE(SUM(pa.amount), 0)::text AS total
+       FROM payment_allocations pa
+       JOIN receivables r ON r.agency_id = pa.agency_id AND r.id = pa.receivable_id
+       WHERE pa.agency_id = $1 AND r.sale_id = $2`,
+      [agencyId, saleId],
+    );
+
+    const grossSale = roundMoney(Number(sale.total));
+    const received = roundMoney(Number(receivedResult.rows[0]?.total ?? 0));
+    const supplierPayables = payablesResult.rows.map((row) => ({
+      description: row.description,
+      amount: roundMoney(Number(row.amount)),
+      dueAt: new Date(row.due_at),
+      status: row.status,
+    }));
+    const totalSupplierPayable = roundMoney(
+      supplierPayables.reduce((sum, payable) => sum + payable.amount, 0),
+    );
+    const commissionAndFees = roundMoney(
+      supplierPayables
+        .filter((payable) => /comissao|comissão|taxa|fee/i.test(payable.description))
+        .reduce((sum, payable) => sum + payable.amount, 0),
+    );
+    const supplierCosts = roundMoney(totalSupplierPayable - commissionAndFees);
+
+    return {
+      saleId,
+      customerName: sale.customer_name,
+      tripName: sale.trip_name,
+      grossSale,
+      received,
+      remainingReceivable: roundMoney(grossSale - received),
+      supplierPayables,
+      totalSupplierPayable,
+      // The Task 2 demo seed can only link one revenue directly because of the
+      // current (agency_id, sale_id) unique constraint. The SQL fallback above
+      // admits only the canonical demo schedule derived from this sale's note.
+      installmentSchedule: installmentsResult.rows.map((row) => ({
+        description: row.description,
+        amount: roundMoney(Number(row.amount)),
+        dueDate: new Date(row.due_date),
+        status: row.status,
+      })),
+      margin: {
+        grossSale,
+        supplierCosts,
+        commissionAndFees,
+        grossMargin: roundMoney(grossSale - supplierCosts),
+        netMargin: roundMoney(grossSale - supplierCosts - commissionAndFees),
+      },
+    };
+  });
+}
+
 export async function getFinancialSummary(database: DatabaseRuntime): Promise<FinancialSummary> {
   const agencyId = getAgencyId();
   return database.withTenantTransaction(async (client) => {
diff --git a/services/api/src/route-inventory.ts b/services/api/src/route-inventory.ts
index 36fcacd..ecdf7a3 100644
--- a/services/api/src/route-inventory.ts
+++ b/services/api/src/route-inventory.ts
@@ -1076,6 +1076,15 @@ export function registerAllRoutes(): void {
     publicJustification: undefined,
   });
 
+  registerRoute({
+    method: 'GET',
+    path: '/financial/sales/:id/story',
+    classification: RouteClassification.STAFF_SCOPED,
+    authPipeline: 'protectedHooks',
+    role: 'MANAGER',
+    publicJustification: undefined,
+  });
+
   registerRoute({
     method: 'GET',
     path: '/financial/dashboard',
diff --git a/services/api/tests/financial-http.test.ts b/services/api/tests/financial-http.test.ts
index b0bbab9..5abe3ae 100644
--- a/services/api/tests/financial-http.test.ts
+++ b/services/api/tests/financial-http.test.ts
@@ -20,6 +20,20 @@ const migrations = [
   '008_commercial_cockpit.sql',
   '009_configurable_pipelines.sql',
   '010_financial_foundation.sql',
+  '011_booking_cancellation.sql',
+  '012_operational_staff_assignments.sql',
+  '013_pescador_foundation.sql',
+  '014_offer_growth_foundation.sql',
+  '015_audit_logging.sql',
+  '016_production_auth_captcha_mfa.sql',
+  '017_mfa_rls_p0_fix.sql',
+  '018_local_dev_migration_corrections.sql',
+  '019_customer_360_addresses.sql',
+  '020_customer_360_dependents.sql',
+  '021_customer_360_documents.sql',
+  '022_customer_360_document_audit.sql',
+  '023_customer_360_rls.sql',
+  '024_extended_financial_module.sql',
 ].map((name) => resolve(repoRoot, 'infrastructure/migrations', name));
 const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
 const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');
@@ -111,6 +125,11 @@ describe.sequential('Financial HTTP routes', () => {
   });
 
   beforeEach(async () => {
+    await adminPool.query('TRUNCATE TABLE reconciliations RESTART IDENTITY CASCADE');
+    await adminPool.query('TRUNCATE TABLE cash_transactions RESTART IDENTITY CASCADE');
+    await adminPool.query('TRUNCATE TABLE expenses RESTART IDENTITY CASCADE');
+    await adminPool.query('TRUNCATE TABLE revenues RESTART IDENTITY CASCADE');
+    await adminPool.query('TRUNCATE TABLE financial_categories RESTART IDENTITY CASCADE');
     await adminPool.query('TRUNCATE TABLE payment_allocations RESTART IDENTITY CASCADE');
     await adminPool.query('TRUNCATE TABLE payments RESTART IDENTITY CASCADE');
     await adminPool.query('TRUNCATE TABLE receivables RESTART IDENTITY CASCADE');
@@ -183,6 +202,186 @@ describe.sequential('Financial HTTP routes', () => {
     await app.close();
   });
 
+  it('returns an isolated, authorized financial story with paid installment schedule and margins', async () => {
+    const app = buildTestApp(runtimePool);
+    const storySale = await seedSale(
+      agencyAId,
+      customerA,
+      userAId,
+      18000,
+      'Demo principal: Test Customer / Cancun',
+    );
+
+    const category = await app.inject({
+      method: 'POST',
+      url: '/financial/categories',
+      headers: { 'x-test-principal': 'admin' },
+      payload: { name: 'Travel packages', type: 'REVENUE' },
+    });
+    expect(category.statusCode).toBe(201);
+    const categoryId = category.json<{ category: { id: string } }>().category.id;
+
+    const receivable = await app.inject({
+      method: 'POST',
+      url: '/financial/receivables',
+      headers: { 'x-test-principal': 'admin' },
+      payload: {
+        saleId: storySale,
+        customerId: customerA,
+        description: 'Sale receivable',
+        amount: 18000,
+        dueAt: '2027-03-10T00:00:00Z',
+      },
+    });
+    expect(receivable.statusCode).toBe(201);
+    const receivableId = receivable.json<{ receivable: { id: string } }>().receivable.id;
+
+    const payment = await app.inject({
+      method: 'POST',
+      url: '/financial/payments',
+      headers: { 'x-test-principal': 'admin' },
+      payload: { direction: 'IN', amount: 6000, occurredAt: '2027-01-03T00:00:00Z' },
+    });
+    expect(payment.statusCode).toBe(201);
+    const paymentId = payment.json<{ payment: { id: string } }>().payment.id;
+
+    const allocation = await app.inject({
+      method: 'POST',
+      url: `/financial/payments/${paymentId}/allocations`,
+      headers: { 'x-test-principal': 'admin' },
+      payload: { allocations: [{ receivableId, amount: 6000 }] },
+    });
+    expect(allocation.statusCode).toBe(200);
+
+    const scheduleRows = [
+      { saleId: storySale, description: 'Entry Test Customer / Cancun', dueDate: '2027-01-03T00:00:00Z' },
+      { saleId: undefined, description: 'Installment 2 Test Customer / Cancun', dueDate: '2027-02-03T00:00:00Z' },
+      { saleId: undefined, description: 'Installment 3 Test Customer / Cancun', dueDate: '2027-03-03T00:00:00Z' },
+    ] as const;
+    let entryRevenueId: string | undefined;
+    for (const [index, scheduleRow] of scheduleRows.entries()) {
+      const revenue = await app.inject({
+        method: 'POST',
+        url: '/financial/revenues',
+        headers: { 'x-test-principal': 'admin' },
+        payload: {
+          ...scheduleRow,
+          customerId: customerA,
+          categoryId,
+          amount: 6000,
+          currency: 'BRL',
+          competencyDate: scheduleRow.dueDate,
+          notes: 'Demo installment schedule for Test Customer / Cancun sale',
+        },
+      });
+      expect(revenue.statusCode).toBe(201);
+      if (index === 0) {
+        entryRevenueId = revenue.json<{ revenue: { id: string } }>().revenue.id;
+      }
+    }
+    expect(entryRevenueId).toBeDefined();
+    const paidEntry = await app.inject({
+      method: 'POST',
+      url: `/financial/revenues/${entryRevenueId}/mark-paid`,
+      headers: { 'x-test-principal': 'admin' },
+    });
+    expect(paidEntry.statusCode).toBe(200);
+    expect(paidEntry.json<{ revenue: { status: string } }>().revenue.status).toBe('PAID');
+
+    for (const [description, amount] of [
+      ['Hotel', 7000],
+      ['Airfare', 5000],
+      ['Transfer', 800],
+      ['Travel insurance', 500],
+      ['Comissao agency', 700],
+    ] as const) {
+      const payable = await app.inject({
+        method: 'POST',
+        url: '/financial/payables',
+        headers: { 'x-test-principal': 'admin' },
+        payload: { saleId: storySale, description, amount, dueAt: '2027-01-10T00:00:00Z' },
+      });
+      expect(payable.statusCode).toBe(201);
+    }
+
+    const adminResponse = await app.inject({
+      method: 'GET',
+      url: `/financial/sales/${storySale}/story`,
+      headers: { 'x-test-principal': 'admin' },
+    });
+    const managerResponse = await app.inject({
+      method: 'GET',
+      url: `/financial/sales/${storySale}/story`,
+      headers: { 'x-test-principal': 'manager' },
+    });
+    const unauthenticated = await app.inject({
+      method: 'GET',
+      url: `/financial/sales/${storySale}/story`,
+    });
+    const viewer = await app.inject({
+      method: 'GET',
+      url: `/financial/sales/${storySale}/story`,
+      headers: { 'x-test-principal': 'viewer' },
+    });
+    const agent = await app.inject({
+      method: 'GET',
+      url: `/financial/sales/${storySale}/story`,
+      headers: { 'x-test-principal': 'agent' },
+    });
+    const invalidSaleId = await app.inject({
+      method: 'GET',
+      url: '/financial/sales/not-a-uuid/story',
+      headers: { 'x-test-principal': 'manager' },
+    });
+    const customerB = await seedCustomer(agencyBId);
+    const saleB = await seedSale(agencyBId, customerB, userBId);
+    const crossTenant = await app.inject({
+      method: 'GET',
+      url: `/financial/sales/${saleB}/story`,
+      headers: { 'x-test-principal': 'owner' },
+    });
+
+    expect(adminResponse.statusCode).toBe(200);
+    expect(managerResponse.statusCode).toBe(200);
+    expect(unauthenticated.statusCode).toBe(401);
+    expect(viewer.statusCode).toBe(403);
+    expect(agent.statusCode).toBe(403);
+    expect(invalidSaleId.statusCode).toBe(400);
+    expect(crossTenant.statusCode).toBe(404);
+    const story = managerResponse.json<{
+      story: {
+        supplierPayables: Array<{ description: string; amount: number }>;
+        installmentSchedule: Array<{ description: string; amount: number; status: string }>;
+      };
+    }>().story;
+    expect(story).toMatchObject({
+      grossSale: 18000,
+      received: 6000,
+      remainingReceivable: 12000,
+      totalSupplierPayable: 14000,
+      margin: {
+        grossSale: 18000,
+        supplierCosts: 13300,
+        commissionAndFees: 700,
+        grossMargin: 4700,
+        netMargin: 4000,
+      },
+    });
+    expect(story.supplierPayables.map(({ description, amount }) => ({ description, amount }))).toEqual([
+      { description: 'Hotel', amount: 7000 },
+      { description: 'Airfare', amount: 5000 },
+      { description: 'Transfer', amount: 800 },
+      { description: 'Travel insurance', amount: 500 },
+      { description: 'Comissao agency', amount: 700 },
+    ]);
+    expect(story.installmentSchedule.map(({ description, amount, status }) => ({ description, amount, status }))).toEqual([
+      { description: 'Entry Test Customer / Cancun', amount: 6000, status: 'PAID' },
+      { description: 'Installment 2 Test Customer / Cancun', amount: 6000, status: 'OPEN' },
+      { description: 'Installment 3 Test Customer / Cancun', amount: 6000, status: 'OPEN' },
+    ]);
+    await app.close();
+  });
+
   it('allows ADMIN to create receivables, payables, payments, allocations, and operational costs', async () => {
     const app = buildTestApp(runtimePool);
     const receivable = await app.inject({
@@ -457,11 +656,17 @@ describe.sequential('Financial HTTP routes', () => {
     return result.rows[0]!.id;
   }
 
-  async function seedSale(agencyId: string, customerId: string, userId: string): Promise<string> {
+  async function seedSale(
+    agencyId: string,
+    customerId: string,
+    userId: string,
+    total = 1000,
+    notes?: string,
+  ): Promise<string> {
     const result = await adminPool.query<{ id: string }>(
-      `INSERT INTO sales (agency_id, customer_id, user_id, amount, discount, total, status)
-       VALUES ($1, $2, $3, '1000.00', '0.00', '1000.00', 'CONFIRMED') RETURNING id`,
-      [agencyId, customerId, userId],
+      `INSERT INTO sales (agency_id, customer_id, user_id, amount, discount, total, status, notes)
+       VALUES ($1, $2, $3, $4, '0.00', $4, 'CONFIRMED', $5) RETURNING id`,
+      [agencyId, customerId, userId, total, notes ?? null],
     );
     return result.rows[0]!.id;
   }
```

## Report
```markdown
# Status

DONE_WITH_CONCERNS

# Changed Files

- `services/api/src/financial.ts`
- `services/api/src/app.ts`
- `services/api/tests/financial-http.test.ts`
- `.superpowers/sdd/local-business-task-4-report.md`

# Verification Commands

- `npm --workspace @travel-platform/api run lint`: PASS, exit code 0. Existing repository warnings only; no errors.
- `npm --workspace @travel-platform/api run typecheck`: PASS, exit code 0.
- `npm run lint`: PASS, exit code 0. Existing repository warnings only; no errors.
- `npm run typecheck`: PASS, exit code 0 before the final fallback narrowing. The subsequent API-only typecheck passed with exit code 0.
- `git diff --check`: PASS, exit code 0.
- `npm run test -- --run services/api/tests/financial-http.test.ts services/api/tests/financial.test.ts`: NOT RUN. `financial-http.test.ts` executes `docker compose down -v`, creates a disposable database, drops/recreates `public`, applies migrations, and truncates tables. This task prohibits destructive commands, resets, and migrations.

# Concerns

- The requested targeted HTTP test was added but not executed because its existing lifecycle is destructive. The closest safe checks, API lint and API typecheck, passed.
- To respect the accepted Task 2 workaround, the story query includes a documented fallback for the two revenue installments without `sale_id`. It is limited to the same tenant and customer and requires the exact canonical demo note derived from the sale's existing demo note; normal revenues remain linked exclusively by `sale_id`.

# Fix Review Response

# Status

DONE_WITH_CONCERNS

# Changed Files

- `services/api/tests/financial-http.test.ts`
- `.superpowers/sdd/local-business-task-4-report.md`

# Verification Commands

- `npm --workspace @travel-platform/api run lint`: PASS, exit code 0. Existing repository warnings only; no errors.
- `npm --workspace @travel-platform/api run typecheck`: PASS, exit code 0.
- `git diff --check`: PASS, exit code 0.
- `npm run test -- --run services/api/tests/financial-http.test.ts services/api/tests/financial.test.ts`: NOT RUN. The command destructively recreates the local database, applies migrations, and executes `docker compose down -v`, which this task prohibits.

# Concerns

- Targeted HTTP execution remains intentionally omitted because the test lifecycle is destructive. Safe static verification will be recorded after it runs.

# Fix Review Response 2

# Status

DONE_WITH_CONCERNS

# Changed Files

- `services/api/src/app.ts`
- `services/api/tests/financial-http.test.ts`
- `.superpowers/sdd/local-business-task-4-report.md`

# Verification Commands

- `npm --workspace @travel-platform/api run lint`: PASS, exit code 0. Existing repository warnings only; no errors.
- `npm --workspace @travel-platform/api run typecheck`: PASS, exit code 0.
- `git diff --check -- services/api/src/app.ts services/api/src/financial.ts services/api/tests/financial-http.test.ts`: PASS, exit code 0.
- `npm run test -- --run services/api/tests/financial-http.test.ts services/api/tests/financial.test.ts`: NOT RUN. The command performs Docker volume reset and database migrations through the test lifecycle, which remains outside the current authorization.

# Concerns

- Targeted HTTP execution remains intentionally omitted because the test lifecycle is destructive.

# Fix Review Response 3

# Status

DONE_WITH_CONCERNS

# Changed Files

- `services/api/src/route-inventory.ts`
- `docs/security/route-security-inventory.md`
- `.superpowers/sdd/local-business-task-4-report.md`

# Verification Commands

- `npm --workspace @travel-platform/api run lint`: PASS, exit code 0. Existing repository warnings only; no errors.
- `npm --workspace @travel-platform/api run typecheck`: PASS, exit code 0.
- `npm --workspace @travel-platform/api run test -- --run tests/sec-a-api-exposure.test.ts`: PASS, 29 tests passed.
- `git diff --check -- services/api/src/app.ts services/api/src/financial.ts services/api/tests/financial-http.test.ts services/api/src/route-inventory.ts docs/security/route-security-inventory.md`: PASS, exit code 0.

# Concerns

- Targeted financial HTTP execution remains intentionally omitted because the test lifecycle is destructive.

```
