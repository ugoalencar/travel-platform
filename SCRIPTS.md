# Scripts

This document explains the existing project scripts. It is not the source of
mandatory gates; use `QUALITY-GATES.md` for gate policy.

## npm Scripts

Run from the repository root.

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run test:coverage
npm run build
npm run format
npm run format:check
npm run security:check
npm run secrets:scan
npm run migrations:validate
```

## PowerShell Scripts

### `pre-commit.ps1`

Local helper for pre-commit checks.

```powershell
.\pre-commit.ps1
.\pre-commit.ps1 -Fix
.\pre-commit.ps1 -Verbose
```

### `pre-pr.ps1`

Local helper for pre-PR checks.

```powershell
.\pre-pr.ps1
.\pre-pr.ps1 -Verbose
```

### `scripts/reset-local-postgres.ps1`

Resets only the approved disposable local PostgreSQL environment.

```powershell
.\scripts\reset-local-postgres.ps1
```

Do not use this against production, staging, shared databases, or real data.

### Travel Lite scripts

Local stack for the Travel Lite edition (its own PostgreSQL + API serving the
built frontend at `http://127.0.0.1:4010`). Optional configuration lives in
`.env.travel-lite` (gitignored; see `.env.travel-lite.example`).

```powershell
.\scripts\travel-lite-start.ps1              # postgres + migrations + api
.\scripts\travel-lite-start.ps1 -Seed        # also runs the Gadotti seed
.\scripts\travel-lite-stop.ps1               # stop containers
.\scripts\travel-lite-stop.ps1 -Purge        # stop and delete local DB volume
.\scripts\travel-lite-backup.ps1             # pg_dump to backups/ (gitignored)
.\scripts\travel-lite-restore.ps1 -Archive backups\travel-lite-<ts>.sql.gz
```

- Migrations run only through `scripts/travel-lite-migrate.cjs` (never at API
  boot) against `infrastructure/migrations-travel-lite/`.
- The seed requires `TRAVEL_LITE_SEED_PASSWORD` in `.env.travel-lite`; no
  password is committed to the repository.
- `travel-lite-restore.ps1` is destructive (drops the local `public` schema)
  and requires an explicit confirmation prompt.

#### Online migrations (Render or any other remote host)

`travel-lite-migrate.cjs` above refuses `NODE_ENV=production` and any
non-local database host on purpose — that guard never changes. Online
deploys use a **separate** script instead, so there is no single switch that
unlocks both local and remote runs:

```powershell
$env:MIGRATIONS_DATABASE_URL = "postgresql://...@<render-host>/travel_lite"
$env:TRAVEL_LITE_ONLINE_MIGRATION_CONFIRM_HOST = "<render-host>"   # must match the host above, exactly
node scripts/travel-lite-migrate-online.cjs
```

- Both variables above are required; the script exits 1 (without touching
  the network) if either is missing, if the host looks local, or if the two
  hosts do not match exactly. The matching requirement exists so a
  copy-pasted/stale connection string from another project or environment
  gets caught before it runs, not after.
- `TRAVEL_LITE_ONLINE_MIGRATION_DRY_RUN=true` lists pending migrations and
  exits without applying anything.
- Uses the same idempotent `migrations` control table as the local script;
  re-running it is always safe.
- See `.env.travel-lite.production.example` for the full list of production
  environment variables (Render or otherwise).

## Node Helper Scripts

- `scripts/check-secrets.cjs` - scans for obvious hardcoded secrets.
- `scripts/validate-migrations.cjs` - validates migration file conventions.

## Database Tests

Use:

```powershell
npm run test:db
```

This suite starts PostgreSQL locally through Docker Compose by default. In CI,
it uses the GitHub Actions PostgreSQL service container. See
`docs/07-testing/database-integration-tests.md`.

## Safety Rules

- Do not run scripts against production or staging unless explicitly authorized.
- Do not expose secrets in logs.
- Do not run migrations unless the task explicitly authorizes them.
- Do not use `npm audit fix --force` without explicit authorization.
- Do not use `git push --force` without explicit authorization.
