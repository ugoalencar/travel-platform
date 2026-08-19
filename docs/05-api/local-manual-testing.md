# Local Manual API Testing

Use this flow only for local disposable testing of the Fastify API foundation.

1. Prepare the local disposable PostgreSQL database:

```powershell
npm run dev:db --workspace @travel-platform/api
```

2. Start the API with explicit local dev auth enabled:

```powershell
$env:NODE_ENV = "development"
$env:ALLOW_DEV_AUTH = "true"
npm run dev --workspace @travel-platform/api
```

`npm run dev` uses the local disposable database connection prepared by `dev:db` when `DATABASE_URL` is not provided.

The dev auth headers must match one of the synthetic principals authorized for the local environment. Arbitrary `userId` and `agencyId` combinations are rejected.

3. Check the public health endpoint:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
```

4. Check a synthetic local principal:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/me -Headers @{
  "x-dev-user-id" = "11000000-0000-4000-8000-000000000001"
  "x-dev-agency-id" = "10000000-0000-4000-8000-000000000001"
  "x-dev-role" = "ADMIN"
}
```

5. Check tenant-scoped RLS proof:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/tenant-proof -Headers @{
  "x-dev-user-id" = "11000000-0000-4000-8000-000000000001"
  "x-dev-agency-id" = "10000000-0000-4000-8000-000000000001"
  "x-dev-role" = "ADMIN"
}
```

Dev auth is ignored when `ALLOW_DEV_AUTH` is not exactly `true`, and is always disabled when `NODE_ENV=production`.
