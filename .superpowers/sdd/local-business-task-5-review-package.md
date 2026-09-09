# Task 5 Review Package

## Git Status
```
 M apps/agency/src/App.tsx
 M apps/agency/src/lib/api.ts
 M apps/agency/src/pages/FinancialPage.tsx
?? .superpowers/sdd/local-business-task-5-report.md
?? .superpowers/sdd/task5_playwright_check.py
?? apps/agency/src/pages/SaleFinancialStoryPage.test.tsx
?? apps/agency/src/pages/SaleFinancialStoryPage.tsx
```

## Diff
```diff
diff --git a/apps/agency/src/App.tsx b/apps/agency/src/App.tsx
index 3d0663d..8ea9df0 100644
--- a/apps/agency/src/App.tsx
+++ b/apps/agency/src/App.tsx
@@ -23,6 +23,7 @@ import { OfferDetailPage } from './pages/OfferDetailPage';
 import { CampaignsPage } from './pages/CampaignsPage';
 import { CouponsPage } from './pages/CouponsPage';
 import { FinancialPage } from './pages/FinancialPage';
+import { SaleFinancialStoryPage } from './pages/SaleFinancialStoryPage';
 import { RevenuesPage } from './pages/RevenuesPage';
 import { ExpensesPage } from './pages/ExpensesPage';
 import { CategoriesPage } from './pages/CategoriesPage';
@@ -59,6 +60,7 @@ export function App() {
         <Route path="campaigns" element={<CampaignsPage />} />
         <Route path="coupons" element={<CouponsPage />} />
         <Route path="financial" element={<FinancialPage />} />
+        <Route path="financial/sales/:saleId/story" element={<SaleFinancialStoryPage />} />
         <Route path="financial/revenues" element={<RevenuesPage />} />
         <Route path="financial/expenses" element={<ExpensesPage />} />
         <Route path="financial/receivables" element={<ReceivablesPage />} />
diff --git a/apps/agency/src/lib/api.ts b/apps/agency/src/lib/api.ts
index 14406cc..c290bde 100644
--- a/apps/agency/src/lib/api.ts
+++ b/apps/agency/src/lib/api.ts
@@ -372,10 +372,46 @@ export interface FinancialSummary {
   }>;
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
+    dueAt: string;
+    status: FinancialObligationStatus;
+  }>;
+  totalSupplierPayable: number;
+  installmentSchedule: Array<{
+    description: string;
+    amount: number;
+    dueDate: string;
+    status: string;
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
 export async function getFinancialSummary(): Promise<FinancialSummary> {
   const data = await request<{ summary: FinancialSummary }>('/api/financial/summary');
   return data.summary;
 }
+
+export async function getSaleFinancialStory(saleId: string): Promise<SaleFinancialStory> {
+  const data = await request<{ story: SaleFinancialStory }>(
+    `/api/financial/sales/${encodeURIComponent(saleId)}/story`,
+  );
+  return data.story;
+}
 // CUSTOMERS
 // ============================================================
 
diff --git a/apps/agency/src/pages/FinancialPage.tsx b/apps/agency/src/pages/FinancialPage.tsx
index 32f0628..72e5322 100644
--- a/apps/agency/src/pages/FinancialPage.tsx
+++ b/apps/agency/src/pages/FinancialPage.tsx
@@ -1,6 +1,8 @@
 import { useEffect, useState } from 'react';
 import { ArrowDownRight, ArrowUpRight, Clock, Wallet } from 'lucide-react';
+import { Link } from 'react-router-dom';
 import { PageHeader } from '../components/layout/PageHeader';
+import { Button } from '../components/ui/button';
 import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
 import { StatCard } from '../components/ui/stat-card';
 import { StatusBadge } from '../components/ui/status-badge';
@@ -119,6 +121,11 @@ export function FinancialPage() {
       <PageHeader
         title="Financeiro"
         description="Visão consolidada de vendas, recebimentos e margem esperada da agência."
+        actions={
+          <Link to="/financial/sales/d0d50001-0000-4000-8000-000000000009/story">
+            <Button size="sm" variant="outline">Historia financeira</Button>
+          </Link>
+        }
       />
 
       <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
```

## Report
```markdown
# Status

DONE_WITH_CONCERNS

# Changed Files

- `apps/agency/src/lib/api.ts`
- `apps/agency/src/pages/SaleFinancialStoryPage.tsx`
- `apps/agency/src/pages/SaleFinancialStoryPage.test.tsx`
- `apps/agency/src/App.tsx`
- `apps/agency/src/pages/FinancialPage.tsx`
- `.superpowers/sdd/local-business-task-5-report.md`

# Verification Commands

- `npm run test -- --run apps/agency/src/pages/SaleFinancialStoryPage.test.tsx apps/agency/src/App.test.tsx`: FAIL, exit code 1. The root `test` script invokes Turborepo, which rejects `--run` instead of forwarding it to Vitest.
- `npm --workspace @travel-platform/agency run test -- --run src/pages/SaleFinancialStoryPage.test.tsx src/App.test.tsx`: PASS, exit code 0. 2 files and 16 tests passed.
- `npm --workspace @travel-platform/agency run lint`: PASS, exit code 0. One pre-existing warning remains in `apps/agency/src/pages/ReportsPage.test.tsx` for `no-explicit-any`.
- `npm --workspace @travel-platform/agency run typecheck`: PASS, exit code 0.
- `npm --workspace @travel-platform/agency run build`: PASS, exit code 0.
- `git diff --check`: PASS, exit code 0.
- `python C:\Users\Ugo Alencar\.agents\skills\webapp-testing\scripts\with_server.py --server "npm --workspace @travel-platform/agency run dev -- --host 127.0.0.1 --port 5174" --port 5174 --timeout 60 -- python .superpowers\sdd\task5_playwright_check.py`: PASS, exit code 0. Desktop and mobile render checks passed with API route mocked; screenshots saved under `.superpowers/sdd/screenshots/`.

# Controller Follow-Up

- Adjusted `SaleFinancialStoryPage` row layout from a single flex line to a responsive grid so mobile descriptions, dates, and money values do not collide.
- Re-ran targeted agency tests, lint, typecheck, build, diff-check, and Playwright render checks after the responsive adjustment.

# Concerns

- The exact targeted test command in the brief cannot pass arguments through the repository's Turborepo root script. The direct agency workspace equivalent passed.
- Agency lint retains one unrelated, pre-existing warning in `apps/agency/src/pages/ReportsPage.test.tsx`.

```

## Visual Check Artifacts
- .superpowers/sdd/screenshots/sale-financial-story-desktop.png
- .superpowers/sdd/screenshots/sale-financial-story-mobile.png
