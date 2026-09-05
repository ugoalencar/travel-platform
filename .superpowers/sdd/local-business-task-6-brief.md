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

