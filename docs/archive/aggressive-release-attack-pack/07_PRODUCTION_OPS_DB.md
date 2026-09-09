# AGENT 07 — COMPLETE PRODUCTION AREA
## ProdOps + DB/Recovery + Production Build + Staging Package

Branch: `release/f-production-readiness`

Validate incrementally.

## P1 ProdOps

Complete:
- structured logs
- request correlation ID
- health
- readiness
- graceful shutdown
- DB pool constraints
- production env fail-closed
- operational metrics hooks

No observability vendor choice unless necessary.

Run typecheck/tests/build/startup/shutdown smoke.

## P2 Database / Recovery

Run:
1. empty DB → all migrations
2. current main schema → release schema
3. representative rows survive upgrade
4. backup
5. restore
6. RLS/FORCE after restore
7. runtime role privileges after restore
8. audit append-only after restore

Check migration numbering, destructive DDL, tenant ownership, runtime non-superuser/no BYPASSRLS.

## P3 Production artifact audit

Build Agency, Customer and API production artifacts.

Prove no active:
- demo mode
- fixture fallback
- mock adapter
- fake ADMIN
- hardcoded tenant/customer
- dev-auth
- debug routes

Verify source and built output where practical.

## P4 Staging package

Prepare deployment/env/secrets/migration/rollback/smoke documentation for staging.

Do not deploy production.

## Exit

PROD CONFIG
HEALTH
READINESS
LOGGING
SHUTDOWN
ZERO→HEAD
MAIN→HEAD
BACKUP
RESTORE
RLS/FORCE
NO PROD MOCKS
PRODUCTION BUILD
STARTUP SMOKE
STAGING PACKAGE
P0
P1
READY FOR PRODUCTION INTEGRATION / HUMAN DECISION / BLOCKED
