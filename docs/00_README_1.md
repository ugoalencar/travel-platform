# Final Audit Swarm

Use only after `release/final-rc-02` returns `READY FOR FINAL AUDIT SWARM`.

Run these four agents in parallel on the SAME exact full SHA:
1. Functional adversarial
2. Security adversarial
3. Migration/recovery
4. Production readiness

Then run the consolidator.

If any P0/P1 is fixed, all previous audit verdicts are invalid because the SHA changed. Rerun all four audits.

Do not push, PR, merge, or deploy during this audit batch.
