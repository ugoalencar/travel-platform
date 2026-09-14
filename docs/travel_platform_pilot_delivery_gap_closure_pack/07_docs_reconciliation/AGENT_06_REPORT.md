# Agent 06 Report — Documentation Reconciliation

Pilot Delivery Gap Closure Pack. Executed against `main` at commit `ec7c75d` and the commits that
follow this report.

## Scope

Per `07_docs_reconciliation/DOC_TRUTH_PLAN.md`: correct docs that describe a future/aspirational
state as if it were current, or that describe an implementation that was superseded — never change
code to match stale docs.

## Checked, already accurate — no change needed

| Doc claim | Reality | Verdict |
|---|---|---|
| React Query: future, not current | not searched in code; no doc claimed it was current | N/A |
| React Hook Form + Zod: future | not searched in code; no doc claimed it was current | N/A |
| `/api/v1`: not implemented | no route prefix exists anywhere | N/A — nothing to fix |
| Prisma: schema derivado, SQL é fonte de verdade | `packages/database/schema.prisma` exists and is exactly that — a derived schema alongside `infrastructure/migrations/*.sql` as the real runtime source | **Already accurate** |
| Broker App / shared packages: don't exist | confirmed, no such directories | N/A |

## Fixed — real drift found

### `docs/adr/ADR-003-authentication.md`

Described JWT + httpOnly cookie as the accepted, implemented design. It was accepted but **never
implemented** — two prior half-built attempts exist (`production-auth.ts`'s OIDC scaffolding,
always returning `null`; `auth_sessions`/MFA tables never wired to HTTP), then this pack's actual
build: opaque Bearer session tokens (not JWT, not cookies), scrypt password hashing. Added a
reconciliation note at the top of the ADR describing what's real today, without deleting or
rewriting the original (superseded) decision record — that stays as the historical account of what
was decided and never built.

### `docs/PRODUCT-VISION-AND-SCOPE.md` (§28.1, security matrix row)

Claimed "Dev-auth dual gating | Headers synthetic em dev, JWT em produção." Corrected to describe
the real session-token mechanism, pointing at ADR-003's reconciliation note.

### `docs/03-security/authentication.md`

The most out of date of the three: full JWT+cookie flow, argon2 password hashing example, and a
route table listing `/auth/register`, `/auth/forgot`, `/auth/reset`, `/auth/me` — **none of which
exist**. The real routes are `/auth/login`, `/auth/mfa/verify`, `/auth/forgot-password`,
`/auth/reset-password`, `/auth/logout`, `/auth/sessions`, `/auth/sessions/:id/revoke`,
`/auth/mfa/enroll`, `/auth/mfa/enroll/confirm`, `/auth/mfa/disable`, and `PATCH /users/:id/status`
— none of which existed in the old doc. There is no agency self-registration endpoint at all
(agencies are created via onboarding; users via invitation only) — the old doc's `/auth/register`
example was describing a flow this product doesn't have. Rewrote the file to describe the real
flow, real endpoint table, real session mechanism (opaque token, not JWT), real hashing (scrypt,
not argon2), and real rate-limiting (`LoginAbuseProtector`).

## Not exhaustively scanned

This repository has several hundred markdown files across `docs/`. Given this pack's own scope
discipline (correct real drift, don't chase 100% doc coverage as a project unto itself), this pass
targeted the highest-visibility, highest-risk drift: documents describing **authentication and
authorization**, since that's exactly the area with a large, real gap between old design docs and
what Agent 02/03 actually built this pack. A full repo-wide doc audit was not attempted and is not
claimed here — flagging this explicitly rather than implying completeness that wasn't verified.

## Verdict

**Auth-related doc drift: FIXED** (3 files). **Broader doc audit: not attempted, scope explicitly
limited to the area with confirmed real drift** (auth), per this task's own instruction to correct
real gaps rather than treat documentation completeness as an open-ended goal.
