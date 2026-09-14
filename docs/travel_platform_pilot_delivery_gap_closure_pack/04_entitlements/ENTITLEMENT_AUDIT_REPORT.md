# Entitlement Enforcement Audit Report

Agent 03 (Pilot Delivery Gap Closure Pack). Executed against `main` at commit `ec7c75d` and the
commit that follows this report.

## Model

Three independent, non-substitutable authorization layers exist in this codebase:

| Layer | Question it answers | Mechanism | File |
|---|---|---|---|
| RBAC | Does this role do this? | `requireRole(UserRole.X)` | `packages/domain/tenant-context.ts` |
| Entitlement | Did the agency's plan buy this? | `requireEntitlement(database, PlatformFeature.X)` | `services/api/src/entitlements.ts` |
| Feature Flag | Did the platform turn this capability on right now? | `isFeatureEnabled(...)` | `services/api/src/feature-flags.ts` |

These must never be conflated. A route can be RBAC-clean (only ADMIN+ can call it) and still be
wide open to every ADMIN at every agency if the entitlement check is missing — that combination is
exactly the class of gap this audit hunts for. Established convention (already correct everywhere
except one omission — see below): entitlement check first, then RBAC, e.g.

```ts
await requireEntitlement(database, PlatformFeature.CREATIVE_STUDIO);
requireRole(UserRole.VIEWER);
```

## PlatformFeature classification

`PlatformFeature` (`packages/domain/types.ts`) has 9 values. Every route touching each one was
found via `grep -rn PlatformFeature\. services/api/src/routes/*.ts` and cross-checked against the
handler count in each file (`grep -c "preHandler: protectedHooks"` vs `grep -c "requireEntitlement("`
— a 1:1 match means every handler in the file is covered, not just some).

| Feature | Routes | Status | Notes |
|---|---|---|---|
| `CREATIVE_STUDIO` | `routes/assets.ts` (2/2 handlers) | **ENFORCED** | |
| `SOCIAL_AUTOMATION` | `routes/automations.ts` (5/5), `routes/connectors.ts` (1/1), `routes/engagements.ts` (1/1) | **ENFORCED** | |
| `CAMPAIGNS` | `routes/campaigns.ts` (5/5), `routes/coupons.ts` (4/4) | **ENFORCED** | |
| `SOCIAL_PUBLISHING` | `routes/publications.ts` (6/6) | **ENFORCED** | |
| `PESCADOR` | `routes/pescador.ts` (8/8) | **FIXED — was NOT ENFORCED** | See finding #1 below. |
| `WHATSAPP` | none | STANDBY | Explicitly documented in `packages/domain/types.ts` as an inert placeholder — "not wired to any capability in this batch." No route references it; nothing to enforce. |
| `AI_ASSISTANT` | none | STANDBY | Same as above. |
| `ADVANCED_ANALYTICS` | none | STANDBY | Same as above. |
| `GDS` | none | STANDBY | Same as above. |

Every Wave 2 Mega Pack domain integrated earlier (Catalog, OCR, Partners, Upsell, Contracts,
Insurance, Partner Campaigns) has **no corresponding `PlatformFeature` value** — these are plain
RBAC-gated features included in every plan, not entitlement-metered add-ons. Classified
**NOT APPLICABLE**, not a gap: the platform's entitlement model was never extended to cover them,
and nothing in the Mega Pack specs asked for it to be.

## Findings

### 1. PESCADOR had zero entitlement enforcement (FIXED)

Every other `PlatformFeature` with a real capability behind it was enforced on 100% of its routes.
`routes/pescador.ts` had **none** — all 8 handlers (`captures` list/create/update, `extract`,
`review`, `approve`, `reject`, `publish`) checked only RBAC. Any agency, entitled or not, could use
Pescador. Fixed by adding `await requireEntitlement(database, PlatformFeature.PESCADOR)` as the
first line of every handler, matching the established ordering convention exactly. A dedicated
test (`fails closed when the agency has no PESCADOR entitlement`) was added to
`pescador-http.test.ts`.

### 2. No real agency ever received a starting entitlement grant (FIXED — the actual pilot blocker)

This is more serious than finding #1: **every entitlement-gated route was already fail-closed for
every real customer**, before this audit. `agency_entitlements` is fail-closed by design (no row =
not entitled — see the table's own comment in `014_offer_growth_foundation.sql`), which is correct.
But nothing in the codebase ever *wrote* a row for a real agency. The only write path
(`setAgencyEntitlementViaPlatformStopgap` in `entitlements.ts`) is dual-gated exactly like
`ALLOW_DEV_AUTH` — dev-only, and explicitly documented as "a temporary stopgap, not a real security
boundary… requiring a human decision (a real platform-admin identity/table)." The only place
`agency_entitlements` rows ever got created was `scripts/seed-tenant-demo-data.cjs`, a local dev/demo
script.

Net effect before this fix: a real pilot customer completing onboarding through the actual product
would hit a 403 `EntitlementError` on Creative Studio, Campaigns, Social Publishing, Social
Automation, and Pescador — permanently, with no admin UI or route able to fix it in production.

Per this audit's own governing doc (`04_entitlements/ENTITLEMENT_AUDIT.md`): *"Para piloto com plano
completo, não bloquear uso; antes da venda multi-plano, enforcement real é obrigatório."* The fix:
`completeOnboarding()` (`settings-queries.ts`) now grants the agency every currently-wired
`PlatformFeature` (`PESCADOR`, `CREATIVE_STUDIO`, `CAMPAIGNS`, `SOCIAL_PUBLISHING`,
`SOCIAL_AUTOMATION`) as `enabled = true` the moment onboarding completes, via
`INSERT … ON CONFLICT (agency_id, feature) DO NOTHING` (idempotent, never clobbers a row the
platform stopgap already set). `WHATSAPP`/`AI_ASSISTANT`/`ADVANCED_ANALYTICS`/`GDS` are
deliberately **not** granted — they gate no real capability, so granting them would be a no-op that
only adds noise.

This is explicitly a **pilot-scoped** decision, not a permanent one: the moment a second,
differently-priced plan is sold, `completeOnboarding()` must branch on the purchased plan rather
than granting everything unconditionally. Tracked as a required follow-up before multi-plan sales,
per the same governing doc.

### 3. Feature flags: infrastructure exists, zero adoption (STANDBY, not a gap)

`feature-flags.ts` implements a real, RLS-backed kill-switch mechanism (`isFeatureEnabled()`,
GLOBAL/TENANT_ID/PLAN_ID/USER_ID scoping) with its own explicit docstring warning: *"a feature flag
is a KILL SWITCH, not an authorization mechanism… callers MUST still perform their normal RBAC
checks independently."* No route anywhere calls `isFeatureEnabled()`. This is not a defect — the
mechanism is sound and ready, but nothing in the current product has asked for a runtime kill
switch yet. Classified **STANDBY**: adopt if/when a specific route needs one, not before.

## Verification

- `services/api/src/routes/pescador.ts`: 8/8 handlers now call `requireEntitlement` before
  `requireRole`, matching every other gated domain's ordering exactly.
- `services/api/src/settings-queries.ts`: `completeOnboarding()` grants the 5 wired features,
  idempotently, inside the same tenant transaction as the onboarding-step update.
- Fixed two test files that had drifted to a hardcoded, incomplete migration list
  (`pescador-http.test.ts`, `invitations-permission-restrictions.test.ts` — both were silently
  skipping migrations 003–013/049 and everything past 051 respectively, which is how the
  `agency_entitlements` table (migration 014) went unexercised by either) — converted both to the
  `readdirSync`-based auto-discovery pattern already used by every migration-list test added since
  Wave 2, so this class of drift can't recur silently.
- `pescador-http.test.ts`: added a dedicated entitlement fail-closed test; existing RBAC/tenant-
  isolation test updated to grant both test agencies the entitlement so that assertion continues to
  test what it says it tests (tenant isolation) rather than being confounded by the new gate.
- Full API test suite green (only known Docker container-name contention between concurrently-run
  local test files — no real assertion failures).

## Verdict

**PESCADOR: FIXED. Onboarding entitlement grant: FIXED.** Both were real pilot blockers; neither
required weakening RLS, RBAC, or the entitlement model's fail-closed default — the fix was granting
the *right* rows at the *right* time, not loosening the check itself. `WHATSAPP` / `AI_ASSISTANT` /
`ADVANCED_ANALYTICS` / `GDS` remain correctly un-enforced (STANDBY, no capability exists). Feature
flags remain correctly unused (STANDBY, no consumer exists). Multi-plan entitlement branching in
`completeOnboarding()` is the one concrete follow-up required before a second, differently-priced
customer is onboarded — not before this pilot.
