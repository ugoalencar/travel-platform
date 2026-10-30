# PX1 Master Coordination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coordinate PX1 so security fixes in the Full platform and UX P0 work in Travel Lite happen in the right order, in isolated scopes, with explicit gates and no accidental production, migration, or `main` changes.

**Architecture:** PX1 is split into two independently testable tracks: Full security hardening for `/api/import/*`, then Travel Lite UX P0. The Full track must run in its own branch/worktree from `main`; the Lite track must run only in `D:\travel-platform\.worktrees\travel-lite` on `feature/travel-lite`.

**Tech Stack:** Node.js, TypeScript, Fastify, React, Vite, Vitest, npm workspaces, Turborepo, PostgreSQL/RLS for the Full API; Travel Lite local app/API remains separate.

## Global Constraints

- Do not edit, merge, commit to, or deploy `main` without explicit approval.
- Do not access production or staging without explicit approval.
- Do not read real `.env` files, including `.env` or `.env.travel-lite`.
- Do not run `prisma migrate`, `prisma db push`, or `prisma generate`.
- Do not run migrations unless explicitly authorized.
- Do not install dependencies without explicit authorization.
- Keep Claude and Opencode/Mimo on disjoint write scopes.
- Full security work must not touch `apps/travel-lite`, `services/api-lite`, or `docs/travel-lite`.
- Travel Lite UX work must not touch `services/api`, production docs, or `.claude`.
- Every implementation task must end with its relevant gates and a `.md` report in the agent's own folder.

---

## Current Inputs

Read these before executing any task:

- `.claude/2026-10-01_1027_auditoria-mapa-lite-full.md`
- `.claude/2026-10-01_PX1-02_import-routes-security-audit.md`
- `.claude/2026-10-01_PX1-03_import-security-fix-spec.md`
- `.opencode/Auditoria-UX-Travel-Lite-checklist-PX1-2026-10-01-1035.md`
- `.opencode/PX1-02-UX-P0-implementation-spec-2026-10-01.md`
- `AGENTS.md`
- `docs/AI_CONTEXT.md`
- `QUALITY-GATES.md`
- `SCRIPTS.md`

## File Structure

### Track A — Full Import Security

Allowed write scope:

- `services/api/src/routes/import.ts`
- `services/api/src/import/service.ts`
- `services/api/src/rate-limit.ts` only if rate-limit change is explicitly approved
- `services/api/tests/import-routes-http.test.ts`
- `tests/security/import-allowlist.test.ts`
- `docs/03-security/authorization.md`
- `.claude/*.md` reports/prompts

Do not touch:

- `apps/travel-lite/**`
- `services/api-lite/**`
- `docs/travel-lite/**`
- `.opencode/**`

### Track B — Travel Lite UX P0

Allowed write scope:

- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\App.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\App.test.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\Layout.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\ui.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\pages\HelpPage.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\pages\DashboardPage.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\pages\CustomersPage.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\pages\SellersPage.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\pages\SalesPage.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\pages\FinancePage.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\pages\SettingsPage.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\pages\CatalogPage.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\pages\CommissionsPage.tsx`
- `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\pages\ImportDataPage.tsx`
- `D:\travel-platform\.worktrees\travel-lite\docs\travel-lite\PLAN-CAPABILITIES.md`
- `.opencode/*.md` reports/prompts

Do not touch:

- `D:\travel-platform\services\api/**`
- `D:\travel-platform\.claude/**`
- `D:\travel-platform\docs/03-security/**`

---

### Task 1: Freeze Parallel Agents and Confirm Baseline

**Files:**
- Read: `.claude/2026-10-01_1059_PX1-HOLD-ack.md`
- Read: `.opencode/ACK-HOLD-PX1-2026-10-01-1100.md`
- Read: `docs/superpowers/plans/2026-10-01-px1-master-coordination.md`
- Modify only if needed: `.claude/NEXT-PROMPT-*.md`, `.opencode/NEXT-PROMPT-*.md`

**Interfaces:**
- Consumes: HOLD acknowledgements from Claude and Opencode/Mimo.
- Produces: decision that no agent continues until assigned an isolated task.

- [ ] **Step 1: Confirm no implementation happened after HOLD**

Run:

```powershell
git status --short --branch
git -C D:\travel-platform\.worktrees\travel-lite status --short --branch
```

Expected:

```text
## main...origin/main
?? .claude/
?? .opencode/
...
## feature/travel-lite
```

The Travel Lite worktree should remain clean or show only explicitly expected report files if the external agent wrote inside that worktree. If code files changed unexpectedly, stop and report.

- [ ] **Step 2: Keep both agents paused**

Tell the user:

```text
Os dois agentes estão em HOLD. A próxima liberação será por tarefa isolada.
```

- [ ] **Step 3: Commit nothing**

Do not commit coordination files unless the user explicitly asks. Current repository rules prohibit commit without explicit authorization.

---

### Task 2: Full Import Security Implementation

**Files:**
- Modify: `services/api/src/routes/import.ts`
- Modify: `services/api/src/import/service.ts`
- Modify: `tests/security/import-allowlist.test.ts`
- Create: `services/api/tests/import-routes-http.test.ts`
- Modify: `docs/03-security/authorization.md`
- Optional modify only with explicit approval: `services/api/src/rate-limit.ts`
- Create report: `.claude/2026-10-01_PX1-04_import-security-implementation-report.md`

**Interfaces:**
- Consumes: `.claude/2026-10-01_PX1-03_import-security-fix-spec.md`
- Produces: authenticated and authorized `/api/import/*` routes, tests, and security report.

- [ ] **Step 1: Create an isolated implementation branch/worktree**

Use a branch from `main`, suggested:

```powershell
git switch -c codex/px1-import-security
```

If `main` must stay untouched in this checkout, create/use an isolated worktree instead. Do not implement directly on `main`.

- [ ] **Step 2: Write failing tests first**

Create `services/api/tests/import-routes-http.test.ts` covering:

```text
returns 401 on every import route without a session
does not read an anonymous multipart upload
forbids VIEWER and AGENT from import writes
forbids MANAGER from import writes but allows reads
allows ADMIN and OWNER to run import routes
never echoes internal error messages on 500
rejects malformed input before the service
```

Run:

```powershell
npm run test -- --run services/api/tests/import-routes-http.test.ts
```

Expected before implementation: failures proving current routes are unprotected or leak error details.

- [ ] **Step 3: Apply `protectedHooks` to all import routes**

In `services/api/src/routes/import.ts`, make `protectedHooks` required in the route registration options and apply:

```ts
{ preHandler: protectedHooks }
```

to all seven import routes:

```text
POST /api/import/upload
POST /api/import/:jobId/parse
POST /api/import/:jobId/validate
POST /api/import/:jobId/confirm
POST /api/import/:jobId/cancel
GET /api/import/jobs
GET /api/import/:jobId
```

- [ ] **Step 4: Add RBAC**

Use:

```ts
requireRole(UserRole.ADMIN);
```

for write routes:

```text
upload, parse, validate, confirm, cancel
```

Use:

```ts
requireRole(UserRole.MANAGER);
```

for read routes:

```text
jobs, :jobId
```

Decision: use ADMIN for import writes unless the user explicitly chooses MANAGER except EMPLOYEE. Current plan uses ADMIN.

- [ ] **Step 5: Remove raw `error.message` responses**

Remove local catch blocks in `routes/import.ts` that send raw internal messages. Let `services/api/src/errors.ts` handle unexpected errors globally.

In `services/api/src/import/service.ts`, reclassify user-facing errors:

```text
unsupported format -> ValidationError
XLSX disabled -> ValidationError
confirm outside DRY_RUN -> ConflictError
job not found -> NotFoundError
unsupported entity type -> ValidationError
```

- [ ] **Step 6: Add input validation**

Validate before service calls:

```text
jobId: non-empty UUID-like string
entityType: supported ImportEntityType
sourceSystem: optional string max 100
originalFilename: required, max 255, no path separator
fileContent: valid base64 and decoded size within import max
mapping: plain string-to-string object with bounded keys
parsedRows: array capped by MAX_IMPORT_ROWS
limit: integer 1..100
offset: integer >= 0
```

- [ ] **Step 7: Adjust F-03 allowlist test**

Update `tests/security/import-allowlist.test.ts` so tests authenticate as ADMIN before asserting poisoned mapping returns 400 before opening a transaction.

- [ ] **Step 8: Update security documentation**

In `docs/03-security/authorization.md`, add Import Center access:

```text
Import Center reads: MANAGER+
Import Center writes: ADMIN+
```

- [ ] **Step 9: Run gates for this task**

Run:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

If DB isolation tests were added:

```powershell
npm run test:db
```

Do not run deploy or production smoke without explicit authorization.

- [ ] **Step 10: Write implementation report**

Create `.claude/2026-10-01_PX1-04_import-security-implementation-report.md` with:

```text
files changed
tests added/changed
gates run and results
remaining risks
deploy/smoke not performed unless explicitly authorized
```

---

### Task 3: Travel Lite UX P0 Implementation

**Files:**
- Modify: `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\App.tsx`
- Modify: `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\App.test.tsx`
- Modify: `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\Layout.tsx`
- Modify: `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\ui.tsx`
- Create: `D:\travel-platform\.worktrees\travel-lite\apps\travel-lite\src\pages\HelpPage.tsx`
- Modify: selected Travel Lite page files listed in File Structure
- Create: `D:\travel-platform\.worktrees\travel-lite\docs\travel-lite\PLAN-CAPABILITIES.md`
- Create report: `.opencode/PX1-03-UX-P0-implementation-report-2026-10-01.md`

**Interfaces:**
- Consumes: `.opencode/PX1-02-UX-P0-implementation-spec-2026-10-01.md`
- Produces: UX P0 implementation in Travel Lite with tests and report.

- [ ] **Step 1: Confirm worktree baseline**

Run:

```powershell
git -C D:\travel-platform\.worktrees\travel-lite status --short --branch
```

Expected:

```text
## feature/travel-lite
```

Do not continue if unexpected source changes are present.

- [ ] **Step 2: Implement access denied panel first**

In `App.tsx`, replace the silent redirect in `Allowed` with an in-place access denied panel:

```text
Você não tem acesso a esta área.
Se precisar desta permissão, fale com um administrador da agência.
Voltar ao dashboard
```

Add tests in `App.test.tsx`:

```text
user without permission sees denied panel
user with permission sees normal page
anonymous user still goes to login
```

- [ ] **Step 3: Add reusable UX primitives**

In `ui.tsx`, add:

```text
SuccessNote
EmptyState
```

Use existing visual language. Do not add a global toast provider in PX1.

- [ ] **Step 4: Apply empty states and success notes page-by-page**

Update one page at a time:

```text
CustomersPage
SellersPage
SalesPage
FinancePage
SettingsPage
CatalogPage
CommissionsPage
ImportDataPage
DashboardPage only where already touched
```

For each page:

```text
empty list -> EmptyState with CTA when permission allows
successful mutation -> SuccessNote
destructive action -> window.confirm before API call
```

Do not add backend endpoints.

- [ ] **Step 5: Add `/ajuda`**

Create `HelpPage.tsx` with static pt-BR content:

```text
Status das vendas
Status das comissões
Perfis e permissões
Importação
Financeiro
Primeiros passos
```

Register route `/ajuda` in `App.tsx`.

Add a topbar link in `Layout.tsx`.

Add tests:

```text
authenticated user can open /ajuda
topbar Ajuda link renders the page
anonymous user cannot access /ajuda
```

- [ ] **Step 6: Add first-run checklist**

In `DashboardPage.tsx`, add a first-run checklist that uses existing endpoints:

```text
financial accounts
categories
sellers
customers
```

Use `Promise.allSettled` so a failed helper request does not break dashboard KPIs.

Hide admin-only steps from users without the required permission.

- [ ] **Step 7: Add Plan Capabilities document**

Create `docs/travel-lite/PLAN-CAPABILITIES.md` covering:

```text
current state: no plan model
FREE limit assumptions needing decision
server-side gating only in future PX2
roles/capabilities relationship
upgrade readiness
non-goals: billing, payment, marketplace
```

Do not implement plan gating in PX1.

- [ ] **Step 8: Run Travel Lite gates**

From `D:\travel-platform\.worktrees\travel-lite`, run:

```powershell
npx turbo run lint typecheck test build --filter=@travel-platform/travel-lite --force
```

If implementation touched api-lite unexpectedly, also run:

```powershell
npx turbo run lint typecheck test build --filter=@travel-platform/api-lite --force
```

Then run root typecheck if already known to be required in this worktree:

```powershell
npx tsc -p tsconfig.json --noEmit
```

- [ ] **Step 9: Write implementation report**

Create `.opencode/PX1-03-UX-P0-implementation-report-2026-10-01.md` with:

```text
files changed
features implemented
tests added/changed
gates run and results
screens/manual smoke notes
remaining decisions
```

---

### Task 4: Consolidate Results Before Any Deployment or Release Package

**Files:**
- Read: `.claude/2026-10-01_PX1-04_import-security-implementation-report.md`
- Read: `.opencode/PX1-03-UX-P0-implementation-report-2026-10-01.md`
- Create or modify only with approval: consolidated PX1 report under `docs/travel-lite/` or `.claude/.opencode`

**Interfaces:**
- Consumes: implementation reports from both tracks.
- Produces: go/no-go recommendation for security merge and Lite release packaging.

- [ ] **Step 1: Verify both agents stayed in scope**

Run:

```powershell
git status --short --branch
git -C D:\travel-platform\.worktrees\travel-lite status --short --branch
```

Expected:

```text
Full security files changed only in the Full branch/worktree.
Travel Lite UX files changed only in feature/travel-lite.
No production deploy performed.
No migrations run.
No .env files read or changed.
```

- [ ] **Step 2: Review test evidence**

Check both reports for exact commands and pass/fail output summaries. If any required gate was skipped, record why before proceeding.

- [ ] **Step 3: Decide next action**

Possible outcomes:

```text
Security fix ready for review/PR, deploy still blocked pending approval.
Travel Lite UX ready for local package refresh.
One or both tracks require fixup.
```

- [ ] **Step 4: Do not deploy or package automatically**

Ask the user before:

```text
merge
push
open PR
deploy
package Travel Lite release zip
run production smoke
```

---

## Human Decisions Required

Before Task 2 implementation:

- Import write RBAC: use ADMIN for all writes, or MANAGER except EMPLOYEE. Recommendation: ADMIN.
- Rate limit dedicated for `/api/import/*`: do now or follow-up. Recommendation: follow-up unless tests show abuse risk remains high.

Before Task 3 implementation:

- Success feedback: inline `SuccessNote` or toast. Recommendation: inline `SuccessNote`.
- Access denied: in-place panel or redirect to dashboard with message. Recommendation: in-place panel.
- Checklist completion: hide when complete or show "Tudo pronto". Recommendation: hide when complete.
- Confirm importation: add `window.confirm` before confirm. Recommendation: yes.
- Help link location: topbar only or also sidebar. Recommendation: topbar only.
- Plan FREE limits: current docs mention 50 customers / 10 trips; for Lite, decide if "10 trips" maps to sales. Recommendation: document as open decision, no gating yet.

## Execution Recommendation

Run **Task 2 first** because it is a confirmed security defect in the Full API. Keep Opencode/Mimo on HOLD while Claude implements Task 2.

After Task 2 is implemented, tested, and reviewed, run **Task 3** in Travel Lite. This avoids splitting attention across security and UX implementation.

Only after both reports are reviewed should PX1 move to packaging, PRs, deployment, or release documentation.

