# ARCH-CUSTOMER-APP-01 — apps/customer contains two conceptually distinct products

## FACT

`apps/customer` currently contains the historical staff/admin app (Customers,
Wishes, Trips, Offers, Proposals, Sales, Transport, Bookings, Field
Operations admin views, `Sidebar.tsx`) AND now also the new `customer-portal`
route tree (`/customer-portal/*`) built for end-customer self-service, added
in the `feature/customer-app` branch. Both live in the same Vite app, same
build, same deployment, same port, differentiated only by route path and by
which layout component (`AppShell`/`Sidebar` vs `CustomerPortalShell`/
`CustomerNav`) wraps each route subtree.

## RECOMMENDATION

Separate deployments later into three conceptually independent apps:

- `apps/agency` — staff/admin (current `apps/customer` content minus
  customer-portal and Field Operations views)
- `apps/customer` — end-customer self-service portal only
  (`/customer-portal/*` content, renamed to its own app root)
- `apps/operations` — Field Operations (driver/guide), currently living
  at `/app`, `/app/operations/*` inside the same app

Do NOT execute this split now. This is a structural/deployment decision,
not a code-correctness issue — the current single-app arrangement works and
is fully self-scoped/secure; the split is about deployment hygiene,
independent release cadence, and reducing bundle size / permission
confusion for each audience.

## IMPACT ANALYSIS (for a future execution, not to be started now)

- **Imports**: shared UI primitives, `lib/api.ts`/`lib/customerApi.ts`
  clients, and type definitions under `apps/customer/src/types/*` are used
  by both admin and customer-portal code today. A split needs either a new
  shared package (e.g. `packages/ui`, `packages/api-client`) or duplication
  of the small amount that's genuinely shared.
- **Workspace packages**: `package.json` workspaces glob
  (`apps/*`) already supports additional app packages with no change
  needed; each new app needs its own `package.json`, `vite.config.ts`,
  `tsconfig.json` mirroring the current `apps/customer` ones.
- **Build**: Turborepo `turbo.json` pipeline definitions are per-workspace
  already (`dev`, `build`, `lint`, `typecheck`, `test` per package) — adding
  packages is additive, no pipeline redesign needed.
- **CI**: `.github/workflows/*` quality-gate jobs currently reference
  `apps/customer` by name in a few places (lint/typecheck/test matrix or
  explicit paths) — these references need updating/duplicating per new app
  package name.
- **Routing**: `/customer-portal/*` and admin routes currently coexist
  under one React Router tree in one `App.tsx`. A split means each app gets
  its own root router mounted at `/` instead of a shared sub-path prefix.
- **Deployment**: currently one deployable artifact serves both audiences
  behind one origin/port. Three apps means three build outputs and either
  three subdomains/paths behind a reverse proxy, or three separate hosting
  targets — a decision to make with the eventual hosting provider in mind.
- **Environment variables**: `VITE_API_PROXY_TARGET` (dev-time API target)
  is shared per-app already and would simply be set independently per app
  in dev; no new variable shape is needed, just three separate `.env`/dev
  invocations.
- **Tests**: existing admin and customer-portal test files
  (`*.test.tsx`) live in the same `src/pages`/`src/components` tree today;
  a split moves files by directory, no test logic changes needed.
- **Documentation**: this session's demo-access instructions, the
  authentication/dev-auth docs, and any future customer-onboarding docs
  would need updating to reference three URLs/app names instead of one.

No code was moved or renamed as part of recording this finding.
