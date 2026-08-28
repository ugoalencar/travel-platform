# Audit Logging

## Purpose

`audit_logs` is the security audit trail for sensitive tenant actions. It is
not a general request log and must not receive whole request bodies or raw
personal data.

## Record Model

Each record has an immutable id and occurrence time, trusted `agency_id`,
actor type and optional actor id, event type, entity reference, outcome, and
a constrained JSON metadata object. The application derives agency and actor
from the authenticated tenant context; callers cannot supply an agency id.

The typed service is `services/api/src/audit-log.ts`. It only accepts a small
metadata allowlist for operational facts such as status transitions, changed
field names, payment amount/currency/method, and request correlation ids.

Never record passwords, TOTP secrets, recovery codes, bearer or session
tokens, Authorization/Cookie headers, full CPF/passport values, or request
bodies. Do not use free-form operator notes or cancellation reasons as audit
metadata because they can contain unnecessary personal data.

## Tenant and Runtime Boundaries

`audit_logs` has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
Runtime reads and inserts are constrained to `current_agency_id()`. There are
no UPDATE or DELETE policies. Runtime role provisioning grants only SELECT
and INSERT; it must never grant UPDATE or DELETE.

Audit reads are deliberately an internal tenant-scoped service rather than a
public API in this stream. A future API must require a documented privileged
role, preserve tenant scope, and use bounded pagination and allowlisted
filters.

## Transaction Semantics

Critical mutations should call `recordAuditEvent()` with the same
`TenantTransactionClient` used for the domain change. An audit insertion
failure then aborts the transaction and prevents an unaccounted mutation from
committing. Payment recording follows this pattern.

Some event names are defined before their owning security/business stream is
implemented, including MFA, rate-limit, authentication, administration,
booking, proposal, sale, entitlement, and sensitive customer-profile events.
They are integration contracts only: this stream does not invent handlers or
import parallel stream code.

## Retention, Backups, and Export

Audit data must be included in encrypted database backups and restoration
tests. A retention duration and archival/deletion policy require legal, LGPD,
and cost-owner approval before implementation. Deletion, archival, export,
and SIEM shipping require a separate reviewed job and database role; they
must not run through the normal application runtime role or weaken tenant
RLS.

Future SIEM/export integration should read from a dedicated least-privilege
operational role, apply the same metadata minimization, record export job
identity and range, and never use `SECURITY DEFINER` as a shortcut.
