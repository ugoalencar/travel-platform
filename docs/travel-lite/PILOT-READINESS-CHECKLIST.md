# Travel Lite — Pilot Readiness Checklist

## Product

- Customers can be created, edited, listed, and imported.
- Sellers and categories are available for sale creation.
- Sales can be drafted, costed, confirmed, and reflected in finance.
- Cost totals and margin are visible in sales, dashboard, and reports.
- Financial parties are manageable before sale costing.
- CSV and XLSX imports support dry-run, reconciliation, and confirm.
- Backup and restore scripts are available for local operation.

## Security

- Authentication required for protected routes.
- Tenant context is derived server-side.
- Imports require `imports.manage`.
- Financial parties require `suppliers.manage` for writes.
- Sale costs require sale-cost permissions.
- Local package uses a dedicated PostgreSQL database and runtime role.
- No seed password is hardcoded.

## Local Windows Package

- Docker Desktop is the only host runtime requirement.
- Install script creates `.env.travel-lite` with generated database passwords.
- API/frontend image is loaded from `images/travel-lite-api.tar`.
- Migrations and seed run inside the API container.
- Start, stop, backup, and restore scripts are present.

## Not Done Without Approval

- Online deploy.
- DNS/TLS setup.
- Registry push.
- Merge to main.
- Git push.
