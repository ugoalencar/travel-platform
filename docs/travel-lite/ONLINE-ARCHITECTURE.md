# Travel Lite — Online Architecture

Status: planned only. Do not deploy online without explicit approval.

## Target Shape

- Runtime: one API container serving the built Travel Lite frontend.
- Database: dedicated PostgreSQL database for Travel Lite.
- Network: HTTPS at the edge, API exposed only through the public app origin.
- Tenancy: the API must continue deriving tenant context server-side from the authenticated session; clients must not send trusted tenant IDs.
- Migrations: run from a controlled migration job using `MIGRATIONS_DATABASE_URL`.
- Seed: run only for the approved pilot tenant and only with an operator-provided initial password.
- Backups: automated daily database backup plus manual backup before every migration.

## Required Environment

- `DATABASE_URL`: runtime role URL for the dedicated Travel Lite database.
- `MIGRATIONS_DATABASE_URL`: admin/migration URL, available only to the migration job.
- `HOST=0.0.0.0`
- `PORT=4010`
- `FRONTEND_DIST_DIR=/app/apps/travel-lite/dist`
- `NODE_ENV=local` or an approved non-production value for the current migration scripts.

The current migration/seed scripts intentionally refuse `NODE_ENV=production` and non-local hostnames. Before a real online deploy, replace that local-only guard with an approved deployment-mode gate, documented as an ADR or deployment decision.

## Pre-Deploy Requirements

- Dedicated online database provisioned and isolated from the main Travel Platform database.
- TLS, domain, and reverse proxy configured.
- Secret storage selected; no secrets in repository, package, logs, or screenshots.
- Backup and restore tested against the online database class.
- Migration job dry-run validated against a disposable copy.
- Pilot acceptance sign-off recorded.
- Explicit approval granted for online deployment.

## Non-Goals For Current Package

- No cloud provisioning.
- No DNS or certificate automation.
- No production/staging deploy execution.
- No merge, push, or release publication.
