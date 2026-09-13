# Master Orchestrator

```text
TRAVEL PLATFORM — STAGING, UAT & GO-LIVE

Goal:
Move the existing platform into real staging, execute E2E/UAT and produce GO/NO-GO.

Do not add features.
Do not weaken Auth/RBAC/RLS/Tenant.
Do not change finance formulas.
Do not rewrite applied migrations.
Do not commit secrets.
Do not use production customer data.

Phases:
1 baseline freeze
2 infrastructure
3 secrets
4 database
5 deploy
6 smoke
7 E2E
8 UAT
9 security/backup/rollback
10 GO/NO-GO

SQL migrations are authoritative.

Human required for credentials, DNS, paid providers, production activation, destructive DB and retention/legal decisions.

Final acceptance:
P0=0
P1=0
critical E2E PASS
UAT PASS
RLS PASS
cross-tenant PASS
HTTPS PASS
backup/restore PASS
rollback ready
observability active

Output:
docs/staging-uat-golive/FINAL_GO_NO_GO_REPORT.md
```
