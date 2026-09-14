# Staging Deploy Runbook

**Status:** Local dry run passed (2026-09-14) — real HTTPS, real Postgres
with RLS enforced, real Redis, true `NODE_ENV=production` gates, all
running against the actual Dockerfile the real host will use. Nothing on
Vercel/Supabase/a real Node host is provisioned yet.
**Owner of provisioning:** the user — this session has no Vercel team
connected and no Supabase/Node-host/Redis credentials. Everything below is
written so provisioning can happen in one pass once those exist.

Supersedes the "future architecture" framing in
`docs/deployment/VERCEL_SUPABASE_READINESS.md` with concrete steps. Ignore
`infrastructure/terraform/*` for this environment — it targets GCP and has
never been applied; it is not the chosen path (per explicit product
decision, not because it's broken).

## Local dry run (do this before touching Vercel/Supabase)

`infrastructure/docker-compose.local-staging.yml` reproduces the real
target shape entirely on this machine, so every mistake below was caught
*before* burning a real deploy cycle:

```
cd infrastructure
docker compose -f docker-compose.local-staging.yml -p travel-platform-local-staging up -d postgres-staging redis-staging
# wait for both healthy, then apply all 62 migrations + tests/integration/database/002_prepare_local_roles.sql
# against postgres-staging (127.0.0.1:55433, db travel_platform_staging, admin user travel_staging_admin)
# -- see git history for the one-off seed script used during this dry run (not committed; write your own
# or adapt scripts/bootstrap-local-db.cjs's shape).

# Build the 4 apps with NO VITE_API_BASE_URL set -- Caddy proxies each
# app's own /api, /customer-api, /customer-auth, /platform-auth, /public
# paths to the API container per-origin (Caddyfile.local-staging), exactly
# mirroring each app's own vite.config.ts dev-proxy path conventions. This
# is deliberate: it's what caught the /api-prefix mismatch bug below.
(cd ../apps/agency && npx vite build)
(cd ../apps/customer && npx vite build)
(cd ../apps/platform-admin && npx vite build)
(cd ../apps/marketing && npx vite build)

docker compose -f docker-compose.local-staging.yml -p travel-platform-local-staging build api-staging
docker compose -f docker-compose.local-staging.yml -p travel-platform-local-staging up -d api-staging caddy-staging
```

Then open `https://agency.localhost`, `https://portal.localhost`,
`https://admin.localhost`, `https://www.localhost` (all resolve to
loopback automatically, RFC 6761, no `/etc/hosts` edit needed). The
browser will warn about the certificate (Caddy's local/internal CA, not a
publicly trusted one) — that's expected for a local dry run only.

**Three real bugs this dry run caught, all fixed in this pass, none of
which any earlier local-dev-server testing had exposed:**

1. **`server.ts` crashed on every production boot with
   `RATE_LIMIT_STORE=external`.** The module-level `buildApp()` call ran
   synchronously before the async Redis store existed, and
   `createRateLimitHooks` fails closed (by design) rather than silently
   using the single-instance in-memory store in production. Fixed by
   deferring that first `buildApp()` call until after the Redis store is
   ready when an external store is required.
2. **`createStaffAccessValidator` and `createCustomerAccessValidator`
   (dev-auth.ts / customer-portal.ts) silently 403'd every real
   session.** Both ran a bare `pool.query()` against a table whose RLS
   `SELECT` policy requires `agency_id = current_agency_id()` — a
   per-transaction Postgres setting a bare query never sets. Earlier local
   testing missed this because a reused pooled connection happened to
   still carry tenant context from the immediately preceding request.
   Fixed by explicitly calling `set_tenant_context()` inside a short
   read-only transaction before each check.
3. **Every built frontend app calls its API relative to its own origin
   with app-specific path prefixes** (`/api/*` for agency and
   platform-admin, `/api/*` + `/customer-api/*` + `/customer-auth/*` for
   customer, `/public/*` for marketing) that only existed as *dev-proxy*
   rewrites (`vite.config.ts`), never as a real routing layer. A naive
   Vercel deploy pointing `VITE_API_BASE_URL` straight at the API host
   would 404 on every `/api/*` call, since the backend registers those
   routes with no `/api` prefix at all. `Caddyfile.local-staging` proxies
   each origin's paths to the API with the same prefix-stripping the dev
   proxy does — the real Vercel deploy needs the equivalent (Vercel
   `rewrites` in each app's `vercel.json`, or fix the frontend calls to
   drop the prefix — not yet decided, see Step 4 below). Also surfaced
   `apps/marketing`'s `fetch('/public/leads')` calls, which had no
   `/api` prefix and no proxy entry at all even in local `vite dev` — a
   pre-existing app-level bug, not something this pass fixes.

## Topology

```
Vercel (4 static SPA deployments, one project each)
  agency.<domain>        -> apps/agency
  portal.<domain>        -> apps/customer   (customer-portal/* routes)
  admin.<domain>         -> apps/platform-admin
  www.<domain>           -> apps/marketing

Node host (Render/Railway/Fly — pick one, Dockerfile already builds)
  api.<domain>            -> services/api (Fastify), Dockerfile at repo root

Supabase project
  Postgres 15 (62 migrations in infrastructure/migrations/, run in order)
  Storage (not yet wired to a StorageProvider adapter — see Known Gaps)

Upstash (or any TLS-capable managed Redis)
  Backs RATE_LIMIT_STORE=external
```

## Step 1 — Supabase project

1. Create a new Supabase project (staging-specific, separate from any
   future production project).
2. In the SQL editor, run every file in `infrastructure/migrations/`
   **in numeric order** (001 through 062 as of this writing) — there is no
   migration runner script in this repo; each file is meant to be applied
   directly and is additive-only.
3. Create a dedicated, non-superuser runtime role — Supabase's default
   `postgres` role is a superuser and `assertSafeDatabaseRole()`
   (`services/api/src/env.ts`) refuses to start the API against a superuser
   or BYPASSRLS connection, since that silently defeats every RLS policy.
   Mirror the grants in `tests/integration/database/002_prepare_local_roles.sql`
   against this new role (same GRANT statements, same table list) — that
   file is the authoritative list of exactly what the runtime role needs.
4. Get the connection string for that new role, not the default `postgres`
   user. Use Supabase's pooled connection string (port 6543, pgbouncer) for
   `DATABASE_URL` if the Node host's connection count is a concern; the
   direct connection (port 5432) also works.

## Step 2 — Redis

1. Create an Upstash Redis database (TLS endpoint, `rediss://`).
2. Copy the connection URL into `REDIS_URL`.

## Step 3 — Node host for the API

1. Pick a host that deploys from a Dockerfile (Render, Railway, Fly.io all
   qualify) — the repo-root `Dockerfile` already builds `packages/domain` +
   `services/api` and is not GCP-specific.
2. Point the service at this repo, Dockerfile at the repo root (not inside
   `services/api/`).
3. Set environment variables per `.env.staging.example` (repo root) — that
   file lists only the variables `services/api` actually reads today,
   verified against `env.ts`/`dev-auth.ts`/`rate-limit.ts`. Do NOT use
   `.env.production.example`'s JWT_SECRET/COOKIE_* list for this — those
   predate the real Bearer-session-token auth work this pack implemented
   and nothing in `services/api` reads them.
   **Set `NODE_ENV=production` on the host, overriding the Dockerfile's own
   `ENV NODE_ENV=staging` default** — every fail-closed safety check in this
   codebase (DATABASE_URL required, ALLOW_DEV_AUTH blocked,
   RATE_LIMIT_STORE=external required, CORS_ALLOWED_ORIGINS required,
   superuser/BYPASSRLS DB-role check) is gated on the literal string
   `NODE_ENV === 'production'`, with no separate "staging" gate level —
   see `.env.staging.example`'s own comment on this for the full list of
   affected checks.
4. Confirm the host exposes the container's `PORT` over HTTPS (most do this
   automatically via a reverse proxy/load balancer in front of the
   container — verify HTTPS is actually terminated before calling this
   step done).
5. Health checks: `GET /health` (liveness), `GET /readiness` (checks the DB
   pool), `GET /version`, `GET /metrics` — all already implemented
   (`services/api/src/routes/infrastructure.ts`), wire the host's health
   check to `/readiness`.

## Step 4 — Vercel (4 projects)

Each of `apps/agency`, `apps/customer`, `apps/platform-admin`,
`apps/marketing` now has a `vercel.json` (added by this pass) with:
- `buildCommand`: `cd ../.. && npm install && npm run build --workspace=apps/<name>`
  (runs the workspace install from the repo root, since these are npm
  workspaces — a plain per-app `npm install` would not resolve
  `@travel-platform/*` internal deps)
- `outputDirectory`: `dist`
- SPA rewrite: everything falls back to `/index.html` (client-side routing)

For each app, when creating the Vercel project:
1. **Root Directory**: set to `apps/agency` (or customer/platform-admin/
   marketing respectively) — this is what makes `cd ../..` in
   `buildCommand` land at the repo root.
2. **`/api`-prefix problem (found by the local dry run above, NOT yet
   resolved here)**: setting `VITE_API_BASE_URL` to the Node host's URL and
   calling it a day will 404 every request — the frontend code calls
   `${VITE_API_BASE_URL}/api/...`, but the backend registers routes with
   no `/api` prefix (that stripping only happens in each app's local
   `vite.config.ts` dev proxy). Two real options, neither implemented yet:
   - **(a) Vercel rewrites** — add a `rewrites` entry to each app's
     `vercel.json` proxying `/api/(.*)` (and, for `apps/customer`,
     `/customer-api/(.*)`, `/customer-auth/(.*)`; for `apps/platform-admin`,
     `/platform-auth/(.*)`; for `apps/marketing`, `/public/(.*)`) to the
     Node host with the prefix stripped, then leave `VITE_API_BASE_URL`
     unset so calls stay relative to the Vercel origin (same-origin from
     the browser's perspective — also sidesteps CORS entirely for those
     apps, though `CORS_ALLOWED_ORIGINS` from Step 5 is still required for
     `services/api` to accept the request when it does cross an origin,
     e.g. during local dev). This is what `Caddyfile.local-staging` already
     does and is the closest like-for-like port of what was just verified
     working.
   - **(b) Fix the frontend call sites** to not assume a stripped prefix
     (bigger, touches every `src/lib/*.ts` API client across all 4 apps).
   Pick one before the first real Vercel deploy — do not assume (a) is
   already wired just because the Caddy file demonstrates the shape.
3. **Environment variable**: `VITE_API_BASE_URL` — only needed if going
   with option (b) above, or if NOT using Vercel rewrites; leave unset if
   using (a). This is the only env var these apps read
   (`import.meta.env.VITE_API_BASE_URL` in each app's `src/lib/*.ts`).
4. Attach a subdomain per app (agency./portal./admin./www.) with Vercel's
   automatic HTTPS.

## Step 5 — CORS

Already implemented (`services/api/src/app.ts` + `security-config.ts`):
`CORS_ALLOWED_ORIGINS` is a required, comma-separated, HTTPS-only, non-
wildcard origin list in production — the server refuses to start without
it. Set it to the 4 Vercel domains from Step 4, e.g.:

```
CORS_ALLOWED_ORIGINS=https://agency.<domain>,https://portal.<domain>,https://admin.<domain>,https://www.<domain>
```

Note `credentials: false` on the CORS policy — consistent with the Bearer-
token-in-header session model (never cookies), no `Access-Control-Allow-
Credentials` is needed.

## Step 6 — Verify against the staging acceptance criteria

Once the above is live, walk the criteria list from
`docs/staging-uat-golive/STAGING_STATUS.md`: HTTPS, API ONLINE, POSTGRES
ONLINE, MIGRATIONS PASS, RLS PASS, CROSS-TENANT PASS, EMAIL PASS, MFA PASS,
BACKUP PASS, RESTORE PASS, LOGS PASS, METRICS PASS, HEALTH PASS, READINESS
PASS, VERSION PASS.

## Known gaps this runbook does not close

- **Email**: no SMTP/transactional-email provider is wired anywhere in
  `services/api`. Password-reset tokens are generated and stored but never
  sent (see the "no email provider wired yet" comments in
  `local-auth.ts`/`customer-local-auth.ts`). "EMAIL PASS" cannot be
  achieved until this is built.
- **MFA secret storage**: `mfa_totp_secrets.secret_encrypted` is stored and
  read as plaintext (confirmed — no encryption call anywhere in the code
  despite the column name). Encrypting it at rest before relying on
  "MFA PASS" for anything beyond functional correctness is unbuilt scope.
- **Document/object storage**: Supabase Storage is not wired to any
  `StorageProvider` adapter — `docs/deployment/VERCEL_SUPABASE_READINESS.md`
  describes this as a future `SupabaseStorageAdapter`, not yet built.
- **Backups/restore**: Supabase's own automated backups exist at the
  platform level for paid tiers, but no restore drill has been run against
  this schema — "RESTORE PASS" needs an actual rehearsal, not just
  assuming the platform feature works.
