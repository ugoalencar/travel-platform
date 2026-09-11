# SEC-E: TLS / Security Headers / CORS Runbook

**Document Version:** 1.0
**Date:** 2026-09-11
**Status:** App-layer controls audited and confirmed; TLS termination deferred to infra (not yet configured)

---

## Overview

This runbook documents what the Travel Platform API (`services/api`) enforces
itself at the application layer for transport security, HTTP security
headers, and CORS, versus what is expected to be provided by the
deploy/infra layer (reverse proxy, load balancer, certificate manager) once
a real staging/production environment exists. Per `docs/08-devops/environments.md`,
no staging/production infrastructure is configured in this repository yet —
this document describes the contract the app already satisfies, so that
whoever configures that infra later knows exactly what is and is not
already handled in code.

This is an audit + targeted-fix report, not a rebuild: CORS, Helmet security
headers, and the CORS/security env-config module already existed
(`services/api/src/security-config.ts`, `services/api/src/app.ts`) before
this pass. Nothing structural in Auth/Tenant/RLS/RBAC was touched.

---

## 1. TLS Termination — Deferred to Infrastructure (by design)

**Decision:** This API does not terminate TLS itself and does not implement
an HTTP→HTTPS redirect at the application layer.

**Rationale:** `services/api` is a plain Fastify HTTP server (see
`services/api/src/server.ts`) with no TLS certificate loading, no HTTPS
listener, and no reverse-proxy config anywhere in this repository. In a
typical containerized deployment (the shape this repo is heading toward),
TLS termination and HTTP→HTTPS redirection belong to whatever sits in front
of the container — a load balancer, an ingress controller, or a reverse
proxy (nginx, Caddy, a cloud provider's HTTPS load balancer, etc.) — not the
application process. Implementing an app-level redirect here would either
be redundant (the proxy already redirects) or actively wrong (the proxy
terminates TLS and forwards plain HTTP internally, in which case the app
would incorrectly redirect its own already-secure traffic).

**What must exist when a real environment is stood up (human decision,
flagged, not implemented here):**
- A reverse proxy / load balancer / ingress that terminates TLS 1.2+
  (prefer TLS 1.3) in front of this service.
- Automatic certificate issuance and renewal (e.g. ACME/Let's Encrypt, or a
  cloud provider's managed certificate).
- HTTP→HTTPS redirect configured at that proxy/LB layer.
- `trustProxy` in `services/api/src/app.ts` (`Fastify({ trustProxy: ... })`)
  currently left at its default (`false`) because the real proxy topology
  (which proxy, how many hops, what CIDR) is not discoverable from this
  repo. Whoever configures the proxy must also set `trustProxy` correctly
  at that point — a blanket `true` would allow client-IP spoofing of
  `X-Forwarded-For`, which matters to rate limiting and audit logging in
  other streams.

**What the app already does correctly regardless of where TLS terminates:**
- HSTS is emitted by `@fastify/helmet` only when `corsPolicy.isProduction`
  is true (`services/api/src/app.ts`, helmet registration) — i.e. it never
  fires for local HTTP dev, and only makes sense once the proxy in front of
  a production deploy is actually terminating TLS.

---

## 2. CORS — Audited, Correct

Source: `services/api/src/security-config.ts` (`resolveCorsPolicy`,
`isOriginAllowed`), wired in `services/api/src/app.ts` via `@fastify/cors`.

Confirmed:
- Origins come from `CORS_ALLOWED_ORIGINS` (comma-separated env var), never
  hardcoded.
- In production (`NODE_ENV=production`), an unset/empty
  `CORS_ALLOWED_ORIGINS`, a literal `*`, an invalid origin string, or a
  non-HTTPS origin (other than localhost) all throw `SecurityConfigError`
  at startup — fail-loud, not fail-open.
- The `@fastify/cors` `origin` callback never reflects an arbitrary
  `Origin` header back; it only returns `true` via `isOriginAllowed()`
  matching the resolved allow-list (or, outside production only, the
  `localhost:<any-port>` dev pattern).
- `credentials: false` is explicitly set. This API is bearer/header-token
  shaped (staff auth via `x-dev-*` headers today, a production
  `AuthProvider` would plausibly carry `Authorization: Bearer`), not
  cookie/session shaped — see the credential-transport finding at the top
  of `security-config.ts`. There is no cookie for a browser to attach
  automatically, so wildcard-origin + credentials (the dangerous
  combination browsers themselves block) is not a live risk here, and
  `credentials: true` was not turned on.
- Tests exist and pass: `services/api/tests/security-headers.test.ts`
  (`describe('SEC-E CORS policy', ...)`) — proves an allow-listed origin is
  accepted (`access-control-allow-origin` echoed back) and a
  non-allow-listed origin is rejected, plus `resolveCorsPolicy` unit tests
  covering the production fail-loud paths (`*`, unset, non-HTTPS,
  multi-origin parsing, dev fallback).

No gaps found. No changes made — an existing, correct implementation.

---

## 3. Security Headers — Audited; One Gap Closed

Source: `@fastify/helmet` registration in `services/api/src/app.ts`.

| Control | Status | Where |
|---|---|---|
| Content-Security-Policy | Present, restrictive (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, etc.) | helmet `contentSecurityPolicy` |
| X-Content-Type-Options | Present (Helmet default: `nosniff`) | helmet default |
| Referrer-Policy | Present (`no-referrer`) | helmet `referrerPolicy` |
| X-Frame-Options | Present (`DENY`, legacy backstop for CSP `frame-ancestors`) | helmet `frameguard` |
| HSTS | Present, production-only | helmet `hsts`, gated on `corsPolicy.isProduction` |
| **Permissions-Policy** | **Gap found and fixed** | see below |
| Cache-Control on sensitive routes | Not app-wide; see note below | — |

**Gap fixed:** the installed `@fastify/helmet` version does not support a
`Permissions-Policy` directive (documented in the pre-existing code comment
at the helmet registration). This is closed with an explicit
`onSend` hook in `services/api/src/app.ts` that sets:

```
Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=(), usb=(), fullscreen=()
```

on every response. This is a pure JSON API with no legitimate use for any
browser feature in that list, so all are disabled outright rather than
selectively allowed. Verified via `services/api/tests/security-headers.test.ts`,
which asserts the header is present with this value on a representative
response.

**Cache-Control on sensitive routes:** not applied as a blanket policy.
This API returns JSON (not HTML/static assets) and Fastify does not cache
responses by default; there is no existing CDN/reverse-proxy layer in this
repo that would cache API responses either. Flagged as a follow-up for
whichever stream owns individual route handlers if a specific
highly-sensitive route (e.g. one returning tokens or PII in bulk) is
identified as needing an explicit `Cache-Control: no-store` — no such route
was identified as a gap during this audit, and adding a blanket header here
would be guessing at a requirement the code doesn't currently have.

---

## 4. Cookies / CSRF — Confirmed Not Applicable

Grep of `services/api/src` for `setCookie`, `reply.cookie`,
`request.cookies`, and `@fastify/cookie` usage returns zero matches. Staff
and customer-portal auth both authenticate via custom request headers
(`x-dev-user-id`/`x-dev-agency-id`/`x-dev-role`/`x-dev-customer` in the
current dev-only providers), not cookies, and the frontend
(`apps/customer/src/lib/api.ts`) calls `fetch()` without
`credentials: 'include'`.

**Verdict:** classical CSRF (which relies on browsers auto-attaching
ambient cookie credentials) does not apply to this API's current
architecture — PASS/NA justificado, per `XSS_CSRF_IDOR.md`'s allowance for
a justified not-applicable verdict. This is not a gap; no cookie handling
was added. If a production `AuthProvider` is later built on
`Authorization: Bearer` (the plausible path noted in
`security-config.ts`), this verdict continues to hold. If a future change
introduces cookie-based session auth, this verdict must be re-evaluated at
that time — flagged here so it isn't forgotten.

---

## 5. Environment Separation / Dev-Auth Gate — Audited, Intact

Source: `services/api/src/dev-auth.ts` (`isDevAuthEnabled`) and
`services/api/src/env.ts` (`validateProductionEnvironment`).

Two independent gates confirmed, both enforced in code (not just
convention):
1. `dev-auth.ts`: `isDevAuthEnabled()` returns `environment.ALLOW_DEV_AUTH
   === devAuthFlag && environment.NODE_ENV !== 'production'` — dev auth is
   structurally impossible to enable when `NODE_ENV === 'production'`,
   regardless of what `ALLOW_DEV_AUTH` is set to.
2. `env.ts`: `validateProductionEnvironment()` additionally throws at
   production startup if `ALLOW_DEV_AUTH === 'true'` is present at all,
   treating it as a misconfigured deploy (e.g. a staging `.env` template
   copied forward without cleanup) worth failing loudly on rather than
   silently ignoring.

No structural changes made to this dual-gate, per the mission's explicit
instruction not to touch Auth structurally. Nothing broken was found —
reporting confirmation only.

---

## 6. Summary — App Layer vs. Infra Layer

**Enforced in code today (this repo, `services/api`):**
- CORS allow-list, env-sourced, fail-loud in production.
- Helmet security headers (CSP, X-Content-Type-Options, Referrer-Policy,
  X-Frame-Options, HSTS gated on production).
- Permissions-Policy header (added this pass, via `onSend` hook).
- Explicit request body size limit.
- Dual-gated dev-auth (impossible in production).
- No cookie-based session/CSRF surface to defend (bearer/header-token
  architecture).

**Expected from the deploy/infra layer (not yet configured in this repo —
human decision required before a real staging/production environment
exists, per `docs/08-devops/environments.md`):**
- TLS termination (1.2+, prefer 1.3) at a reverse proxy / load balancer /
  ingress in front of this service.
- Automatic certificate issuance and renewal.
- HTTP→HTTPS redirect at that same proxy/LB layer.
- `trustProxy` configuration in `services/api/src/app.ts` matched to the
  real proxy topology once one exists.
- Secret management for `CORS_ALLOWED_ORIGINS` and any other production
  secrets (out of scope for this stream; `docs/08-devops/environments.md`
  already flags secret management as a future-decision item).

---

## References

- `docs/travel_platform_ops_security_pack/infra/HTTPS_TLS.md`
- `docs/travel_platform_ops_security_pack/infra/ENVIRONMENTS.md`
- `docs/travel_platform_ops_security_pack/security/SECURITY_HEADERS_CORS.md`
- `docs/08-devops/environments.md`
- `services/api/src/security-config.ts`
- `services/api/src/app.ts`
- `services/api/src/dev-auth.ts`
- `services/api/src/env.ts`
- `services/api/tests/security-headers.test.ts`
