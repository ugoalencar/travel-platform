# Master Orchestrator

```text
TRAVEL PLATFORM — OPERATIONS & SECURITY HARDENING

Read the full pack.

GOAL:
Harden the already-functioning SaaS for updates, support, observability, HTTPS readiness, recovery and application security.

DO NOT:
- rebuild working product modules
- weaken RLS/RBAC
- create parallel auth
- create parallel finance
- activate production
- touch DNS/secrets/providers without approval

PARALLEL:
Agent 01 Release
Agent 02 Support
Agent 03 AppSec
Agent 04 TLS
Agent 05 Backup/DR

Agent 06 Integrator owns shared security changes.

PRIORITY:
1. SQL Injection
2. SSRF/Pescador
3. IDOR/BOLA
4. Uploads
5. Public tokens
6. Webhooks
7. XSS/CSRF
8. Secrets
9. CORS/headers
10. HTTPS
11. Backup/restore
12. Rollback/support

AUTO-APPROVE:
reversible, tested, non-destructive hardening.

STOP FOR HUMAN:
Auth/Tenant/RLS/RBAC structural changes,
production DNS/TLS,
provider secrets,
destructive DB,
retention/SLA/legal decisions.

FINAL ACCEPTANCE:
P0 security = 0
P1 security = 0
RLS = PASS
tenant isolation = PASS
SQL injection = PASS
SSRF = PASS
HTTPS readiness = PASS
backup/restore = PASS
rollback = PASS
support observability = PASS
```
