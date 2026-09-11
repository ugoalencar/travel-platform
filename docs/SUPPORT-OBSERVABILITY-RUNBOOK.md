# SUPPORT-OBS: Support & Observability Runbook

**Document Version:** 1.0
**Date:** 2026-09-11
**Status:** Local/Development Ready

---

## Overview

This runbook covers day-to-day support triage, log correlation, and audited
support-session usage for the Travel Platform. It complements
`docs/travel_platform_ops_security_pack/support/SUPPORT_CENTER.md`,
`docs/travel_platform_ops_security_pack/support/OBSERVABILITY.md`, and the
short spec runbooks under `docs/travel_platform_ops_security_pack/runbooks/`.

---

## 1. Structured logging & correlation IDs

Every request produces one `"request completed"` log line (see
`services/api/src/observability.ts`) with these fields:

| Field | Meaning |
|---|---|
| `requestId` | Per-request id. Echoed on the response as `X-Request-Id`. Defaults to Fastify's own `reqId`; an inbound `X-Request-Id` header (e.g. from a frontend that already minted one) is honored instead of being overwritten. |
| `correlationId` | Groups multiple requests belonging to one user action/bug report. Defaults to `requestId`; propagate an inbound `X-Correlation-Id` header end-to-end (browser -> API -> any downstream call) to keep one correlation id across a whole flow. |
| `tenantId` | The authenticated agency (`agencyId`), if any. |
| `userId` | The authenticated staff user, if any. |
| `route`, `method`, `status`, `duration` | Standard request shape. |
| `errorCode` | The same `code` field the client received in an error response body (set by `services/api/src/errors.ts`'s `setErrorHandler`), or `null` on success. |
| `deploymentId` | Identifies which deployment produced the log line. Reads `DEPLOYMENT_ID` (falls back to `RENDER_GIT_COMMIT` / `VERCEL_GIT_COMMIT_SHA`, then `'local'`). Set `DEPLOYMENT_ID` in each environment's deploy step to the release SHA. |

**Never logged:** password, token, full documents, full passport/CPF, bank
data. `observability.ts` only ever reads request metadata (method, url,
status, headers used for correlation) -- it never receives request/response
bodies, so it cannot leak those fields by construction. A repo-wide audit of
`.info(` / `.error(` / `.warn(` call sites (2026-09-11) found no call passing
a raw customer/document/payment object; the only structured log calls in
`services/api/src` are the ones in `observability.ts`, `errors.ts`,
`app.ts` (readiness-check failure, logs only an error name) and
`server.ts` (startup/shutdown lifecycle, logs no request data).

**How a support agent correlates a bug report to server logs:**
1. Get the `X-Request-Id` (or `X-Correlation-Id`) the frontend attached to
   the failing request -- surface it in the frontend's error toast/support
   widget so a user can paste it into a ticket. If the ticket was opened via
   `POST /support/tickets` (see below), its `requestId`/`correlationId`
   columns already have it.
2. Search the API's log aggregator for that `requestId` (or, to see every
   request in the same user flow, that `correlationId`).
3. Cross-reference `deploymentId` on those lines against the release
   history to confirm which deploy produced the behavior.

## 2. Ticket capture (`POST /support/tickets`)

Agency staff can open a ticket directly from the product
(`services/api/src/app.ts`, route registered next to `/tenant-proof`).
Server-derived fields (never trusted from the request body):
`agencyId`, `userId` (from the authenticated tenant context),
`requestId`/`correlationId` (from this request's own correlation IDs).
Client-reported fields (diagnostic only, never used for authorization or
tenant resolution): `route`, `appVersion`, `buildSha`, `browser`.

Platform admins see all tickets (agency-originated and platform-originated)
at `GET /platform/support`, and can triage with `PATCH /platform/support/:id`
(status/priority/assignment). `support_cases.source` distinguishes
`'AGENCY'` (opened by staff via `/support/tickets`) from `'PLATFORM'`
(opened by a platform admin directly).

**Triage steps** (mirrors
`docs/travel_platform_ops_security_pack/runbooks/SUPPORT.md`):
1. Identify agency/user/app version from the ticket's captured context.
2. Get the ticket's `requestId`/`correlationId` and pull matching server logs.
3. Check `GET /metrics` and recent deploys for a platform-wide incident
   (if so, follow `docs/travel_platform_ops_security_pack/runbooks/INCIDENT.md`
   instead of treating it as an isolated ticket).
4. Reproduce in a safe environment -- never against production tenant data
   directly.
5. If the ticket requires looking at the tenant's actual data, open an
   audited Support Session (below) rather than any direct DB/tenant access.
6. Record the resolution on the ticket (`PATCH /platform/support/:id`).
7. Update the knowledge base for recurring issues.

## 3. Support Session (audited "view as tenant")

Spec requirement: **no invisible impersonation**. A platform admin can open
a temporary, explicitly-scoped session against one tenant, which is always
audited in `support_access_log`.

- `POST /platform/support-sessions` -- body: `{ tenantId, reason, durationMinutes?, readOnly? }`.
  `supportUserId` comes from the authenticated platform principal
  (`request.platformAuth.sub`), never from the body. `reason` is required
  (rejected if blank). `durationMinutes` defaults to 30, capped at 240.
  `readOnly` defaults to `true`.
- `GET /platform/support-sessions` -- lists sessions (open and closed) for
  audit review.
- `PATCH /platform/support-sessions/:id/end` -- closes a session
  (`access_end = now()`); 404 if already closed or not found.

Every open/close is a durable row in `support_access_log`
(`infrastructure/migrations/034_platform_audit_logs.sql`,
extended by `048_support_ticket_capture_context.sql` with
`requested_duration_minutes`, `expires_at`, `read_only`). See
`services/api/tests/support-center.test.ts` for the regression test proving
the audit row is written on open and closed on end.

**Scope of what this wave built vs. what is still a gap:** opening a
session only creates/closes the audit-trail row -- it does not yet mint any
actual elevated read access to the tenant's data. Before this wave, there
was no impersonation/view-as-tenant code path in the repo at all (verified
by a repo-wide search), so there is nothing to "make invisible" today.
Wiring a real, enforced read-only session (a scoped tenant context a
platform user can assume, gated by an active, non-expired
`support_access_log` row) touches the auth/tenant boundary and is flagged
for human approval rather than built here -- see the note in
`services/api/src/platform-services.ts` above `StartSupportSessionInput`.

## 4. Metrics (`GET /metrics`)

Lightweight in-process counters (`services/api/src/observability.ts`,
`MetricsCollector`) -- no external dependency, per the dispatch brief.
Returns:

```json
{
  "requestsTotal": 1234,
  "statusClassCounts": { "2xx": 1200, "3xx": 0, "4xx": 30, "5xx": 4 },
  "latencyMs": { "p50": 8, "p95": 42, "p99": 110, "max": 300 },
  "routeCounts": { "/support/tickets": 12, "...": 1 },
  "windowSize": 1234,
  "dbPool": { "total": 20, "idle": 18, "waiting": 0 }
}
```

`latencyMs` percentiles are computed over the last 2000 requests (a
capped in-memory ring buffer, so long-running processes don't grow
unbounded). `dbPool` is `null` unless the server wires `dbPoolStats` (real
`server.ts` does, from the `pg.Pool` instance); test/inject-only app
instances report `null` rather than guessing.

Unauthenticated by design (mirrors `/health`): it exposes only aggregate
counters, never request/response bodies or identifiers, so it can be
scraped the same way `/health` is.

## 5. Local verification

```
docker compose -f infrastructure/docker-compose.local-postgres.yml up -d
# apply migrations 001..048 in order against travel_platform_test on
# 127.0.0.1:55432 (travel_test / travel_test_password) -- see
# services/api/tests/customers.test.ts for the pg-pool + migration-apply
# pattern used by DB-backed tests.
cd services/api
npx vitest run tests/observability.test.ts tests/support-center.test.ts
```
