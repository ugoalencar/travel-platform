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
