# TRAVEL PLATFORM — MANDATORY WORKTREE ISOLATION
## DO NOT MODIFY THIS CHECKOUT

**THIS IS A HARD OPERATIONAL RULE.**

MAIN CHECKOUT: `D:\travel-platform`

**IS INTEGRATION-ONLY MODE.**

## YOU MUST NOT
- edit files here
- create source files here
- run refactors here
- apply patches here
- leave generated JS here
- leave untracked files here

This has already happened **twice** (API modularization Phase 1 and Phase 2 work was
found sitting uncommitted directly in this checkout while other integration work was
in progress here). Both times the work had to be manually rescued via `git stash` and
moved into a worktree by another session, at real cost.

## ALL API MODULARIZATION WORK MUST OCCUR IN
`D:\travel-platform-worktrees\api-modularization-phase1`

## BEFORE DOING ANYTHING, PRINT
1. current working directory
2. `git branch --show-current`
3. `git rev-parse HEAD`
4. `git status --short`

**If working directory is `D:\travel-platform`: STOP IMMEDIATELY.**
Do not continue until you have switched to the modularization worktree above.

---

## CURRENT RECOVERED STATE

The following Phase 2 modularization files were preserved in the isolated worktree
(`D:\travel-platform-worktrees\api-modularization-phase1`, branch
`feature/api-modularization-phase1`):

- `services/api/src/routes/automations.ts`
- `services/api/src/routes/campaigns.ts`
- `services/api/src/routes/coupons.ts`
- `services/api/src/routes/offers.ts`
- `services/api/src/routes/publications.ts`

They are **NOT yet wired into `app.ts`**.

There were 7 real conflict hunks between:
- the prior Phase 1 extraction (already committed on that branch)
- the newer Phase 2 extraction (recovered from this checkout, stashed)
- the current integration baseline's `app.ts` (Mega Pack Wave 1 + SaaS Admin
  onboarding/settings routes)

**Do NOT resolve these conflicts by blindly copying old `app.ts` sections.**

---

## NEXT TASK — FROM THE ISOLATED WORKTREE ONLY

1. Rebase/merge safely onto the current integration baseline (`main` @ `fe1d3f1` or later —
   check `git log --oneline -5` in `D:\travel-platform` for the current HEAD before starting).
2. Reconcile route registrations using the **current** `app.ts`, not an old snapshot.
3. **Preserve all Mega Pack SaaS Admin settings/onboarding routes** — branding, departments,
   invitations, permission-restrictions, onboarding-step/complete. These are real, tested,
   shipped functionality (`main` commits `32697b7`..`fe1d3f1`). Do not remove or regress them
   while re-wiring the settings extraction.
4. Wire Phase 2A modules one by one (automations, campaigns, coupons, offers, publications).
5. Run a registration audit (below).
6. Run characterization/security/typecheck/lint/build.
7. Commit only after everything is green.

### Do NOT touch
- Auth
- Tenant
- RLS
- RBAC
- migrations (never rewrite an applied one — only add new, next-numbered ones)
- finance formulas
- SaaS Admin onboarding behavior

---

## MANDATORY REGISTRATION AUDIT

For every modularized domain, confirm all of the following PASS:

| MODULE | ROUTE FILE | EXPORT EXISTS | IMPORTED BY app.ts | REGISTERED IN buildApp | OLD INLINE ROUTES REMOVED | DUPLICATE REGISTRATION ABSENT |
|---|---|---|---|---|---|---|
| settings | | | | | | |
| assets | | | | | | |
| engagements | | | | | | |
| entitlements | | | | | | |
| offer-growth-audit | | | | | | |
| connectors | | | | | | |
| support | | | | | | |
| automations | | | | | | |
| campaigns | | | | | | |
| coupons | | | | | | |
| offers | | | | | | |
| publications | | | | | | |

---

## FINAL GATE

If the isolated worktree is not clean and green: **DO NOT request merge.** Report exact
blockers instead.

**FINAL STATUS** must be one of:
- `READY FOR INTEGRATION`
- `BLOCKED — <reason>`
