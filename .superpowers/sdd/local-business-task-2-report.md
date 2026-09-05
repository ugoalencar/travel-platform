# Status

DONE_WITH_CONCERNS

# Changed Files

- `scripts/demo-business-stories.cjs`
- `scripts/seed-tenant-demo-data.cjs`
- `.superpowers/sdd/local-business-task-2-report.md`

# Verification Commands

- `node --check scripts/demo-business-stories.cjs`: PASS, exit code 0, no output.
- `node --check scripts/seed-tenant-demo-data.cjs`: PASS, exit code 0, no output.
- `node -e "const m=require('./scripts/demo-business-stories.cjs'); if (typeof m.seedBusinessStories !== 'function') throw new Error('missing seedBusinessStories'); if (!m.STORY_IDS.marianaCancun.customer) throw new Error('missing story ids'); console.log('exports ok');"`: PASS, exit code 0, output `exports ok`.

# Concerns

- Current `revenues` schema has `UNIQUE (agency_id, sale_id)`, so one sale cannot have three `revenues` rows all linked by `sale_id` without a migration. The seed stores the first installment with `sale_id` and the remaining two deterministic revenue rows with `sale_id = NULL` plus explicit notes identifying the Mariana sale, preserving the no-migration constraint.
- `npm run test -- --run services/api/tests/demo-seed-stability.test.ts` was not run because the current test body performs `docker compose down -v` and applies migrations internally, while this task explicitly says not to run demo reset or migrations. Task 3 is also expected to update its expectations.
