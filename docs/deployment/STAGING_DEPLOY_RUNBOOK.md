# Staging Deploy Runbook

**Status:** Artifacts prepared, nothing provisioned yet (2026-09-14).
**Owner of provisioning:** the user — this session has no Vercel team
connected and no Supabase/Node-host/Redis credentials. Everything below is
written so provisioning can happen in one pass once those exist.

Supersedes the "future architecture" framing in
`docs/deployment/VERCEL_SUPABASE_READINESS.md` with concrete steps. Ignore
`infrastructure/terraform/*` for this environment — it targets GCP and has
never been applied; it is not the chosen path (per explicit product
decision, not because it's broken).

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
2. **Environment variable**: `VITE_API_BASE_URL` = the Node host's HTTPS
   URL from Step 3 (e.g. `https://api-staging.<domain>`). This is the only
   env var these apps read (`import.meta.env.VITE_API_BASE_URL` in each
   app's `src/lib/*.ts`).
3. Attach a subdomain per app (agency./portal./admin./www.) with Vercel's
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
