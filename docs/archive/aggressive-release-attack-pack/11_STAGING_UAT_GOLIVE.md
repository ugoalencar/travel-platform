# AGENT 11 — PUSH → PR → STAGING → UAT → GO-LIVE CONTROL

Use only after Agent 10 returns `READY TO PUSH FINAL RC`.

## Stage 1 — Push/PR

Push final RC normally. No force.

Open PR to main with exact head, base, migrations, release scope, gate summary and audit verdicts.

Wait for CI on exact PR HEAD.

If HEAD changes, old authorization is invalid.

## Stage 2 — Merge

Only after exact-head CI success and P0=0/P1=0.

Use normal merge commit unless repository policy explicitly requires otherwise.

Confirm new main SHA and wait for CI on exact post-merge main SHA.

No staging until post-merge main CI is green.

## Stage 3 — Staging

Deploy exact green main SHA to production-like staging.

Required:
Agency
Customer
API
PostgreSQL
migrations
production-like auth
CAPTCHA
MFA
rate limiting
audit
HTTPS
security headers
health/readiness

Synthetic staging data only.

Smoke:
login
customer
wish
trip
proposal
booking
sale
financial
reports
customer portal
logout
MFA
tenant isolation

Return `READY FOR HUMAN UAT`.

## Stage 4 — UAT

Test as OWNER, ADMIN, AGENT, VIEWER where applicable, CUSTOMER.

Run full business scenario from customer creation through customer portal.

P0/P1 block launch.

Return `READY FOR PRODUCTION AUTHORIZATION` or `NOT READY`.

## Stage 5 — Go-live

Do NOT deploy production without explicit human authorization.

After authorization:
- confirm backup strategy
- secrets
- auth provider
- MFA
- CAPTCHA provider
- HTTPS/domains/CORS
- distributed rate-limit strategy
- audit
- health
- migration plan
- rollback plan

Deploy exact staging-tested SHA.

Run migrations once, no destructive reset.

Smoke health, staff auth, MFA, dashboard, customer/customer portal, logout.

Monitor 5xx, DB errors, auth failures, 429 anomalies, latency and audit failures.

Final output:
PRODUCTION SHA
MIGRATIONS
SMOKE
P0 0
P1 0
TRAVEL PLATFORM LIVE
