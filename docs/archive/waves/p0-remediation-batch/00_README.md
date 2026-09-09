# Travel Platform — P0 Remediation Batch

Use this batch against the exact blocked `release/final-rc-02` HEAD.

Run in parallel:
1. Build/Test repair
2. Rate-limit production store
3. Dependency vulnerability remediation
4. Agency productionization/no-fixtures

Then run:
5. P0 integration + exact-head revalidation

Important:
- Do NOT use `npm audit fix --force` blindly.
- Do NOT weaken auth/tenant/RLS/rate-limit behavior to get green.
- Do NOT push/PR/merge/deploy.
- Any fix changes the audited SHA, so all 4 final audits must be rerun after integration.
