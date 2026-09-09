# Task 3 Review Package - Rereview

## Git Status
```
 M scripts/seed-demo-data.cjs
 M services/api/tests/demo-seed-stability.test.ts
?? .superpowers/sdd/local-business-task-3-report.md
```

## Diff: services/api/tests/demo-seed-stability.test.ts
```diff
diff --git a/services/api/tests/demo-seed-stability.test.ts b/services/api/tests/demo-seed-stability.test.ts
index 9ece8c3..edd8d7a 100644
--- a/services/api/tests/demo-seed-stability.test.ts
+++ b/services/api/tests/demo-seed-stability.test.ts
@@ -1,6 +1,7 @@
 import { readFileSync } from 'node:fs';
 import { resolve } from 'node:path';
 import { spawnSync } from 'node:child_process';
+import { createRequire } from 'node:module';
 import { afterAll, beforeAll, describe, expect, it } from 'vitest';
 import { Pool } from 'pg';
 
@@ -25,6 +26,20 @@ const migration010Financial = resolve(repoRoot, 'infrastructure/migrations/010_f
 const migration011BookingCancellation = resolve(repoRoot, 'infrastructure/migrations/011_booking_cancellation.sql');
 const migration012OperationalStaff = resolve(repoRoot, 'infrastructure/migrations/012_operational_staff_assignments.sql');
 const migration013Pescador = resolve(repoRoot, 'infrastructure/migrations/013_pescador_foundation.sql');
+const migration014OfferGrowth = resolve(repoRoot, 'infrastructure/migrations/014_offer_growth_foundation.sql');
+const migration015AuditLogging = resolve(repoRoot, 'infrastructure/migrations/015_audit_logging.sql');
+const migration016ProductionAuth = resolve(repoRoot, 'infrastructure/migrations/016_production_auth_captcha_mfa.sql');
+const migration017MfaRlsFix = resolve(repoRoot, 'infrastructure/migrations/017_mfa_rls_p0_fix.sql');
+const migration018LocalDevCorrections = resolve(
+  repoRoot,
+  'infrastructure/migrations/018_local_dev_migration_corrections.sql',
+);
+const migration019CustomerAddresses = resolve(repoRoot, 'infrastructure/migrations/019_customer_360_addresses.sql');
+const migration020CustomerDependents = resolve(repoRoot, 'infrastructure/migrations/020_customer_360_dependents.sql');
+const migration021CustomerDocuments = resolve(repoRoot, 'infrastructure/migrations/021_customer_360_documents.sql');
+const migration022CustomerDocumentAudit = resolve(repoRoot, 'infrastructure/migrations/022_customer_360_document_audit.sql');
+const migration023CustomerRls = resolve(repoRoot, 'infrastructure/migrations/023_customer_360_rls.sql');
+const migration024ExtendedFinancial = resolve(repoRoot, 'infrastructure/migrations/024_extended_financial_module.sql');
 const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
 const seedScript = resolve(repoRoot, 'scripts/seed-demo-data.cjs');
 const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');
@@ -40,6 +55,23 @@ const poolPasswordKey = 'pass' + 'word';
 
 const agencyAId = '10000000-0000-4000-8000-000000000001';
 
+const nodeRequire = createRequire(import.meta.url);
+const { STORY_IDS } = nodeRequire(resolve(repoRoot, 'scripts/demo-business-stories.cjs')) as {
+  STORY_IDS: {
+    marianaCancun: {
+      customer: string;
+      sale: string;
+      receivable: string;
+      payment: string;
+      allocation: string;
+      trip: string;
+      revenueEntrada: string;
+      revenueParcela2: string;
+      revenueParcela3: string;
+    };
+  };
+};
+
 const cockpitDemoCustomerIds = {
   cancun: 'c0cc0001-0000-4000-8000-00000000000a',
   gramado: 'c0cc0001-0000-4000-8000-00000000000b',
@@ -137,6 +169,76 @@ describe.sequential('Commercial Cockpit demo seed stability', () => {
     );
     expect(postSaleTask.rows).toHaveLength(0);
   });
+
+  it('seeds Mariana / Cancun as a deterministic connected financial story', async () => {
+    const ids = STORY_IDS.marianaCancun;
+
+    const result = await adminPool.query<{
+      customer_name: string;
+      sale_total: string;
+      receivable_amount: string;
+      receivable_status: string;
+      payment_amount: string;
+      allocated_amount: string;
+      trip_destination: string;
+    }>(
+      `SELECT
+         c.name AS customer_name,
+         s.total::text AS sale_total,
+         r.amount::text AS receivable_amount,
+         r.status AS receivable_status,
+         p.amount::text AS payment_amount,
+         pa.amount::text AS allocated_amount,
+         t.destination AS trip_destination
+       FROM customers c
+       JOIN sales s ON s.agency_id = c.agency_id AND s.customer_id = c.id
+       JOIN receivables r ON r.agency_id = s.agency_id AND r.sale_id = s.id
+       JOIN payments p ON p.agency_id = c.agency_id AND p.id = $4
+       JOIN payment_allocations pa ON pa.agency_id = p.agency_id AND pa.payment_id = p.id AND pa.receivable_id = r.id
+       JOIN trips t ON t.agency_id = s.agency_id AND t.sale_id = s.id
+       WHERE c.agency_id = $5 AND c.id = $1 AND s.id = $2 AND r.id = $3`,
+      [ids.customer, ids.sale, ids.receivable, ids.payment, agencyAId],
+    );
+
+    expect(result.rows).toHaveLength(1);
+    expect(result.rows[0]).toMatchObject({
+      customer_name: 'Mariana Alves Silva',
+      sale_total: '18000.00',
+      receivable_amount: '18000.00',
+      receivable_status: 'PARTIALLY_PAID',
+      payment_amount: '6000.00',
+      allocated_amount: '6000.00',
+      trip_destination: 'Cancun',
+    });
+  });
+
+  it('seeds Mariana / Cancun installment schedule through revenues', async () => {
+    const ids = STORY_IDS.marianaCancun;
+
+    const rows = await adminPool.query<{
+      id: string;
+      sale_id: string | null;
+      description: string;
+      amount: string;
+      status: string;
+    }>(
+      `SELECT id, sale_id, description, amount::text, status
+       FROM revenues
+       WHERE agency_id = $1 AND id = ANY($2)
+       ORDER BY due_date ASC`,
+      [agencyAId, [ids.revenueEntrada, ids.revenueParcela2, ids.revenueParcela3]],
+    );
+
+    expect(rows.rows).toHaveLength(3);
+    expect(rows.rows.map((row) => row.description)).toEqual([
+      'Entrada Mariana / Cancun',
+      'Parcela 2 Mariana / Cancun',
+      'Parcela 3 Mariana / Cancun',
+    ]);
+    expect(rows.rows.map((row) => row.amount)).toEqual(['6000.00', '6000.00', '6000.00']);
+    expect(rows.rows.map((row) => row.status)).toEqual(['PAID', 'OPEN', 'OPEN']);
+    expect(rows.rows.map((row) => row.sale_id)).toEqual([ids.sale, null, null]);
+  });
 });
 
 function assertSafeTestDatabase(): void {
@@ -189,6 +291,17 @@ async function applyMigrations(pool: Pool): Promise<void> {
     migration011BookingCancellation,
     migration012OperationalStaff,
     migration013Pescador,
+    migration014OfferGrowth,
+    migration015AuditLogging,
+    migration016ProductionAuth,
+    migration017MfaRlsFix,
+    migration018LocalDevCorrections,
+    migration019CustomerAddresses,
+    migration020CustomerDependents,
+    migration021CustomerDocuments,
+    migration022CustomerDocumentAudit,
+    migration023CustomerRls,
+    migration024ExtendedFinancial,
     prepareRolesSql,
   ]) {
     await pool.query(readSqlForPg(migration));
```

## Diff: scripts/seed-demo-data.cjs
```diff
diff --git a/scripts/seed-demo-data.cjs b/scripts/seed-demo-data.cjs
index 2a153e4..b664193 100644
--- a/scripts/seed-demo-data.cjs
+++ b/scripts/seed-demo-data.cjs
@@ -16,6 +16,7 @@
 // admin role), since it inserts across the two demo agencies directly.
 
 const { Pool } = require('pg');
+const { seedBusinessStories } = require('./demo-business-stories.cjs');
 
 const agencyAId = '10000000-0000-4000-8000-000000000001';
 const agencyBId = '20000000-0000-4000-8000-000000000001';
@@ -50,6 +51,7 @@ async function main() {
     const stagesA = await seedDefaultPipelines(pool, agencyAId);
     await seedDefaultPipelines(pool, agencyBId);
     await seedCommercialCockpitScenarios(pool, { agencyId: agencyAId, userId: userAId, stages: stagesA });
+    await seedBusinessStories(pool, { agencyId: agencyAId, userId: userAId });
 
     console.log('Demo data seeded for Agency A and Agency B, including Cliente Demo customer portal fixtures.');
   } finally {
```

## Report
```markdown
Status: DONE_WITH_CONCERNS

Changed files:
- services/api/tests/demo-seed-stability.test.ts
- scripts/seed-demo-data.cjs
- .superpowers/sdd/local-business-task-3-report.md

Summary:
- Imported stable Mariana / Cancun `STORY_IDS` from `scripts/demo-business-stories.cjs`.
- Added a deterministic connected-story proof for Mariana, the BRL 18,000 sale, receivable, payment allocation, and Cancun trip.
- Added an installment proof for the three deterministic revenue rows using `revenueEntrada`, `revenueParcela2`, and `revenueParcela3`, preserving tenant isolation with `agency_id` and not assuming all installments are discoverable by `sale_id`.
- Wired `seedBusinessStories()` into `scripts/seed-demo-data.cjs`, because this is the seed entrypoint used by `demo-seed-stability.test.ts`.
- Extended the disposable database migration list through `024_extended_financial_module.sql` so Customer 360 and extended finance tables exist before the deterministic story seed runs.

Verification:
- `node --check scripts/demo-business-stories.cjs`: PASS, exit code 0.
- `node --check scripts/seed-demo-data.cjs`: PASS, exit code 0.
- `node --check scripts/seed-tenant-demo-data.cjs`: PASS, exit code 0.
- `npm exec eslint -- services/api/tests/demo-seed-stability.test.ts`: PASS, exit code 0.
- `npm exec tsc -- -p tsconfig.json --noEmit --pretty false`: PASS, exit code 0.
- `npm run test -- --run services/api/tests/demo-seed-stability.test.ts`: NOT RUN. Inspected test body first; this test performs `docker compose down -v`, starts a disposable database, applies migrations, and performs volume teardown in `afterAll`, which violates the task constraint unless explicitly safe.

Concerns:
- The exact planned Vitest command was not run because the inspected test body performs destructive Docker volume teardown and migrations.

```
