# AGENT E — AUDIT CONSOLIDATOR + RELEASE LOCK

Inputs:
- Functional audit
- Security audit
- Migration/recovery audit
- Production readiness audit

All four MUST reference the same exact full `release/final-rc-02` SHA.

If SHAs differ:
AUDIT SET INVALID — STOP.

Create summary:
AUDIT | SHA | P0 | P1 | P2 | P3 | VERDICT

If any P0/P1:
FINAL VERDICT BLOCKED.
Do not push/PR/merge/deploy.

If a fix changes the SHA:
invalidate all four audits and rerun them.

Only when all four have P0=0/P1=0, rerun final configured gates:
lint, typecheck, unit, agency, customer, core, financial, reporting, settings, auth, CAPTCHA, MFA, security, DB, RLS, FORCE RLS, tenant/customer isolation, migration validation, secrets, dependency/security check, build, production build.

Create/update:
`docs/release/FINAL_RELEASE_LOCK.md`

Return exactly:

TRAVEL PLATFORM — FINAL RELEASE LOCK

FINAL RC BRANCH
release/final-rc-02

FINAL RC HEAD
<full sha>

BASE MAIN
<full sha>

FUNCTIONAL AUDIT
PASS / FAIL

SECURITY AUDIT
PASS / FAIL

MIGRATION/RECOVERY AUDIT
PASS / FAIL

PRODUCTION READINESS AUDIT
PASS / FAIL

FULL GATES
PASS / FAIL

P0
0

P1
0

P2
...

P3
...

WORKTREE
CLEAN / DIRTY

FINAL VERDICT
READY TO PUSH FINAL RC
or
BLOCKED

DO NOT PUSH.
DO NOT OPEN PR.
DO NOT MERGE.
DO NOT DEPLOY.
STOP.
