# AGENT 06 — COMPLETE SECURITY AREA
## Production Auth + SEC-C CAPTCHA + SEC-D MFA

Branch: `release/e-security-auth-mfa`

Validate incrementally after each section.

## S1 Production Auth

Implement/reuse production authentication:

OIDC/OAuth2 → AuthProvider → internal principal → DB membership → agency → role → TenantContext → RBAC → RLS.

Browser never chooses tenant, agency or role.

Require Authorization Code, state, nonce where applicable, issuer, audience, signature, expiration, redirect allowlist, fail-closed.

Secure session compatible with existing architecture. Logout invalidates.

Production with dev-auth enabled must fail closed.

Staff/customer principals remain distinct.

Create MFA-ready states:
PRIMARY_AUTHENTICATED → MFA_REQUIRED → FULLY_AUTHENTICATED.

Run auth/security/typecheck/build before S2.

## S2 SEC-C CAPTCHA / Abuse

Preserve SEC-B states:
allow, throttle, captcha_required, temporary_block.

CAPTCHA only when server requires it. Verification is server-side. Never trust client booleans.

Use vendor-agnostic provider abstraction unless vendor choice is unavoidable.

Test valid, invalid, expired, replay, bypass, temporary block and provider-unavailable safe behavior.

Run security/CAPTCHA/rate-limit/typecheck/build before S3.

## S3 MFA

OWNER + ADMIN mandatory. Assess MANAGER only.

TOTP + one-time recovery codes. No SMS-only.

Secret shown once and protected at rest. Valid TOTP required before enable. Recovery codes stored hashed and single-use.

MFA_REQUIRED cannot use privileged routes. Rotate/finalize session after MFA.

Audit MFA events without secret/code values.

## Final adversarial

auth bypass
tenant/role spoof
session replay
logout reuse
CAPTCHA bypass
MFA bypass
cross-customer principal confusion
sensitive audit leakage

## Exit

PRODUCTION AUTH
DEV AUTH PROD BLOCK
SESSION
CAPTCHA
MFA OWNER
MFA ADMIN
RECOVERY
PRE-MFA BLOCK
SECURITY TESTS
TYPECHECK
BUILD
P0
P1
READY FOR SECURITY INTEGRATION / HUMAN DECISION / BLOCKED

Do not push, PR or merge.
