# Status

DONE

# Changed Files

- `scripts/demo-business-stories.cjs` (bug fix, discovered by Step 1)
- `scripts/demo-orchestrate.cjs` (bug fixes, discovered by Step 4)
- `apps/platform-admin/vite.config.ts` (bug fix, discovered by Step 4)
- `.superpowers/sdd/local-business-task-7-report.md`

# Bugs Found And Fixed During Verification

1. `scripts/demo-business-stories.cjs` (`seedInstallmentRevenues`): the
   parameterized INSERT used `$8::date` inside a `CASE` while the same `$8`
   was also bound implicitly to the `TIMESTAMPTZ` columns `competency_date`/
   `due_date`, and `$9` was compared to a text literal while also being
   inserted directly into a `"RevenueStatus"` enum column. Postgres rejected
   both as "inconsistent types deduced for parameter". Fixed by casting `$8`
   to `timestamptz` and `$9` to `"RevenueStatus"` consistently everywhere
   they appear. This blocked `demo-seed-stability.test.ts` and `npm run
   demo`/`demo:reset`.
2. `scripts/demo-orchestrate.cjs`: the Step 1 `spawnSync(npmCommand, ...)`
   call (unlike the later `spawn(npmCommand, ...)` calls in the same file)
   was missing `shell: process.platform === 'win32'`, causing
   `spawnSync npm.cmd EINVAL` on Windows with no error text surfaced. Fixed
   by adding the same `shell` option used elsewhere in the file.
3. `scripts/demo-orchestrate.cjs`: Step 1 (`npm run dev:db`) bootstraps the
   Postgres container and also applies migrations 001/002 plus
   manual-testing fixtures (by design, for `services/api`'s own local dev
   workflow). Step 2 then re-applies every migration from scratch via
   `apply-all-migrations.cjs`, which assumes an empty schema (this is exactly
   why `demo-reset.cjs` explicitly drops/recreates the schema between its own
   Step 1 and Step 2). Fixed by adding the same explicit schema reset before
   Step 2 in `demo-orchestrate.cjs`, matching `demo-reset.cjs`'s convention.
4. `apps/platform-admin/vite.config.ts` and `apps/customer/vite.config.ts`
   both hardcoded `port: 5174`. Vite silently reassigns the loser to the next
   free port, so Platform Admin landed on 5176 instead of its documented port
   (`demo-orchestrate.cjs` prints "Platform Admin: http://localhost:5176").
   Fixed by setting Platform Admin's configured port to 5176 to match.

None of these are in the Task 7 brief's file list, but Task 7 is exactly the
step that exercises the full seed/migration/orchestration path end to end,
which is what surfaced them; leaving them broken would have made Step 1 and
Step 4 impossible to pass.

# Verification Commands

- `npm --workspace @travel-platform/api run test -- --run tests/demo-seed-stability.test.ts tests/financial.test.ts tests/financial-http.test.ts`: PASS, exit code 0. 3 files, 20 tests passed.
- `npm --workspace @travel-platform/agency run test -- --run src/pages/SaleFinancialStoryPage.test.tsx src/App.test.tsx`: PASS, exit code 0. 2 files, 16 tests passed.
- `npm run lint`: PASS, exit code 0 (turbo, 7/7 tasks).
- `npm run typecheck`: PASS, exit code 0 (turbo, 7/7 tasks).
- `npm run test`: PASS, exit code 0 (turbo, 7/7 tasks; API alone: 67 files, 1213 tests passed).
- `git diff --check` on all files touched this task: PASS, exit code 0.

# Step 4: Browser QA (user-authorized)

Ran `npm run demo` end to end (bootstrap, schema reset, all 36 migrations,
tenant + platform seed data, all 5 services) after the fixes above. Verified
with a headless Playwright pass (dev-auth headers injected at the browser
context level, since the SPAs use real production auth with no dev-login UI)
plus direct API calls:

- `GET /financial/summary` (agency, ADMIN dev principal): real seeded totals
  (sales this month R$24.000, received R$6.000, etc.) — not fixture noise.
- `GET /financial/sales/d0d50001-0000-4000-8000-000000000009/story`: matches
  the brief's expected numbers exactly — grossSale 18000, received 6000,
  remainingReceivable 12000, totalSupplierPayable 14000, netMargin 4000.
- `http://localhost:5173/financial` and `.../financial/sales/.../story`
  (Playwright, screenshotted): agency UI renders the same numbers, presenter-
  safe sale story page confirmed visually.
- `http://localhost:5174/customer-portal` (Playwright, `x-dev-customer`
  header, screenshotted): shows trip/proposal/offer/booking counts only — no
  finance, margin, supplier cost, or tenant IDs. (Note: `apps/customer`'s
  root `/` route is its own internal staff panel, not the customer-facing
  surface — the customer-facing route is `/customer-portal`, per its
  `App.tsx` routing.)

All dev/demo processes were stopped after verification (finance data was
seeded to the disposable local test-only Postgres container, not any shared
or production database).

# Concerns

None. All four Task 7 steps are complete and verified.
