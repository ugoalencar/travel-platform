# Current Integration Map — Offer & Growth Engine Stream B

Purely descriptive. Cites real code as of `origin/main` @ `d0008c1` (post PR #16,
Commercial Cockpit + Configurable Pipelines merged). No new behavior. Migration
numbering confirmed by listing `infrastructure/migrations/`: highest applied is
`009_configurable_pipelines.sql`; next free number is **010**.

## Offer

- Route: `app.get('/offers')`, `app.get('/offers/:id')`, `app.post('/offers')`,
  `app.put('/offers/:id')` — `services/api/src/app.ts:484-527` (exact line numbers
  per route: 484, 491, 505, 515).
- Service: `services/api/src/offers.ts` — `listOffers`, `getOfferById`,
  `createOffer`, `updateOffer` (lines 41-158). All tenant-scoped via
  `getAgencyId()` (`packages/domain/tenant-context.ts`) and
  `database.withTenantTransaction`.
- Notable behavior: `toOffer()` (offers.ts:160-180) derives `EXPIRED` status
  on read when `valid_until` is in the past, without mutating the stored
  `status` column. This is characterized by
  `services/api/tests/offers.test.ts:258-285` (three tests: past → EXPIRED,
  future → stored status, null validUntil → never auto-expires). No gap here.
- Table: `offers` (schema.prisma:207-226) — `agency_id`, `name`, `description`,
  `price` (Decimal 10,2), `valid_from`/`valid_until` (timestamptz), `status`
  (`OfferStatus` enum). `@@unique([agencyId, id])` — the composite-FK pattern
  every tenant-scoped table follows.
- RLS: standard 4-policy set (select/insert/update/delete tenant) — same
  pattern as `002_rls_policies.sql`; Offer table itself was introduced in
  `001_initial_schema.sql`/`002_rls_policies.sql` era (predates this stream).
- Frontend: agency-side Ofertas list (`Sidebar.tsx:14`, `/offers`), and the
  customer-portal read surface `apps/customer/src/customer-portal/pages/CustomerOffersPage.tsx`
  (renders `listAvailableOffers()` cards with a placeholder image block, no
  real image — see Asset Storage Discovery below).
- RBAC floor: standard `protectedHooks` (authenticated agency staff); no
  role escalation beyond authentication observed on these routes.

## CustomerInteraction

- Route: `app.get('/commercial/interactions')`, `app.post('/commercial/interactions')`
  — `app.ts:1027, 1038`.
- Service: `services/api/src/commercial-cockpit.ts` (interaction create/list
  functions alongside opportunity/task functions in the same file).
- Table: `customer_interactions` (schema.prisma:915+; DDL
  `008_commercial_cockpit.sql:148`).
- RLS: 4-policy tenant set, `008_commercial_cockpit.sql:251-264`.
- Frontend: rendered inside `Customer360.tsx` (see below) and the commercial
  agenda pages.

## CommercialOpportunity

- Routes: `/commercial/opportunities` (GET/POST, `app.ts:933,957`),
  `/commercial/opportunities/:id` (GET/PUT, `app.ts:945,966`).
- Service: `commercial-cockpit.ts` (`OpportunityRow` interface at lines 24-44,
  CRUD functions below); pipeline-stage/visibility gating delegated to
  `assertCanAccessPipeline` / `resolveVisiblePipelineIds`
  (`services/api/src/pipeline-config.ts`, imported at `commercial-cockpit.ts:18`).
- Table: `commercial_opportunities` (schema.prisma:769-818; DDL
  `008_commercial_cockpit.sql:54`) — carries `pipeline_id`/`stage_id` FKs added
  by the later configurable-pipelines work.
- RLS: 4-policy tenant set, `008_commercial_cockpit.sql:217-230`.
- RBAC floor: `protectedHooks` plus pipeline-level access check
  (`PipelineAccess`) — see Pipeline section.
- Security test coverage:
  `services/api/tests/commercial-cockpit-security.test.ts` (1099 lines) —
  extensive; covers cross-tenant isolation and pipeline access denial paths.
  Judged adequate; no characterization gap added.

## Proposal

- Route: standard CRUD pattern analogous to Offer (see `proposal-routes.test.ts`,
  `proposal-e2e.test.ts` for exercised surface).
- Table: `proposals` (schema.prisma:228-266) — composite tenant FKs to
  `Customer`, `Offer`, `User`, `Wish`, all `onDelete: Restrict` (explicit, per
  the in-schema comment at lines 246-252 explaining Prisma's implicit
  SetNull-on-nullable-optional-relation gotcha, ADR-005).
- Tests: `services/api/tests/proposals.test.ts`, `proposal-routes.test.ts`,
  `proposal-e2e.test.ts` — existing coverage judged adequate.

## Sale

- Table: `sales` (schema.prisma:268-303) — composite FKs to `Customer`,
  `Broker`, `Proposal`, `User`; `@@unique([agencyId, proposalId])` (one sale
  per proposal per tenant).
- Tests: `sales.test.ts`, `sale-routes.test.ts`, `sale-e2e.test.ts` — adequate.

## CommercialTask (follow-up)

- Routes: `/commercial/tasks` (GET/POST, `app.ts:980,1004`),
  `/commercial/tasks/:id` (GET/PUT, `app.ts:992,1013`).
- Table: `commercial_tasks` (schema.prisma:888-914; DDL
  `008_commercial_cockpit.sql:108`).
- RLS: 4-policy tenant set, `008_commercial_cockpit.sql:234-247`.
- Query helpers: `listFollowUpsDueTodayForUser`, `listPostSaleCandidates`,
  `listProposalsWithNoResponse` in `services/api/src/commercial-queries.ts`
  (imported at `commercial-cockpit.ts:13-17`), surfaced via
  `/commercial/proposals-waiting` and `/commercial/post-sale-candidates`
  (`app.ts:1087,1093`).

## Pipeline / PipelineStage / PipelineAccess

- Routes: `/commercial/pipelines` (GET/POST, `app.ts:1109,1115`),
  `/commercial/pipelines/:id` (GET/PUT, `app.ts:1124,1137`),
  `/commercial/pipelines/:id/stages` (GET/POST, `app.ts:1151,1161`),
  `/commercial/pipelines/:id/stages/:stageId` (PUT, `app.ts:1173`),
  `/commercial/pipelines/:id/access` (GET/POST, `app.ts:1187,1197`),
  `/commercial/pipelines/:id/access/:userId` (DELETE, `app.ts:1209`).
- Service: `services/api/src/pipeline-config.ts` (559 lines) —
  `assertCanAccessPipeline`, `resolveVisiblePipelineIds`, plus stage/access
  CRUD. Includes `requirePipelineAdmin()` gate referenced by the
  Sidebar comment (`Sidebar.tsx:34-36`).
- Tables: `pipelines`, `pipeline_stages`, `pipeline_access`
  (schema.prisma:819-887; DDL `009_configurable_pipelines.sql:48,68,94`).
- RLS: 4-policy tenant sets for all three tables,
  `009_configurable_pipelines.sql:237-284`.
- Frontend: `/settings/pipelines` (Sidebar "Configurações" section,
  `Sidebar.tsx:38`), `/commercial/pipeline` (Kanban board, `Sidebar.tsx:27`).
- Security tests: `commercial-cockpit-security.test.ts` covers PipelineAccess
  isolation and denial paths thoroughly — confirmed no duplicate
  characterization test needed.

## Customer 360

- Component: `apps/customer/src/components/commercial/Customer360.tsx`
  (218 lines) — aggregates a customer's interactions, opportunities, tasks,
  proposals, and sales into one view. Pure frontend composition over the
  above APIs; no dedicated backend route of its own beyond the entity routes
  it calls.

## Auth / RBAC / TenantContext (read-only reference, NOT modified)

- `packages/domain/tenant-context.ts` (364 lines). `ROLE_HIERARCHY`
  (lines 281-286): `OWNER: 100`, `ADMIN: 80`, `MANAGER: 60`, (lower roles
  below, not enumerated here to avoid re-deriving/duplicating the source of
  truth — see the file itself for the full list and `requireRole`-style
  helpers at lines ~291+).
- RLS session plumbing: `set_tenant_context()`,
  `current_agency_id()`/`current_user_id()` — `infrastructure/migrations/002_rls_policies.sql:1-60`.
  Untouched by this stream.

## Asset / Media storage discovery

- **No `Asset`/`Media` model exists in `schema.prisma`.** Full model list
  confirmed by grep: Agency, User, Broker, Customer, CustomerAccount, Wish,
  Offer, Proposal, Sale, Commission, Trip, Route, RoutePoint, Supplier,
  TransportProduct, ScheduledDeparture, Booking, BookingPassenger,
  TransportOperation, OperationCheckpoint, CommercialOpportunity, Pipeline,
  PipelineStage, PipelineAccess, CommercialTask, CustomerInteraction. No
  entity resembling an asset/image/file table.
- **No file-upload code anywhere.** Grepped the whole repo (excluding
  `node_modules`) for `multipart`, `multer`, `@fastify/multipart`, `aws-sdk`,
  `S3Client`, `object-storage`: zero matches.
- **No object-storage abstraction, no filesystem storage usage** beyond what
  a normal Node/Fastify process does implicitly (logs etc.) — nothing
  domain-relevant.
- **`Offer` has no image/URL field** (schema.prisma:207-226 lists only name,
  description, price, validity dates, status — no image column).
- **Customer-facing rendering confirms the placeholder pattern**:
  `CustomerOffersPage.tsx` (lines ~49-53) renders each offer card with a
  static `<div>Imagem indisponível</div>` block — no `<img>`, no URL, no
  upload affordance anywhere in the customer portal today.
- Conclusion: any future Asset/media capability (needed by Creative Engine,
  Pescador import, or Campaign creatives) is a completely greenfield addition
  — no existing storage convention to reuse or conflict with.

## Pescador — confirmed absent from runtime

- Grep for `pescador` (case-insensitive) across `*.ts`/`*.tsx` finds **zero**
  matches. It exists only in documentation: `docs/01-architecture/modules.md`,
  `docs/02-domain/offer.md`, `docs/adr/ADR-004-domain-modeling-*.md`,
  `docs/adr/ADR-AGENT-000-agent-readiness.md`, `docs/decisions/DEC-002-mvp-scope.md`,
  and `docs/decisions/PESCADOR-READINESS.md` (already present on this branch —
  originated from `docs/product-batch-01` / commit `c72cf5b`, merged/carried
  into main's docs tree). That readiness doc already states: "no `pescador`,
  `scraping`, or `external-capture`-named file exists" — this audit
  independently reconfirms that with a fresh grep on the current branch tip.
- No capture/review/publish pipeline of any kind exists. Nothing built here.

## Super Admin / Agency provisioning discovery (documentation only)

- `Agency` model (schema.prisma:36-77+): `plan` field is `Plan` enum
  (default `FREE`), `settings` is a bare `Json?` column (no defined shape),
  `status` is a `Status` enum. No `SuperAdmin`/`PlatformAdmin` role distinct
  from `UserRole.OWNER` exists in `ROLE_HIERARCHY` — `OWNER` is the ceiling,
  and it is agency-scoped (every tenant-scoped table requires `agency_id`;
  there is no cross-agency admin view).
- No agency provisioning/signup flow found (no route creates a new `Agency`
  row outside of what a seed/migration would do — not investigated further
  since it's out of scope, but no `/admin` or `/platform` route prefix exists
  in `app.ts`).
- No feature-flag system found (grepped for common patterns; none present).
- No subscription/billing model beyond the single `plan` enum field — no
  `Entitlement`/`Subscription` table.
- **Gap, honestly stated**: there is no technical foundation today for
  per-plan feature gating (e.g. "Creative Studio only on paid plans") or for
  a platform-level admin distinct from the top agency role. Any such gating
  is a Stream A product decision plus new schema — out of scope here.

## Frontend nav discovery (documentation only — Sidebar.tsx NOT edited)

Current `Sidebar.tsx` structure (98 lines): a flat `NAV_ITEMS` list, then a
`COMMERCIAL_NAV_ITEMS` group under a "Comercial" heading, then a
`SETTINGS_NAV_ITEMS` group under "Configurações" (currently just
Pipelines) — each group rendered with its own uppercase label div
(`Sidebar.tsx:53-62`).

Proposed (not built) future slot: a fourth group, "OFERTAS & MARKETING",
inserted after "Comercial" and before "Configurações", following the exact
same `{ label, to }` array + heading-div pattern already used by the other
two groups. Sub-items or "coming soon" disabled placeholders (matching the
existing `NavItemLink`'s `aria-disabled`/"Em breve" pattern at lines 78-87,
used today for the label-only `Dashboard` entry) for: Ofertas (already
exists — would move here or stay under the main list, TBD by Stream A),
Pescador, Creative Studio, Campanhas, Automações, Cupons, Publicações,
Analytics. No code was written for this — it's a slotting recommendation
only, gated on Stream A's actual IA decision for how these features are
grouped.
