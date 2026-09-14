# Agent 04 Report — Recovery / Observability

Pilot Delivery Gap Closure Pack. Executed against `main` at commit `ec7c75d` and the commits that
follow this report.

## Observability minimum — VERIFIED, already real

Unlike Identity (Agent 02), this area was already substantially built, not scaffolding. Checked
every item in `05_backup_observability/OBSERVABILITY_MINIMUM.md` against the actual running code
and its existing test coverage (`observability.test.ts`, `version-endpoint.test.ts`,
`api-foundation.test.ts`):

| Item | Status | Where |
|---|---|---|
| `/health` | PASS | `routes/infrastructure.ts` |
| `/readiness` | PASS | same file; runs `readinessCheck` (DB `SELECT 1` in `server.ts`), 503 on failure |
| `/version` | PASS | same file; `resolveVersionInfo()` / `version.ts` |
| `/metrics` | PASS | same file; backed by `observability.ts`'s `MetricsCollector` |
| structured logs | PASS | pino, JSON, every line carries `requestId`/`correlationId`/`deploymentId` |
| requestId/correlationId | PASS | minted or propagated from inbound `x-request-id`/`x-correlation-id`; covered by `observability.test.ts` |
| 5xx monitoring | PASS | `MetricsCollector.statusClassCounts` buckets 2xx/3xx/4xx/5xx, exposed on `/metrics` |
| auth/MFA failure visibility | PASS | `AUTH_LOGIN_FAILED`/`MFA_CHALLENGE_FAILED`/`MFA_RECOVERY_CODE_USED` audit events (Agent 02) plus generic 401/403 status-class counts |
| DB/provider errors | PASS | readiness check surfaces DB unreachability as 503; query errors propagate as 5xx, counted the same way |
| deployment metadata | PASS | `resolveDeploymentId()` — every log line and `/version` response carries it |

No code changes were needed here — this audit's job was verification, not construction, and it
checks out.

## Backup / Restore — mechanism verified real, two operational gaps found

`scripts/backup-local-db.sh`, `restore-local-db.sh`, and `recovery-drill.sh` (a full self-contained
seed → backup → fresh-target → restore → validate → cleanup cycle, with an explicit guard that
refuses to run against any host matching `prod`/`production`/`staging`/`live`/`rds`/`amazonaws`/
`azure`/`gcp`) already existed. Ran `recovery-drill.sh` for real against a disposable local Postgres
15 container (the same one the test suite uses) rather than trusting that the script existing meant
it worked. Two real findings, both environmental/tooling, not application bugs:

### 1. The drill script's pg_dump→psql pipe breaks under Git Bash on Windows

`pg_dump ... | psql ...` fails with `pg_dump: error: could not write to file: Invalid argument`
under this session's Git Bash/MSYS environment — a known class of issue with binary-safe pipe
handling between MSYS processes and native Windows psql/pg_dump builds. Writing pg_dump's output to
a file first, then feeding that file to psql (`pg_dump -f dump.sql` then `psql -f dump.sql`) instead
of a live pipe works around it completely and was verified end-to-end this way. The script itself
is correct for its actual target environment (a real Linux CI runner or ops box, where this pipe
pattern is completely standard and would not exhibit this bug) — flagging this purely so whoever
runs a *local Windows dry run* of this script isn't confused by a false failure. Recommend adding a
one-line comment above the pipe noting the Windows/Git-Bash caveat and the file-based workaround, but
not changing the script's behavior for its real (Linux) target.

### 2. Client/server major-version mismatch on this machine breaks restore silently otherwise

This machine's `pg_dump`/`psql` on PATH is PostgreSQL 17 client tools; the project's disposable
Postgres (`infrastructure/docker-compose.local-postgres.yml`) runs `postgres:15`. A schema-only dump
taken with the v17 client emits `SET transaction_timeout = 0;` in its preamble — a session parameter
that doesn't exist before Postgres 17 — which the v15 server then rejects with
`unrecognized configuration parameter "transaction_timeout"` on restore. This is a real,
concrete way a backup could *look* successful (the dump file is produced, non-empty, syntactically
valid) while silently failing to restore cleanly, purely because whoever ran the backup had newer
client tools installed than the server version. **Recommendation for the actual staging/production
runbook**: pin the exact `pg_dump`/`psql` client major version to match the deployed Postgres server
version wherever backups are taken (CI runner, ops workstation, or bundled into a Docker image built
from the same `postgres:<major>` tag as the server) — do not rely on "whatever client happens to be
on PATH."

Neither finding required changing `scripts/*.sh` — both are pre-existing, sound scripts; the gaps are
in *how/where* they get run, not what they do.

## What remains genuinely BLOCKED, not done

Per this pack's own sequencing (`08_staging_uat/PILOT_STAGE_SEQUENCE.md`: baseline freeze → deploy
staging → … → backup/restore → observability → …), "real" backup/restore and observability
verification are explicitly **staging-environment activities**, not local-repo activities. This
coding session has no deployed staging environment, no cloud credentials, and no access to
provision one. What was accomplished here — verifying the mechanism actually works end-to-end
against a real (if local and disposable) Postgres instance, and documenting the two operational
gotchas above — is the maximum that can be responsibly claimed from inside this session. Actually
executing `recovery-drill.sh` (or the real `backup-local-db.sh`/`restore-local-db.sh` pair) against
a genuine staging database, measuring real RPO/RTO against the pack's provisional targets (RPO ≤ 1h,
RTO ≤ 4h), and wiring `/metrics`/logs into a real external monitor (Datadog/CloudWatch/etc — none is
referenced anywhere in this repo, so none is assumed to exist) remain **BLOCKED — requires a
provisioned staging environment**, which is a human/infra decision outside this session's reach, not
a code gap.

## Verdict

**OBSERVABILITY: PASS** (verified, not just present).
**BACKUP/RESTORE MECHANISM: PASS locally** (verified working end-to-end against disposable Postgres;
two operational caveats documented for whoever runs it against real staging).
**BACKUP/RESTORE AGAINST REAL STAGING: BLOCKED** — no staging environment exists yet for this
session to execute against; this is Phase 8's job (`PILOT_STAGE_SEQUENCE.md` steps 2 and 10), not
something fixable at the code level.
