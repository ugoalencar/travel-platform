# P0 INTEGRATOR — RC02 REPAIR + REAUDIT GATE

Inputs:
- build/test P0 stream
- rate-limit store P0 stream
- dependency vulnerability stream
- agency productionization stream

Base:
exact blocked `release/final-rc-02` HEAD

Branch:
`release/final-rc-02-p0-remediated`

Integrate ONE stream at a time.

After each integration run:
lint
typecheck
relevant tests
security tests
build

Do not continue from red state.

Special checks:
- ApiError remains single canonical implementation
- testing dependency only in correct workspace
- Redis store preserves SEC-B semantics and production fail-closed
- no unsafe fallback to memory in multi-instance production
- dependency audit status is truthful; no threshold suppression
- agency production build has no production-reachable fixture fallback

Then run full gates:
lint
typecheck
unit
agency
customer
core
financial
reporting
settings
auth
CAPTCHA
MFA
security
database
RLS
FORCE RLS
tenant isolation
customer isolation
migration validation
secrets
dependency audit
security check
build
production build
startup smoke
backup/restore where configured

Required:
P0=0
P1=0

Return:
BRANCH
FINAL HEAD
SOURCE STREAM HEADS
TYPECHECK
TESTS
SECURITY
DEPENDENCY AUDIT
RATE LIMIT PROD STORE
NO PROD FIXTURES
PRODUCTION STARTUP
BUILD
P0
P1
FINAL VERDICT READY TO RERUN ALL 4 AUDITS / BLOCKED

DO NOT PUSH/PR/MERGE/DEPLOY.
