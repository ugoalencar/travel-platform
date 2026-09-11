# Mega Pack — Wave 1 Integration Audit

Branch: `feature/mega-pack-wave1-integration`, merged from `main` (`522eec6`) plus:
- `feature/mega-client-onboarding` (Agent 02) — fast-forward, no conflicts.
- `feature/mega-saas-admin` (Agent 01) — one real conflict, resolved below.

Not merged to `main`. Not pushed.

## Scope delivered this wave

**Agent 02 — Client Onboarding (complete):**
- `enrollment_links` / `enrollment_submissions` / `enrollment_documents` (RLS ENABLE+FORCE, hashed high-entropy tokens, narrow public-lookup RLS policy).
- Public token-only submission flow, staff review (approve/request changes), approval converts to a real `createCustomer`/`createWish` row (no shadow table), CPF/email/phone dedupe.
- Staff UI: "Cadastro Remoto" page in `apps/agency` (generate/list/revoke links, review submissions).
- Public UI: standalone `/enroll/:token` form in `apps/customer`, outside any authenticated shell.
- 19 enrollment tests + 2 rate-limit classification tests, all passing.

**Agent 01 — SaaS Admin (partial, by design — see KNOWN GAPS):**
- AgencyProfile/AgencyBranding (displayName/logoUrl/primaryColor) + tenant-scoped `departments` (RLS ENABLE+FORCE), with a Settings UI tab. 9 tests.
- `invitations` (invite-by-email, hashed token, inviter can never grant a role above their own) + `permission_restrictions` (additive-only per-tenant role narrowing; DB CHECK + app-level guard block restricting OWNER/ADMIN — self-lockout prevention). 14 tests. **Backend only — no agency-side UI yet** (P2).
- Platform Admin agency/entitlement view: verified `GET /platform/subscribers` (pre-existing) already satisfies this; no new code needed.
- Onboarding wizard: **not built** (P2) — `onboarding_completed_at`/`onboarding_step` columns exist, unused.

## Merge conflicts and resolution

**Migration number collision:** both branches independently used `049_` for unrelated migrations (`049_enrollment_links.sql` vs `049_agency_branding_departments.sql`), and `feature/mega-saas-admin` also had a `050_invitations_permission_restrictions.sql`. This is expected — each branch only sees its own worktree's migration history when picking the next number, per the pack's own design (Integrator resolves this).

Resolved by renumbering:
- `049_enrollment_links.sql` — kept as-is.
- `049_agency_branding_departments.sql` → **`050_agency_branding_departments.sql`**.
- `050_invitations_permission_restrictions.sql` → **`051_invitations_permission_restrictions.sql`**.

Updated the two test files that referenced the old filenames by exact path (`services/api/tests/departments.test.ts`, `services/api/tests/invitations-permission-restrictions.test.ts`) to point at the renumbered files. No migration content was altered, only filenames/references — none of these migrations had been merged to `main` before this integration, so renumbering here is not "rewriting an applied migration."

**`tests/integration/database/002_prepare_local_roles.sql`:** textual conflict — both branches added their own `GRANT ... IF to_regclass(...) IS NOT NULL` block for their new tables, adjacent to each other. Resolved by keeping both blocks (enrollment_links/submissions/documents grants, then departments grant, then invitations/permission_restrictions grants) — no logic overlap.

`services/api/src/app.ts`, `audit-log.ts`, `apps/agency/src/lib/api.ts` auto-merged cleanly (route/function additions in different regions of each file).

## Final gates

| Gate | Result |
|---|---|
| typecheck (`tsc --noEmit`) | PASS — 0 errors |
| lint | PASS — 0 errors, 18 pre-existing warnings (unrelated files) |
| build | PASS — `services/api`, `apps/agency`, `apps/customer` all clean |
| unit + integration tests | PASS — 76 files / 1294 tests, 0 failures |
| migration validation | PASS — 51 migrations apply cleanly in order after renumbering, no duplicate numbers |
| security tests | PASS — enrollment token entropy/expiry/revoke/cross-tenant (19), invitations+permission-restrictions cross-tenant/self-lockout (14), rate-limit classification (2), all included in the 1294 |
| cross-tenant tests | PASS — every new table has an explicit Tenant A/B isolation test |

## Regression check: RLS / RBAC / tenant isolation

- No migration in this wave touches `002_rls_policies.sql` or any other previously-applied RLS-defining migration.
- No change to `packages/domain/tenant-context.ts` or the RBAC role hierarchy.
- `permission_restrictions` is verified additive-only: DB-level CHECK constraint plus an application-level guard both block restricting `OWNER`/`ADMIN`; `assertNotRestricted()` only runs after `requireRole()` already passed, so it can only narrow, never widen, access.
- `enrollment_links`/`invitations` public-lookup RLS policies are scoped to an exact `token_hash` match against a server-derived session setting (`app.enrollment_lookup_hash` / `app.invitation_lookup_hash`) — a caller without the raw token cannot make the setting equal any row's hash.

## Known gaps (carried forward, not blocking this wave's acceptance)

1. No agency-side UI for inviting team members or configuring permission restrictions — backend complete and tested, UI is a follow-up.
2. Onboarding wizard not built.
3. Real email delivery for invitations is stubbed (token returned directly to the staff caller) — needs a human decision on an external provider (SendGrid/Postmark/SES/etc.).
4. Contracts, Partners, Traveler 360, OCR, Catalog, Upsell, Insurance, Campaigns (Agents 3–10 of the Mega Pack) have not been started.

## Recommendation

Both delivered slices (Client Onboarding, and the AgencyBranding/Departments/Invitations/PermissionRestriction portion of SaaS Admin) are tenant-isolated, RLS-enforced, audited, tested, and pass every gate the pack defines that doesn't require production infrastructure or a paid provider decision. Ready for human review and, if approved, merge to `main`.
