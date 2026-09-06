# AGENT B — SECURITY ADVERSARIAL AUDIT

Target: `release/final-rc-02`

Lock exact SHA.

Attack:
- unauthenticated admin/tenant/financial/reporting/settings routes
- tenant spoof via headers/query/body/cookies/path/client agency_id
- role spoof via headers/body/query/frontend/client claims
- cross-tenant IDOR: customers/wishes/trips/offers/proposals/bookings/sales/financial/reports/settings
- cross-customer IDOR
- staff/customer principal confusion
- token/session tamper, expiry, replay, logout reuse, fixation
- dev-auth in production
- CAPTCHA bypass, invalid/expired/replay, provider unavailable
- MFA bypass, invalid TOTP, recovery reuse
- rate-limit bypass and X-Forwarded-For spoofing
- runtime DB cross-tenant SELECT/INSERT/UPDATE/DELETE
- audit_logs UPDATE/DELETE
- sensitive data in logs/audit
- CORS/security headers/body limits
- CSRF strategy if cookie auth; token handling if bearer
- secret scan
- dependency/security audit

Verify:
ENABLE RLS/FORCE RLS, runtime non-superuser/no BYPASSRLS, SEC-A/B/E/F/H preserved.

Return:

TARGET SHA
ROUTE AUTH
TENANT SPOOF
ROLE SPOOF
CROSS-TENANT IDOR
CUSTOMER IDOR
SESSION SECURITY
DEV AUTH PROD BLOCK
CAPTCHA
MFA
RATE LIMITING
RLS
FORCE RLS
AUDIT APPEND ONLY
AUDIT SENSITIVE DATA
HTTP SECURITY
SECRETS
DEPENDENCIES
P0
P1
P2
P3
FINAL VERDICT PASS/BLOCKED

DO NOT PUSH/PR/MERGE/DEPLOY.
