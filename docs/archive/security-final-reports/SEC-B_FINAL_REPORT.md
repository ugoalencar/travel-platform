SEC-B — RATE LIMITING + BRUTE FORCE

BASE SHA

efb377cc5741e3acafcd26f589d83529108003bf

HEAD SHA

79ab1bb518fd03ae687126e0451d74fa52e4c6fb

FILES CHANGED

- `.env.example`
- `package-lock.json`
- `services/api/src/app.ts`
- `services/api/src/env.ts`
- `services/api/src/rate-limit.ts`
- `services/api/tests/api-foundation.test.ts`
- `services/api/tests/env.test.ts`
- `services/api/tests/rate-limit.test.ts`
- `docs/03-security/rate-limiting.md`

CURRENT LIMITER

The former process-local write-only bucket was replaced by class-based request
limits. Fastify enforces IP/route quotas at `onRequest` and trusted-tenant
quotas only after the existing staff or customer auth and tenant hooks finish.

RATE-LIMIT CLASSES

`AUTH_LOGIN`, `AUTH_RECOVERY`, `PUBLIC_ANONYMOUS`, `CUSTOMER_READ`,
`CUSTOMER_WRITE`, `STAFF_READ`, `STAFF_WRITE`, `SENSITIVE_MUTATION`,
`WEBHOOK_EXTERNAL`, and `SYSTEM_INTERNAL` are explicit server classes.

LOGIN PROTECTION

`LoginAbuseProtector` implements TTL-bound progressive states: `allow`,
`throttle`, `captcha_required`, and `temporary_block`. It tracks per-IP,
hashed per-account, and account/IP-pair failures. A success resets the account
and pair state. No permanent account lock exists.

ACCOUNT ENUMERATION

Account identifiers are hashed before use as rate-limit-store keys. The
provider contract requires failure recording for both known and unknown
accounts and an identical caller-facing credential failure response.

PER-IP

Request quotas key by `request.ip`, rate-limit class, and route. Login abuse
tracks an additional per-IP failure key. Fastify `trustProxy` remains false;
client-controlled forwarded headers are not trusted.

PER-ACCOUNT

The login policy uses hashed account identifiers. Account-wide escalation can
require CAPTCHA but cannot permanently block an account.

PER-TENANT

Authenticated staff/customer requests receive a tenant quota keyed from the
server-established tenant context. No client-supplied tenant value is used.

STORE

`RateLimitStore` is an asynchronous `consume/get/reset` abstraction.
`InMemoryRateLimitStore` is available only for local development and tests.

DISTRIBUTED READINESS

Production validation requires `RATE_LIMIT_STORE=external`; application
startup also requires an injected shared store and otherwise fails closed.
No distributed provider is hardcoded.

TRUSTED PROXY

The established SEC-E configuration is preserved: Fastify does not trust
proxies, and the limiter reads `request.ip` rather than `X-Forwarded-For`.

429 BEHAVIOR

Quota exhaustion responds with HTTP 429, `Retry-After` when meaningful, and
the generic body `{ "error": "Too many requests", "code": "RATE_LIMITED" }`.
No bucket, account, or store details are returned.

CAPTCHA HANDOFF CONTRACT

Server-side abuse decisions are exactly: `allow`, `throttle`,
`captcha_required`, and `temporary_block`. SEC-C must consume this server
decision; it must not use a browser-only signal to bypass it.

P0

None identified in the SEC-B implementation.

P1

A distributed rate-limit provider and production injection path are required
before production startup is possible.

P2

The current Fastify application has no credential-accepting staff/customer
login or recovery route. When one is introduced, its provider must invoke the
documented `LoginAbuseProtector` contract.

P3

The local database/API-foundation integration suites use the shared fixed
Docker container name `travel-platform-postgres-local`. Concurrent Wave 2
worktrees (SEC-F ran in parallel) transiently collided on that name and on
first attempts `test:db` and the Fastify integration suite failed with a
Docker "container name already in use" conflict. Retried once contention
cleared and all suites passed; this is environmental cross-worktree
contention, not a SEC-B code defect. No `CustomerFormPage` failure reproduced
on a clean run (536/537 -> 537/537, consistent with a transient/contention
flake, not a real regression).

TESTS

- `services/api/tests/rate-limit.test.ts`: PASS, 10 tests (class routing,
  in-memory TTL expiry, cross-IP account escalation, pair-only temporary
  block avoiding account-lockout DoS, many-accounts-from-one-IP + success
  reset, request/tenant 429+Retry-After, runtime config parsing, cooldown
  re-login with no permanent lockout, enumeration-resistant decision shape).
- `services/api/tests/api-foundation.test.ts`: PASS, 22 tests, including new
  SEC-B adversarial cases (class-specific limit overriding the legacy global
  limiter, generic 429 body + Retry-After header, production startup refusing
  to run without an injected shared store, spoofed `X-Forwarded-For` failing
  to evade or smear the per-IP bucket).
- `services/api/tests/env.test.ts`: PASS, 14 tests, including the new
  production `RATE_LIMIT_STORE=external` requirement.
- `npm test --workspace @travel-platform/customer`: PASS, 537/537 tests.
- `npm run test:security`: PASS, 52 tests.
- `npm run test:db`: PASS, 8/8 tests (migrations, RLS enforcement, FORCE RLS,
  non-superuser role, privilege grants) after Docker contention cleared.

DATABASE/RLS

No database, schema, migration, or RLS change was made. Tenant quota keys use
only the established server-side tenant context. `npm run test:db` confirms
RLS/migration behavior is unchanged.

LINT

PASS (`npm run lint`, forced re-run of the API package to bypass a stale
cache). Existing customer warnings (react-refresh/react-hooks) remain
pre-existing warnings only, 0 errors.

TYPECHECK

PASS (`npm run typecheck`, all 5 workspace packages).

BUILD

PASS (`npm run build`, all 5 workspace packages). Customer build reports its
pre-existing large-chunk warning, unrelated to SEC-B.

MIGRATIONS

NONE. `npm run migrations:validate` passed with the 14 existing migration
files; SEC-B made no schema changes.

Also ran and confirmed PASS: `npm run secrets:scan` ("No obvious secrets
found") and `npm run security:check` (only the pre-existing ADR-accepted
deepmerge-ts advisory, unrelated to SEC-B).

HUMAN DECISIONS REQUIRED

HUMAN INFRASTRUCTURE DECISION REQUIRED: select the distributed rate-limit
store/provider, define its atomic consume/get/reset semantics, provision it,
and inject it into production startup. Until that decision is made, this
implementation deliberately fails closed: `NODE_ENV=production` without
`RATE_LIMIT_STORE=external` and an injected shared `RateLimitStore` throws at
startup rather than silently running an in-memory limiter across replicas.
The trusted reverse-proxy topology also remains an operations decision; do
not enable Fastify `trustProxy` without an approved proxy count or CIDR
policy -- SEC-B leaves the existing SEC-E `trustProxy: false` untouched.

FINAL VERDICT

COMPLETE (scope-bounded). All required implementation, tests, and quality
gates for SEC-B pass. Production distributed-store wiring is intentionally
left as a fail-closed placeholder pending the human infrastructure decision
above -- this is the designed stopping point per the spec's hard safety
rules, not an unfinished implementation.

DO NOT PUSH.
DO NOT OPEN PR.
DO NOT MERGE.
PARE.
