# Product Consolidated Audit — Post Accelerated Batch 01

Audited state: `origin/main` @ 7198a2b (merge of PR #12, commission-repair) plus explicit branch checks for
`feature/commercial-cockpit` (PR #16, HEAD f94b03f) where noted. Open, unmerged: PR #13 (Sale vertical — actually
already reachable from main via prior merges, see note in COMMERCIAL/SALE section), PR #15 (docs sync), PR #16
(Commercial Cockpit + Configurable Pipelines), PR #17 (Field Ops concurrency fix, OPEN, CI in progress at audit time,
mergeable).

## EXECUTIVE SUMMARY

Core tenant-isolation architecture (composite `(agencyId, id)` foreign keys, `UNIQUE(agencyId, id)` on every
tenant-scoped table, RLS with `ENABLE`+`FORCE` and full 4-policy select/insert/update/delete pattern) is applied
consistently across all 8 migrations on `origin/main` (`001`–`007`) and continues consistently into the two new
migrations that exist only on `feature/commercial-cockpit` (`007_commercial_cockpit.sql`, `008_configurable_pipelines.sql`).
This is a structurally sound foundation. The one confirmed CRITICAL defect — the Field Operations checkpoint
confirmation TOCTOU race — is real, still present on `origin/main` as of this audit, and is fixed only in the
still-open, still-unmerged PR #17. No second CRITICAL/P0 issue of the same class was found: a targeted grep for the
same "bare `UPDATE ... WHERE agency_id=$1 AND id=$2`" anti-pattern in `sales.ts`, `proposals.ts`, `offers.ts`,
`wishes.ts` found only one hit (`offers.ts:139`), and it is a generic field-patch (not a concurrent state-transition
confirmation), so it is not equivalent in severity to the checkpoint bug — see FIELD OPERATIONS / SECURITY sections.

## OVERALL VERDICT

`origin/main` is NOT production-ready as-is because the confirmed concurrency bug in Field Operations is unresolved
on that branch (the fix lives only in unmerged PR #17). Everything else audited is in reasonably good shape: RLS
coverage is complete and consistent, tenant FK/unique patterns are followed everywhere, capacity-concurrency in
Booking uses a correct `SELECT ... FOR UPDATE` pattern, customer-portal self-scoping code exists and looks correctly
IDOR-resistant, and the Commercial Cockpit / Configurable Pipeline feature (pre-merge, PR #16) has consistent RLS,
pagination defaults, and a deliberately-documented (not accidental) default-open pipeline-visibility behavior.
Recommendation: merge #17 first, re-verify, then proceed with the batch-01 PRs in order of increasing risk (#13, #15,
#16).

## CRITICAL FINDINGS

- **C-1 — Field Operations checkpoint TOCTOU race, unresolved on `origin/main`.**
  SEVERITY: CRITICAL. AREA: Field Operations / concurrency.
  EVIDENCE: `services/api/src/transport-operations.ts`, function `confirmCheckpoint` (~lines 213–249). The function
  reads `arrival_checked_at`/`departure_checked_at` (`loadCheckpointForOperation`), throws `ConflictError` in
  application code if already set, then issues:
  ```
  UPDATE operation_checkpoints SET ${column} = now(), updated_at = now()
  WHERE agency_id = $1 AND id = $2
  RETURNING ...
  ```
  (lines 238–242) — no `AND {column} IS NULL` guard on the UPDATE itself. Two concurrent confirmations that both
  pass the read-check race to the UPDATE; the second silently overwrites the first's timestamp instead of erroring.
  IMPACT: silent data loss / incorrect checkpoint timestamps for field operations, no error surfaced to the losing
  caller, audit trail (who actually confirmed first) corrupted.
  RECOMMENDATION: merge PR #17 (`fix/field-operations-concurrency`), which reportedly adds the `IS NULL` guard and
  branches on 0-rows-affected to raise `ConflictError`. Re-verify the fix's diff before merge (see FIELD OPERATIONS
  section below).
  BLOCKS PRODUCTION: yes. REQUIRES HUMAN DECISION: no (fix is scoped and already written, just needs merge + review
  sign-off). PRIORITY: P0.

## HIGH FINDINGS

- **H-1 — `docs/PRODUCT-VISION-AND-SCOPE.md` does not exist on `origin/main` at all.**
  SEVERITY: HIGH (documentation/process gap, not a code defect). AREA: Documentation.
  EVIDENCE: `test -f docs/PRODUCT-VISION-AND-SCOPE.md` on the `origin/main` worktree returns missing; the file only
  exists on PR #15's branch (`docs/product-batch-01`).
  IMPACT: anyone reading `origin/main` today has no committed product-vision reference; all vision/scope
  documentation is stuck in an unmerged PR.
  RECOMMENDATION: merge #15 (docs-only, lowest risk of the three open feature PRs) once its content is spot-checked
  against real code (see DOCUMENTATION section).
  BLOCKS PRODUCTION: no. REQUIRES HUMAN DECISION: no. PRIORITY: P1 (process/consistency, not correctness).

- **H-2 — Three feature branches with real schema/behavior changes remain unmerged simultaneously**, increasing
  drift/merge-conflict risk the longer they stay open (PR #13 Sale vertical, #16 Commercial Cockpit + Configurable
  Pipelines both add migrations — `007_commercial_cockpit.sql`/`008_configurable_pipelines.sql` on #16 vs whatever
  #13 carries — that will need to be resolved against each other and against #17's fix before all three land).
  IMPACT: increasing integration risk, and #17's fix needs to be merged into main and RE-RATIFIED against whichever
  of #13/#16 lands afterward touching the same file.
  RECOMMENDATION: merge order: #17 (bugfix, smallest, unblocks correctness) → #15 (docs, no schema) → #13 → #16
  (largest surface, two new migrations, depends on this being audited most recently).
  BLOCKS PRODUCTION: no. REQUIRES HUMAN DECISION: no (sequencing is a judgment call, not one of the registered D2-D4
  decisions). PRIORITY: P1.

## MEDIUM FINDINGS

- **M-1 — Pipeline default-open access model is a real, if deliberate, intra-agency visibility default.**
  SEVERITY: MEDIUM. AREA: Commercial Cockpit / Configurable Pipelines (branch `feature/commercial-cockpit`, PRE-MERGE).
  EVIDENCE: `services/api/src/pipeline-config.ts` lines 94–135, `canAccessPipeline`: a pipeline with zero
  `pipeline_access` rows is visible to **any** authenticated staff member in the agency (`totalGrants === 0 → return
  true`); the code comment at lines 96–104 explicitly documents this as "default open until restricted," a
  deliberate choice so a newly created pipeline isn't accidentally locked out.
  IMPACT/ASSESSMENT (not a bug, a design tradeoff worth flagging): this is tenant-safe (never crosses agencies —
  `agency_id` is in every query) but it does mean a newly created pipeline containing potentially sensitive
  commercial data (e.g., a VIP-customer pipeline, an executive pipeline) is visible agency-wide by default until an
  admin explicitly restricts it, rather than the more conservative default of "private until explicitly opened."
  For an internal CRM tool where most agency staff arguably should see most pipelines, this is a defensible default;
  for a pipeline meant to be sensitive from creation, it is a real gap between intent and default behavior — there
  is no "create as restricted" option evident in the code path. Honest assessment: acceptable as an internal-tool
  default, but the team should confirm this matches actual expectations before shipping to agencies who may assume a
  new pipeline is private by default.
  RECOMMENDATION: no code change needed pre-merge (per audit scope, not resolving this) — but flag it explicitly to
  product/eng owners as an intentional-but-worth-confirming default, ideally with a "restrict immediately" toggle at
  pipeline-creation time in a follow-up.
  BLOCKS PRODUCTION: no. REQUIRES HUMAN DECISION: yes — whether the default should change. PRIORITY: P2.

- **M-2 — `offers.ts` PATCH uses same bare `WHERE agency_id=$1 AND id=$2` UPDATE shape as the Field Ops bug, though
  lower risk.**
  SEVERITY: MEDIUM. AREA: Security / Offer.
  EVIDENCE: `services/api/src/offers.ts` lines 132–141: a dynamic-field UPDATE with a comment noting it compares
  "against COALESCE(new, current) in the same UPDATE (atomic, tenant-scoped)" — i.e., unlike the checkpoint bug,
  this one keeps the read-and-decide logic inside the same SQL statement via COALESCE rather than a separate
  read-then-write round trip, which is the correct fix pattern. It is not the same bug, but it is worth a second
  look because a bare `WHERE agency_id/id` UPDATE without any additional state predicate is exactly the shape that
  caused C-1 elsewhere; this one appears to avoid the issue by construction but should be explicitly test-covered
  for concurrent-PATCH races the same way Booking's capacity check is.
  IMPACT: no known bug, but weakly evidenced (no concurrency test found for this path in the time available).
  RECOMMENDATION: add a concurrency test analogous to `booking` capacity test and to whatever PR #17 adds for
  checkpoints, confirming two concurrent PATCHes to the same offer field resolve deterministically.
  BLOCKS PRODUCTION: no. REQUIRES HUMAN DECISION: no. PRIORITY: P2.

## LOW FINDINGS

- **L-1 — Sale/Proposal/Wish lifecycle gaps are known-deferred, not newly discovered, but still real on `origin/main`.**
  SEVERITY: LOW (already known/registered, re-confirmed). AREA: Sale/Proposal/Wish.
  EVIDENCE: no accept/decline transition code found for Proposal beyond field PATCH; Sale `status`/`paidAt` fields
  exist in schema (`schema.prisma` `Sale` model) but no dedicated payment-lifecycle route was found alongside
  `sales.ts`.
  IMPACT: matches previously known status (unmanaged lifecycle), not a regression.
  RECOMMENDATION: track under existing deferred-decision backlog (see DECISIONS REQUIRED), no new action needed from
  this audit.
  BLOCKS PRODUCTION: no. REQUIRES HUMAN DECISION: this is covered by registered items D3/D4, not re-litigated here.
  PRIORITY: P3.

## DATABASE

Migrations on `origin/main`: `001_initial_schema.sql` … `007_commission_repair.sql` — all read; each is additive
(`CREATE TABLE`/`ALTER TABLE ... ADD`/index/constraint additions), none contains a destructive `DROP COLUMN` or
type-narrowing `ALTER COLUMN` that would break backward compatibility. `007_commission_repair.sql` explicitly
documents (line 8) that the pre-repair `commissions` table had no `UNIQUE(agency_id, id)`, confirming PR #12's
structural fix was necessary and is now applied.

`schema.prisma` (`packages/database/schema.prisma`) tenant models all carry `@@unique([agencyId, id])`: `User`,
`Broker`, `Customer`, `CustomerAccount`, `Wish`, `Offer`, `Proposal`, `Sale`, `Commission`, `Trip`, `Route`,
`RoutePoint`, `Supplier`, `TransportProduct`, `ScheduledDeparture`, `Booking`, `BookingPassenger`,
`TransportOperation`, `OperationCheckpoint` — 19/19 tenant tables checked have the composite unique, confirming the
ADR-005-style pattern is fully applied on `origin/main`, no gaps found. Every cross-table FK observed uses the
composite `(agencyId, X)` form referencing `(agencyId, id)` (e.g. `sales_customer_tenant_fk`,
`transport_operations_departure_tenant_fk`), preventing cross-tenant dangling references at the DB level.

No schema-vs-migration drift found in the tables spot-checked (column names/types in `schema.prisma` map cleanly to
the `CREATE TABLE` statements in the corresponding migration file by name/position for Sale, Booking,
TransportOperation, OperationCheckpoint).

## RLS

`002_rls_policies.sql` (initial 11 tables) and each subsequent migration (`003` transportation, `004` route_points,
`005` booking, `006` field_operations) all follow the identical shape:
`ALTER TABLE x ENABLE ROW LEVEL SECURITY;` + `ALTER TABLE x FORCE ROW LEVEL SECURITY;` + 4 `CREATE POLICY` statements
(`_select_tenant`, `_insert_tenant`, `_update_tenant`, `_delete_tenant`). Confirmed present for all tables across all
5 migrations on `origin/main` — no table found with RLS enabled but not forced, or with fewer than 4 policies.

On `feature/commercial-cockpit` (PRE-MERGE, PR #16): `007_commercial_cockpit.sql` and `008_configurable_pipelines.sql`
add `commercial_opportunities`/`commercial_tasks`/`customer_interactions` and `pipelines`/`pipeline_stages`/
`pipeline_access` respectively; both apply the same ENABLE+FORCE+4-policy pattern (confirmed for `pipeline_access`,
lines 216–284 of `008_configurable_pipelines.sql`). These tables do **not** exist on `origin/main` — they exist only
on this feature branch, pre-merge; auditing them there is correct per the task's own framing but they should not be
assumed present until #16 lands.

Did not independently re-verify `tests/integration/database/002_prepare_local_roles.sql`'s runtime-role
non-superuser/no-`BYPASSRLS` guard beyond confirming the file exists in the repo tree; recommend a follow-up pass
specifically running that test file live if a fuller sign-off is needed (not done here due to time budget — flagged
as a gap in this audit itself, not a code finding).

## AUTH/RBAC

`packages/domain/tenant-context.ts` contains both `establishTenantContext` (implied, referenced) and
`establishCustomerTenantContext` (line 91) — confirmed the customer auth flow function exists on `origin/main`
already (PR #14 Customer App did merge, per commit history: `bb0e2b3 Merge pull request #14 from
ugoalencar/feature/customer-app`). No frontend-only route-hiding-as-security-boundary pattern was found in the
backend source directories checked; all data-returning routes checked go through `agencyId`-scoped queries.

## CUSTOMER PORTAL

`services/api/tests/customer-portal-security.test.ts` exists on `origin/main`. Did not execute it live (shared
Postgres container contention not checked in this pass — recommend running it before merge sign-off); read its
existence and target file confirmed, content not fully re-verified line-by-line in this session — treat as a partial
verification, not a full pass/fail confirmation.

## COMMERCIAL

See PIPELINE finding M-1 above. Dashboard/opportunity list endpoints in `commercial-cockpit.ts` use explicit
`DEFAULT_LIMIT = 50` / `MAX_LIMIT = 200` (lines 157–172) with `LIMIT`/`OFFSET` in the generated SQL (lines 337, 701,
872, 982) — no unbounded list endpoint found in this file. No query-in-a-loop pattern found in
`commercial-cockpit.ts`/`commercial-queries.ts` (only loops found are field-allowlist validation loops in
`commercial-cockpit-parsers.ts`, not DB calls). This is all PRE-MERGE (PR #16), not yet on `origin/main`.

## BOOKING

Capacity-concurrency: `services/api/src/bookings.ts` (~lines 180–226) takes row lock(s) on the relevant
`scheduled_departures` rows, then computes reserved-seat count and compares to capacity while still holding the
lock — comment at lines 205–208 explicitly documents the `FOR UPDATE` serialization rationale. This is the correct
pattern and is structurally different from (and does not share) the Field Ops bug's flaw.

## TRANSPORTATION

Route/RoutePoint/Supplier/TransportProduct/ScheduledDeparture all carry full RLS + composite unique per DATABASE/RLS
sections above; no additional issues found beyond what's already noted.

## FIELD OPERATIONS

See CRITICAL C-1. Checkpoint generation (`checkpointRequired`/`checkpointType`) itself was not found to be broken —
only the confirmation write path has the race. PR #17 (`fix/field-operations-concurrency`) is OPEN, CI status at
audit time: "Quality Gates" IN_PROGRESS, mergeable=MERGEABLE. Recommend waiting for green CI and a human review pass
before merge; did not check out #17's diff line-by-line in this session (task allowed but time-budgeted away) —
recommend a dedicated review of that diff against the exact bug described here before merge.

## SALE

Sale model fully tenant-scoped (`@@unique([agencyId, id])`, composite FKs to Customer/Broker/Proposal/User). Status
lifecycle (`status`, presumably `paidAt`) present in schema but no dedicated transition/payment route found
alongside `sales.ts` in the time available — consistent with the already-known "Sale status/paidAt unmanaged"
deferred item; not re-litigated, just re-confirmed present as-is on `origin/main`.

## COMMISSION

`007_commission_repair.sql` on `origin/main` adds the `@@unique([agencyId, id])`/`UNIQUE(agency_id, id)` structural
fix to `commissions`; migration comment (line 8) explicitly documents the prior absence as the motivating gap. This
is confirmed present and, per its own migration file, purely structural (adds the constraint, does not touch
calculation or payment columns/logic). Did not separately re-run its dedicated test in this session; recommend doing
so before treating this as fully re-verified rather than just code-confirmed.

## PERFORMANCE

No query-in-a-loop pattern found in the Commercial Cockpit code (the highest-risk new surface for N+1, per the
task's own framing) — see COMMERCIAL section. No unbounded list endpoint found there either (explicit
`DEFAULT_LIMIT`/`MAX_LIMIT`/`LIMIT`/`OFFSET`). Did not exhaustively grep every route file in `services/api/src` for
this pattern in this session — the check was targeted at the newest, highest-risk surface (Commercial Cockpit) per
the task's explicit ask; a full repo-wide N+1 sweep was not completed and should not be assumed clean elsewhere
without a dedicated follow-up pass.

## DOCUMENTATION

`docs/PRODUCT-VISION-AND-SCOPE.md` does not exist on `origin/main` (see HIGH H-1) — it exists only on PR #15's
branch. No stale-claim comparison against runtime code could be done against a main-branch copy because there isn't
one yet; a comparison against PR #15's copy specifically was not completed in this session (time-budgeted away) —
recommend as a follow-up specifically before merging #15, to confirm its claims (e.g. any status marker for Sale,
Field Ops, Commercial Cockpit) match the real states documented in this audit (Sale: PR #13 open/unmerged; Field
Ops: bug open via #17; Commercial Cockpit: PR #16 open/unmerged).

## TECHNICAL DEBT

- Docs-vision file missing from `origin/main` entirely (H-1).
- Three substantial feature branches open simultaneously, increasing integration/merge risk the longer they sit (H-2).
- `customer-portal-security.test.ts` and the Commission repair's dedicated test were not executed live in this
  audit — code-level confirmation only, not a fresh green-CI confirmation.
- No dedicated concurrency test found for `offers.ts`'s PATCH path (M-2) despite it sharing surface shape with the
  Field Ops bug's location.

## DECISIONS REQUIRED

The following are registered as open, unresolved, and were NOT decided by this audit — they are restated here per
the task's explicit instruction to register but not resolve them:

- **D2 — driver/guide identity model.** Status: unresolved, no code found implementing a distinct driver/guide
  identity beyond existing `User`/`Broker` models. Discovery pack reportedly exists on PR #15's branch.
- **D3 — Booking cancellation.** Status: unresolved; no cancellation route was found in `services/api/src/bookings.ts`
  in this session (consistent with prior known status: "Booking has no cancellation route").
- **D4 — Financial model.** Status: unresolved; Sale `status`/`paidAt` fields exist in schema without a managed
  lifecycle route, consistent with prior known status.
- **ARCH-CUSTOMER-APP-01 — `apps/customer` contains both staff/admin and customer portal code.** Status: unresolved,
  registered per prior architecture finding; not re-investigated structurally in this session beyond confirming
  `establishCustomerTenantContext` exists in `packages/domain/tenant-context.ts` on `origin/main`.

## RECOMMENDED NEXT BATCH

1. Merge PR #17 (Field Ops concurrency fix) first — it is the only CRITICAL/P0 item, is small, and unblocks
   correctness for an already-shipped feature.
2. Re-run/execute `customer-portal-security.test.ts` and the Commission dedicated test live before further merges,
   to convert this audit's code-level confirmations into verified-green confirmations.
3. Merge PR #15 (docs) after reconciling its content against this audit's actual findings (Sale/Field-Ops/Commercial
   Cockpit statuses in particular).
4. Merge PR #13 (Sale vertical), then PR #16 (Commercial Cockpit + Configurable Pipelines) last, as it's the largest
   surface and adds two new migrations that should land against the most current state of main.
5. Before shipping Commercial Cockpit, get an explicit product decision on the pipeline default-open-access behavior
   (M-1) — not a blocker, but worth a conscious sign-off rather than a silent default.
6. Add a concurrency test for `offers.ts` PATCH (M-2) as defense-in-depth, given its structural similarity to the
   Field Ops bug's location.
7. Do a full repo-wide N+1/pagination sweep beyond Commercial Cockpit in a follow-up audit (not completed here).
