# AGENT A — FUNCTIONAL ADVERSARIAL AUDIT

Target: `release/final-rc-02`

Lock exact SHA with `git rev-parse release/final-rc-02`.

Test with real API + disposable PostgreSQL:

Staff flow:
Customer → Wish → Trip → Proposal → Preview → Booking → Sale → Financial → Reporting → Settings/Team.

Reload and restart API; verify persistence.

Customer flow:
own trip/proposal/booking/profile; cross-customer IDs denied.

Adversarial:
- invalid Wish/Trip/Proposal/Booking/Sale transitions
- duplicate submit/retry
- stale IDs
- malformed payloads
- invalid enums/dates/negative monetary values
- 400/401/403/404/409/429/500 handling
- financial amount tampering and rounding
- report consistency
- unauthorized Settings/Team actions for MANAGER/AGENT/VIEWER as applicable
- DB failure
- audit failure
- no half-created booking/sale/payment

Classify P0/P1/P2/P3.

Return:

TARGET SHA
STAFF FLOW PASS/FAIL
CUSTOMER FLOW PASS/FAIL
PERSISTENCE PASS/FAIL
INVALID TRANSITIONS PASS/FAIL
DUPLICATE SAFETY PASS/FAIL
INPUT VALIDATION PASS/FAIL
FINANCIAL INTEGRITY PASS/FAIL
REPORT CONSISTENCY PASS/FAIL
SETTINGS RBAC PASS/FAIL
FAILURE INJECTION PASS/FAIL
P0
P1
P2
P3
FINAL VERDICT PASS/BLOCKED

DO NOT PUSH/PR/MERGE/DEPLOY.
