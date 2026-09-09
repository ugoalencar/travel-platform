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

