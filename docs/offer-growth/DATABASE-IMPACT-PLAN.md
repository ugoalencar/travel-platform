# Database Impact Plan — Offer & Growth Engine Stream B

Prospective only. No migration written, no `schema.prisma` edit. Current
highest applied migration on `origin/main` (verified by listing
`infrastructure/migrations/` on this branch): `009_configurable_pipelines.sql`.
**Next free migration number: 010.**

Every existing tenant-scoped table in this schema follows one fixed pattern:
`agency_id` column + `@@unique([agencyId, id])` + composite tenant-safe FKs
(`[agencyId, otherId] -> [agencyId, id]`) + a 4-policy RLS set (select/
insert/update/delete, all `USING/WITH CHECK agency_id = current_agency_id()`).
All prospective entities below are expected to follow the same pattern
unless Stream A decides otherwise.

## Prospective entities

### Asset
- Tenant key: `agency_id`.
- Probable composite FK targets: none required structurally, but likely
  optional links to whatever entity references it (Offer, CreativeTemplate,
  CustomerInteraction attachment) — those referencing tables would hold the
  composite FK to Asset, not the reverse.
- Migration risk: first entity that needs an actual storage-location field
  (object key/URL) — this is a new concern, no existing column pattern to
  copy from Offer (Offer has none).

### CreativeTemplate
- Tenant key: `agency_id`.
- Probable composite FK: optional link to Asset(s) used inside it; possibly
  to Offer/Campaign as the thing it's rendering.
- Depends on Stream A's decision of what a "creative" fundamentally is
  (single-purpose per offer? reusable template? — see IMPLEMENTATION-HANDOFF.md).

### Campaign
- Tenant key: `agency_id`.
- Probable composite FK: to Offer(s) (many-to-many likely), CreativeTemplate.
- Migration risk: moderate — likely needs a join table (`campaign_offers`)
  following the same composite-FK convention.

### Publication
- Tenant key: `agency_id`.
- Probable composite FK: to Campaign, CreativeTemplate/Asset, and a future
  "channel connector config" entity (not yet designed — see
  SECURITY-THREAT-MAP.md on credential storage).
- Migration risk: needs an external-id column (platform post id) — no
  existing table stores external-platform identifiers today; this is new
  territory.

### Engagement
- Tenant key: `agency_id`.
- Probable composite FK: to Publication.
- **High volume** — see Performance Discovery below. This is the table most
  likely to need aggregation/rollup strategy rather than raw-row storage
  long-term.

### Automation
- Tenant key: `agency_id`.
- Probable composite FK: to Pipeline/PipelineStage (trigger source),
  Campaign/Publication (action target) — genuinely open, depends on Stream
  A's automation scope decision.

### AutomationExecution
- Tenant key: `agency_id`.
- Probable composite FK: to Automation.
- **High volume** — one row per trigger firing. Needs retention policy
  discussion (see Performance Discovery).

### Coupon
- Tenant key: `agency_id`.
- Probable composite FK: optional to Offer/Campaign; redemptions would
  likely reference Sale (existing table) via composite FK, matching how
  `Sale` already links to `Proposal`/`Broker`.
- Migration risk: low structurally, but the abuse-prevention logic (rate
  limiting, single-use enforcement) is app-layer, not schema — see
  SECURITY-THREAT-MAP.md.

### Entitlement
- Tenant key: `agency_id`.
- Probable composite FK: none needed if it's purely `(agency_id, feature_key,
  value)`.
- Depends entirely on whether Stream A wants plan-based feature gating at
  all — currently `Agency.plan` is an unused-beyond-storage enum (see
  CURRENT-INTEGRATION-MAP.md Super Admin section). This is the clearest
  case of "no code path consumes this yet."

## Tenant / RLS plan (per entity)

For every entity above, the expected shape (mirroring
`002_rls_policies.sql` / `008_commercial_cockpit.sql` / `009_configurable_pipelines.sql`,
none of which were touched):

- Column: `agency_id TEXT NOT NULL REFERENCES agencies(id)`.
- `UNIQUE (agency_id, id)` so downstream tables can FK to `(agency_id, id)`.
- Composite FKs from any child table: `FOREIGN KEY (agency_id, parent_id)
  REFERENCES parent_table(agency_id, id)` — never a bare `parent_id` FK,
  which would allow cross-tenant linkage.
- RLS: `ENABLE ROW LEVEL SECURITY` + 4 policies (`_select_tenant`,
  `_insert_tenant`, `_update_tenant`, `_delete_tenant`), each
  `USING (agency_id = current_agency_id())` /
  `WITH CHECK (agency_id = current_agency_id())` as appropriate — copy the
  exact template from `009_configurable_pipelines.sql:237-284`.
- Probable indexes: `(agency_id)` always; `(agency_id, <hot filter column>)`
  for whichever column dashboards will filter/sort by (status, created_at,
  publication time) — following `offers_agency_status_idx` /
  `offers_agency_valid_until_idx` as the existing template
  (schema.prisma:222-224).
- No actual policy SQL was written for any of these — this section is a plan
  to hand to whoever writes migration 010+.

## Performance discovery

Anticipated high-volume surfaces, none built:
- **Engagement** (likes/views/clicks per publication) — expect this to
  dwarf every other table in row count. Will need: pagination on any list
  endpoint, an `(agency_id, publication_id, created_at)` index at minimum,
  a retention/rollup strategy (raw events vs. periodic aggregates) decided
  before this ships, since raw-event storage at scale will not survive
  un-aggregated for long.
- **AutomationExecution** — one row per firing; needs the same retention
  conversation, plus likely a status index for "show me failed runs."
- **Publication metrics** — if pulled from external platform APIs on a
  schedule rather than webhooked, this becomes a polling/rate-limit design
  question, not just a DB one.
- **Assets** — file size and count could grow large; this repo currently has
  zero object-storage integration (see CURRENT-INTEGRATION-MAP.md), so
  "performance" here starts at "does storage exist at all," not indexing.

No implementation was attempted for any of this.
