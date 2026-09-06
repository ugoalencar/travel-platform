# AGENT D — PRODUCTION READINESS AUDIT

Target: `release/final-rc-02`

Lock exact SHA.

Build production artifacts:
- API/backend
- Agency app
- Customer app

Audit source + built artifacts for active:
fixture, mock, demo, fake admin, hardcoded tenant/customer, dev-auth, debug route.

Verify production env fail-closed for critical:
DB, auth/OIDC, session/token secrets, CAPTCHA if required, trusted proxy, CORS, production guards.

Start production-like runtime against disposable services.

Verify:
API startup
Agency serve
Customer serve
DB connectivity
auth init
no demo/fixture fallback
health
readiness
graceful shutdown
DB pool close
structured logs
request correlation IDs
no passwords/tokens/TOTP/recovery/CPF/passport/raw sensitive payload in logs
observability signals for latency, 5xx, 429, DB/auth/booking/financial/audit failures
CORS/trusted proxy/security headers/body limits
HTTPS/cookie assumptions
multi-instance rate-limit strategy not relying only on in-memory store
staging deployment/env/secrets/migration/rollback/backup/smoke package
secret scan
dependency/security audit

Return:

TARGET SHA
PRODUCTION BUILD
NO PRODUCTION MOCKS
NO DEV AUTH
ENV FAIL CLOSED
STARTUP SMOKE
HEALTH
READINESS
GRACEFUL SHUTDOWN
LOGGING
NO SENSITIVE LOGGING
OBSERVABILITY
HTTP SECURITY
RATE LIMIT DEPLOYMENT MODEL
STAGING PACKAGE
SECRETS
DEPENDENCIES
P0
P1
P2
P3
FINAL VERDICT PASS/BLOCKED

DO NOT PUSH/PR/MERGE/DEPLOY.
