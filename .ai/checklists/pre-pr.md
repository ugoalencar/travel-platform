# Pre-PR Checklist

Use this checklist before opening a PR.

Do not push or open a PR unless the user explicitly authorizes it.

## Required Checks

Run:

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run build
npm run secrets:scan
npm run migrations:validate
```

When a PowerShell wrapper is desired:

```powershell
.\pre-pr.ps1
```

## Required Review

- CI workflow uses only ephemeral PostgreSQL test credentials.
- No production or staging access is configured.
- No real `.env` files, secrets, private keys, dumps, or tokens.
- Tenant isolation and RLS tests pass.
- Fail-closed behavior without tenant context is preserved.
- No schema, migration, RLS, or domain change without explicit authorization.
- ADRs/DECs are updated only when the decision itself changes.

See `QUALITY-GATES.md` for the official quality policy.
