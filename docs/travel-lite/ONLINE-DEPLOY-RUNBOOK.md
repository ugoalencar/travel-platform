# Travel Lite — Online Deploy Runbook

Status: ready for review, not executed.

## Go/No-Go Gate

Online deployment may start only after explicit human approval for:

- target host/provider;
- production database;
- secrets and backup location;
- public URL/domain;
- pilot data policy.

## Deployment Steps

1. Create a database backup or snapshot.
2. Build the Travel Lite image from the reviewed commit.
3. Push the image to the approved private registry.
4. Run migrations with the approved migration role.
5. Start the API container with runtime-only database credentials.
6. Run health checks:
   - `GET /health`
   - login flow
   - dashboard load
   - customer list
   - sale draft creation
   - sale cost creation
   - sale confirmation
   - import dry-run
7. Verify audit log entries for login/import/sale/finance actions.
8. Confirm backups are still running after deploy.

## Rollback

1. Stop incoming traffic.
2. Restore the last known-good image.
3. If migrations were applied and data is inconsistent, restore the database snapshot according to the approved backup policy.
4. Re-run health checks.
5. Record the incident and the chosen recovery path.

## Stop Conditions

- Missing or unverified backup.
- Migration error.
- Tenant isolation failure.
- Login failure for the pilot master user.
- Unknown runtime secret.
- Any request to deploy without explicit approval.
