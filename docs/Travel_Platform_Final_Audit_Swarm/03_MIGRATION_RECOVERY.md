# AGENT C — MIGRATION / RECOVERY AUDIT

Target: `release/final-rc-02`

Lock exact final RC SHA and origin/main SHA.

Inventory migrations:
- unique deterministic ordering
- no conflicting DDL
- no hidden manual prerequisite
- no destructive reset

Run on disposable PostgreSQL:

A. Empty DB → all migrations → HEAD
B. Current main schema → HEAD
C. Insert representative pre-upgrade rows → upgrade → verify survival

Representative data:
agency, membership, customer, wish, trip, proposal, booking, sale, financial/payment, settings, audit, MFA/auth refs.

Verify:
- critical tables exist
- relationships/FKs/statuses/amounts/timestamps preserved
- ENABLE RLS/FORCE RLS
- runtime role non-superuser/no BYPASSRLS
- audit runtime privileges prevent UPDATE/DELETE

Backup realistic release DB using approved PostgreSQL/project process.
Restore into fresh DB.
After restore verify:
schema, data, relationships, RLS/FORCE, runtime privileges, audit privileges, MFA policies.

Point app/test harness to restored DB and verify reads for core/financial/reporting/settings.

Return:

TARGET SHA
MAIN SHA
MIGRATION COUNT
MIGRATION ORDER PASS/FAIL
ZERO→HEAD PASS/FAIL
MAIN→HEAD PASS/FAIL
DATA SURVIVAL PASS/FAIL
RLS PASS/FAIL
FORCE RLS PASS/FAIL
RUNTIME ROLE PASS/FAIL
AUDIT PRIVILEGES PASS/FAIL
BACKUP PASS/FAIL
RESTORE PASS/FAIL
APP AFTER RESTORE PASS/FAIL
P0
P1
P2
P3
FINAL VERDICT PASS/BLOCKED

DO NOT PUSH/PR/MERGE/DEPLOY.
