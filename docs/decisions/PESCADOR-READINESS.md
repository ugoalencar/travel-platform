# Pescador (External Offer Capture) — Readiness Documentation

**Status:** Pure documentation of a future flow. No scraping code, no
provenance fields added to `Offer`, no schema/migration written here.

Verified: no `pescador`, `scraping`, or `external-capture`-named file exists
anywhere in the repository as of this pass, and `Offer`
(`packages/database/schema.prisma`) has exactly `id`, `agencyId`, `name`,
`description`, `price`, `validFrom`, `validUntil`, `status`, timestamps —
no source/provenance columns of any kind. This document assumes that
starting point.

---

## 1. Target flow

```
ExternalCapture → Normalization → Human Review → Offer
```

An `Offer` row must never be created directly from unreviewed external
input — the boundary between "captured" and "published as a real Offer" is
a human decision point by design (this is a repeat of a principle already
stated in prior product-vision material: automation must not silently
publish commercial content).

## 2. Inputs

External sources are unspecified/future (partner feeds, manual paste,
future crawling) — this document does not assume or design any specific
source integration, scraper, or scheduling mechanism. Whatever the source,
an `ExternalCapture`-shaped record would need at minimum: raw captured
content, a source identifier, and a captured-at timestamp, kept entirely
separate from `Offer` until reviewed.

## 3. Review workflow (conceptual, not implemented)

1. Capture lands in a staging area (not `Offer`).
2. Normalization maps raw content into an `Offer`-shaped candidate
   (name, description, price, validity window) without writing to `Offer`.
3. A human reviewer inspects the candidate against the raw source.
4. Reviewer approves (creates a real `Offer` row through the existing,
   unmodified `Offer` creation path — same validation, same tenant scoping,
   same RBAC as any manually created Offer) or rejects (candidate is marked
   rejected, nothing is created).
5. No automatic promotion path from capture to `Offer` should exist —
   review is mandatory, not optional/bypassable.

## 4. Security concerns

- **Injection/spoofing via captured content**: raw external content is
  untrusted input. Normalization must not feed raw fields directly into
  any query construction — same discipline the codebase already applies
  everywhere else (parameterized queries throughout `services/api/src/*`,
  per the existing security model referenced in
  `docs/03-security/security-model.md`).
- **Tenant scoping of captures**: if captures are agency-specific (e.g. an
  agency's own partner feed) rather than global, `ExternalCapture` would
  need the same `agencyId`-first-column, RLS-enforced pattern as every
  other table in this schema (ADR-002) — not a new isolation model.
- **Reviewer authorization**: approving a capture into a real `Offer`
  should go through the same RBAC checks (`requireRole`) that manual Offer
  creation already uses — a reviewer without Offer-write privilege
  shouldn't be able to publish via a side door.
- **No auto-publish**: the single hard security/product requirement is that
  no code path exists that creates an `Offer` from a capture without a
  human approval action in between. This document does not propose any
  schema or code, so there is nothing to audit yet — but any future
  implementation should be reviewed specifically for this invariant.

## 5. Source provenance

Provenance (which source, what URL, when captured, how normalized) should
live entirely on the capture/staging record, never on `Offer` itself — this
mirrors the existing product-vision principle that `Offer` should not be
polluted with scraping/importation-specific fields. This document does not
add such fields to `Offer` and explicitly recommends against doing so when
this is eventually implemented; provenance belongs to the capture record,
which can optionally retain a link back to the `Offer` it produced (a
one-way reference from capture to the resulting Offer, not the reverse).

## 6. Deduplication

Not implemented, not designed here. Open questions for a future design pass
(not answered by this document): dedupe on exact source+URL match, on
normalized-content similarity, or left entirely to human reviewer judgment
at approval time. No existing code or table in this repository addresses
deduplication of any kind today.

## 7. Future scheduling

Not implemented, not designed here. Whatever capture mechanism exists
eventually (partner feed polling, manual import, etc.) is out of scope for
this document — this pack deliberately contains no scraping code and no
scheduling design, per the task constraints under which it was written.

## 8. The Offer-publishing boundary

What would need to be true for a reviewed external capture to safely become
a real `Offer` row without bypassing existing validation:

1. The approval action must call the **same** Offer-creation code path used
   by manual Offer creation today (not a parallel/duplicate insert) — so
   every validation rule that already applies to a manually created Offer
   (required `name`, `price >= 0`, tenant scoping) applies identically.
2. The approval action must be tenant-scoped and RBAC-checked exactly like
   any other Offer-write today — no special "system" bypass.
3. The resulting `Offer` row must be indistinguishable in shape from a
   manually created one — no provenance columns added to `Offer` (see
   Section 5) — so nothing downstream (Proposal creation, Customer Portal
   offer listing, expiration-at-read-time logic) needs to special-case
   externally-sourced offers.
4. The capture/staging record, not `Offer`, is the audit trail for "where
   did this come from and who approved it."

## References
- `packages/database/schema.prisma` (`Offer` model, current fields only)
- ADR-004 (prior note that Pescador should not be part of V1 and that
  external provenance should not be coupled to `Offer`) —
  `docs/adr/ADR-004-domain-modeling-wish-customer-sale-booking.md`
- `docs/03-security/security-model.md`
- `docs/adr/ADR-002-multitenancy.md`
