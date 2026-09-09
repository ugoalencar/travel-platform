# AGENT 09 — SECURITY + PRODUCTION INTEGRATOR

Inputs:
- green Agent 06 security stream
- green Agent 07 production stream

Branch: `release/security-production-integration`

Integrate one at a time, running typecheck/security/build after each.

## Preserve baseline invariants

SEC-A route classification
SEC-B rate limiting
SEC-E CORS/headers/body limits
SEC-F append-only audit
SEC-H production fail-closed
TenantContext
RBAC
RLS/FORCE
customer self-scope

## Prove

production staff auth
customer principal isolation
CAPTCHA
MFA
logout invalidation
dev-auth impossible in production
zero→head
main→head
backup/restore
health/readiness
graceful shutdown
no production mocks
production startup smoke

## Adversarial

auth bypass
MFA bypass
CAPTCHA bypass
role/tenant spoof
XFF spoof
session replay
audit UPDATE/DELETE
RLS bypass
sensitive logs/audit
dev-auth production

## Exit

SECURITY-PROD HEAD
AUTH PASS
CAPTCHA PASS
MFA PASS
DB PASS
RECOVERY PASS
PROD BUILD PASS
P0 0
P1 0
READY FOR FINAL RC / BLOCKED
