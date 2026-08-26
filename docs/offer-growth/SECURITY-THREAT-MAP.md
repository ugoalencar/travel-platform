# Security Threat Map — Offer & Growth Engine Stream B

Documentation only. No changes to `packages/domain/tenant-context.ts`, RLS
policies, `ROLE_HIERARCHY`, or dev-auth mechanisms were made or are proposed
here.

## External webhooks (future channel-connector callbacks)

- Risk: forged webhook calls (fake "publication succeeded" / "engagement"
  events) if endpoints aren't signature-verified per-platform.
- Risk: replay of a legitimate webhook payload.
- Mitigation direction (not implemented): verify platform-specific HMAC
  signatures before trusting payload; treat webhook body as untrusted input
  requiring the same validation rigor as any user input, never as an
  implicitly-trusted system event.

## Connector credential storage

- Risk: a channel OAuth token / API key stored in plaintext in a normal
  table becomes a full-agency-compromise vector if the DB is ever exposed.
- Current state: **no encrypted-secrets abstraction exists in this repo
  today.** This must be built (per envelope-encryption or a secrets-manager
  integration) before any real connector ships — never store a token in
  frontend code (confirmed: nothing today does), and never store one in a
  plain schema column either.
- This is explicitly deferred to whoever implements #6 for real — only
  interface-shape mocks were built here (see IMPLEMENTATION-HANDOFF.md).

## External URL fetching (SSRF risk)

- Any future feature that fetches a URL supplied by a user (e.g. "import an
  image from this link" for Pescador or a creative) is an SSRF vector
  against internal infrastructure (metadata endpoints, internal services).
- Mitigation direction: allowlist schemes (https only), resolve and check
  the destination isn't a private/link-local IP range before fetching, use
  a fetch timeout and size cap, never fetch server-side with credentials
  attached that a user-controlled destination could capture.

## Malicious media upload

- No upload path exists yet (confirmed in CURRENT-INTEGRATION-MAP.md). When
  one is built: validate actual file content type (not just claimed
  MIME/extension), enforce size limits, strip EXIF/metadata that could leak
  data, never execute or interpret uploaded content server-side, serve from
  a separate origin/CDN with no ability to run scripts in the app's origin.

## HTML/template injection in creative rendering

- If a future Creative Engine renders user-authored text into HTML (or into
  any templated output shared with a customer or a social platform), this is
  a stored-XSS vector unless every text field is escaped in the same way
  React already escapes by default. A future non-React rendering path
  (server-side HTML generation, PDF/image render) must not lose that
  guarantee — plain string concatenation into markup would reintroduce it.
- The abstract `types.ts` skeleton built in this stream deliberately has no
  rendering implementation, so this risk isn't yet realized — flagged for
  whoever builds the renderer.

## Social-platform impersonation

- Risk: a connector publishing under a customer-facing brand identity could
  be abused if connector-account linkage isn't strictly agency-scoped and
  re-verified server-side on every publish call (never trust a
  client-supplied "which connector" identifier without checking it belongs
  to the calling agency).

## Automation loops

- Risk: an automation whose action can itself satisfy its own trigger
  condition (e.g. "on stage change, move to stage X" retriggering "on stage
  change") causing infinite execution.
- Mitigation direction: any real Automation implementation needs cycle
  detection or execution-count/rate limiting per entity per time window
  before it ships — not built here (only abstract `Trigger`/`Action`/
  `ExecutionResult` interfaces with no persisted execution logic, so this
  risk is not yet realized in code).

## Spam

- Coupon and automation systems both create spam vectors (mass coupon
  redemption attempts, automation-driven message floods to customers). Rate
  limiting and abuse-detection are app-layer concerns for whoever implements
  these — not addressed here.

## Coupon abuse

- Risk: single-use coupons redeemed multiple times absent a DB-level
  constraint (e.g. unique redemption row per coupon+customer, or an atomic
  decrement-with-check on a use-count column) — a naive
  "check-then-use" without a DB constraint is a race condition.
- Mitigation direction: mirror the same atomic-update-with-WHERE-clause
  pattern already used in `updateOffer` (`services/api/src/offers.ts:130-157`)
  for its validity-range check — do the invariant check inside the same
  UPDATE, not as a separate SELECT beforehand.

## Encrypted-secrets requirement (explicit, per task #16)

Restating plainly: any future channel-credential storage requires an
encrypted-secrets/config abstraction that does not exist in this codebase
today. No real secret was added, referenced, or scaffolded by this stream.
Building that abstraction is a prerequisite for real connector
implementations, not something this preparation pass could safely stub
(secrets infra deserves a dedicated, reviewed design, not a placeholder).
