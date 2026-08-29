# AGENT 10 — FINAL RC + AUDIT SWARM

## Part A — Final RC Integrator

Inputs:
- green `release/product-integration`
- green `release/security-production-integration`

Branch: `release/final-rc`

Integrate Product first, run full gates. Then Security/Production, run full gates again. Never continue from red intermediate state.

Required:
lint
typecheck
unit
agency
customer
security
auth
CAPTCHA
MFA
financial
reporting
settings
db
RLS
FORCE
tenant/customer isolation
migration validation
secrets
dependency/security check
build
production build
recovery drill

Return exact FINAL RC HEAD.

## Part B — Spawn FOUR audit agents in parallel on exact FINAL RC HEAD

### Audit 1 — Functional adversarial
Test invalid states, duplicates, stale IDs, malformed requests, 400/401/403/404/409/429/500, DB failure, audit failure, persistence restart, financial tamper, report consistency.

### Audit 2 — Security adversarial
Test unauth admin, tenant/role spoof, IDOR, cross-tenant/customer, MFA bypass, CAPTCHA bypass, rate-limit bypass, session reuse, logout replay, audit mutation/leak, dev-auth production, RLS bypass.

### Audit 3 — Migration/recovery
Run zero→HEAD, main→HEAD, backup, restore, representative data, RLS/FORCE/runtime privileges/audit privileges/MFA tables after restore.

### Audit 4 — Production readiness
Check production artifacts, no mocks/demo/dev-auth/debug, env fail-closed, health/readiness/shutdown, secret scan, dependency audit, startup smoke, staging package.

## Repair policy

P0/P1: smallest fix on final RC, new commit, invalidate old audit SHA, rerun ALL four audits.

P2/P3: document unless directly release-blocking.

## Final Release Lock

When all four audits have P0=0/P1=0:
- clean worktree
- full SHA
- compare to main
- migrations list
- final full gates
- create `docs/release/FINAL_RELEASE_LOCK.md`

Return:

FINAL RELEASE SHA
BASE MAIN SHA
COMMITS AHEAD
FULL GATES PASS
AUDIT1 PASS
AUDIT2 PASS
AUDIT3 PASS
AUDIT4 PASS
P0 0
P1 0
READY TO PUSH FINAL RC

DO NOT PUSH.
DO NOT PR.
DO NOT MERGE.
DO NOT DEPLOY.
