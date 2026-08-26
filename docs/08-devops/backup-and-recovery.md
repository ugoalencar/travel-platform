# Backup and Recovery

Status: staging readiness baseline.

This document defines the minimum database backup and recovery controls required
before a real agency pilot. It does not configure a cloud provider, secrets, or
production/staging infrastructure.

## Scope

- PostgreSQL application database.
- SQL migrations under `infrastructure/migrations/*.sql`.
- Tenant data protected by application authorization and PostgreSQL RLS.

## Minimum Backup Policy

- Staging: automated daily logical backup, retained for at least 7 days.
- Production: automated daily backup plus point-in-time recovery when supported
  by the selected database provider.
- Store backups outside the primary database host.
- Encrypt backups at rest.
- Restrict backup access to named operators only.
- Never commit backup files, dump files, credentials, or restore artifacts to
  the repository.

## Restore Drill

Before pilot:

1. Provision an empty disposable database.
2. Restore the latest backup into that database.
3. Apply no unreviewed migrations during restore validation.
4. Run `npm run test:db` against the disposable database mode supported by CI or
   a local replica.
5. Run a staging smoke test that covers health, readiness, tenant proof,
   Customer Portal, booking capacity, Sale/Receivable sync, Commercial Cockpit,
   Field Operations, and Pescador manual capture.
6. Record the restore date, operator, backup identifier, migration range, and
   outcome in the operational audit log or incident record system selected for
   the environment.

## Recovery Objectives

Initial pilot targets until a provider-specific decision supersedes this file:

- RPO: 24 hours.
- RTO: 4 hours.

These are pilot baselines, not production guarantees.

## Blockers For Production

- No provider-specific PITR configuration exists in this repository.
- No secret manager or backup vault is configured.
- No immutable operational audit/event store is configured for restore drills.

