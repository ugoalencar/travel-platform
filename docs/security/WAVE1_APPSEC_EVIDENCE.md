# AppSec Wave 1 — Evidence & Runbook

Branch: `feature/security-appsec-wave1` (isolated worktree `D:\.worktrees\security-appsec-wave1`).
Scope: services/api (Node/TypeScript, Prisma-free raw `pg` + parameterized SQL), apps/ frontends.

## 1. SQL Injection

**Ruled out (verified by grep, still true after this wave):**
- No `$queryRawUnsafe` / `$executeRawUnsafe` anywhere in `services/api/src`.
- No Prisma usage in `services/api/src` at all — persistence goes through `pg.Pool`/`pg.Client` with tagged parameterized queries (`client.query(sql, [params])`) throughout (49 files use this pattern, e.g. `services/api/src/customers.ts`, `services/api/src/trips.ts`, `services/api/src/wishes.ts`).
- No dynamic `ORDER BY`, dynamic column, or dynamic table-name construction via string concatenation or template-literal interpolation found anywhere in `services/api/src` (`grep -n "ORDER BY \$\{"` and similar patterns: zero matches). All `ORDER BY` clauses are static literals in the query string; sorting is not user-controlled.
- Conclusion: no SQL-injectable code path exists today. No fix required, no regression test added for this category since there is no vulnerable endpoint to regress-test — adding one would create a false positive testing surface. If a future PR adds dynamic sort/filter, it must whitelist-validate the column/direction the same way `services/api/src/ssrf-guard.ts` whitelists IP ranges.

## 2. SSRF (Pescador) — CONFIRMED, FIXED

**File:** `services/api/src/pescador.ts`, function `extractOfferFromUrl` (originally lines 91-140).

**Vulnerabilities confirmed before fix:**
1. No blocking of loopback / RFC1918 / link-local / `169.254.169.254` cloud-metadata addresses.
2. No re-validation of the DNS-resolved IP before connecting (classic resolve-then-connect DNS-rebinding TOCTOU).
3. `redirect: 'follow'` chased redirects with no re-validation of the redirect target and no hop cap.
4. Full response buffered via `response.text()` before the `MAX_RAW_CONTENT_LENGTH` truncation was applied — no streaming size cap, so a huge/slow-drip response could exhaust memory before truncation ever ran.

**Fixes applied:**
- New module `services/api/src/ssrf-guard.ts`:
  - `isBlockedIp()` — blocklist covering 0.0.0.0/8, 10/8, 100.64/10 (CGNAT), 127/8, 169.254/16 (incl. metadata), 172.16/12, 192.0.0/24, 192.0.2/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4 for IPv4; `::1`, `::`, IPv4-mapped (`::ffff:a.b.c.d`), `fc00::/7` (ULA), `fe80::/10` (link-local, covers IPv6 metadata forms) for IPv6.
  - `resolveAndValidateHost()` — resolves the hostname via `dns.promises.lookup` and validates the *resolved* address, not the hostname string, closing the DNS-rebinding gap.
  - `assertPublicHttpUrl()` — protocol allowlist (http/https only) plus literal `localhost`/`*.localhost`/`169.254.169.254` short-circuit.
- `services/api/src/pescador.ts` (`extractOfferFromUrl`, now ~line 99-165):
  - Replaced `redirect: 'follow'` with `redirect: 'manual'` and a hand-rolled loop that validates the target host (via `resolveAndValidateHost`) **before every hop**, including hop 0, caps hops at `MAX_REDIRECTS = 5`, and re-validates each `Location` target with `assertPublicHttpUrl` before following it.
  - Replaced `response.text()` with a new `readBodyWithCap()` helper that reads the stream chunk-by-chunk via `response.body.getReader()` and cancels the stream once `MAX_RESPONSE_BYTES` (2 MiB) is exceeded, throwing before the string is ever fully materialized.
  - Outbound request headers are a minimal explicit `Accept` header only — no cookies or inbound headers are ever forwarded (this was already true before the fix; confirmed unchanged).
  - Kept `EXTRACTION_TIMEOUT_MS = 8000` unchanged.
  - Protocol validation (http/https only) preserved via `assertPublicHttpUrl`.

**Tests added:** `services/api/tests/pescador-ssrf.test.ts` (no DB/Docker dependency, runs standalone):
  - blocks direct requests to loopback (`127.0.0.1`)
  - blocks direct requests to `localhost`
  - blocks requests to `169.254.169.254` (cloud metadata)
  - unit-level blocklist coverage: `10.0.0.5`, `172.16.5.5`, `192.168.1.1`, `169.254.169.254`, `127.0.0.1`, `::1`, `fe80::1`, `fc00::1` all blocked; `8.8.8.8`, `1.1.1.1` allowed
  - a same-origin (loopback) redirect target is blocked at hop 0 before any redirect is followed
  - malformed URL and non-http(s) protocol (`file://`) rejected

  Run: `cd services/api && npx vitest run tests/pescador-ssrf.test.ts`

**Known residual limitation (documented, not fixed in this wave):** the redirect-chain test exercises hop-0 blocking (our test server binds to loopback, so it's blocked immediately) rather than "public origin redirects to a private IP two hops in," because standing up a real publicly-routable test origin is not possible from this sandbox. The manual-redirect loop code path does re-run `resolveAndValidateHost` on every hop unconditionally (see the `for (;;)` loop in `extractOfferFromUrl`), so hop-N validation is exercised by the same code as hop-0 validation — but this is a code-reading argument, not an end-to-end test of hop ≥1. Recommend a follow-up integration test using a real internet-reachable redirector (e.g. httpbin-style service) if this must be closed with an end-to-end test.

## 3. IDOR / BOLA

**Verified pattern (not a gap):** every persistence function reviewed (`services/api/src/customers.ts`, `trips.ts`, `wishes.ts`, `pescador.ts`, and the other ~45 files matched by the SQL grep) scopes every read/update/delete query by `WHERE agency_id = $1 AND id = $2` (or via `getAgencyId()` pulled from tenant context, never from the request body/params). `lockCapture`/`loadOffer` in `pescador.ts` (lines 463-492) are representative: both require `agency_id = $1` in addition to `id = $2`, so a cross-tenant ID returns `NotFoundError` (404), not the other tenant's row.
- Existing tests `services/api/tests/customer-routes.test.ts`, `customers.test.ts`, `trip-routes.test.ts`, `wish-routes.test.ts` already assert tenant-isolation and role-based access (confirmed by reading — not modified in this wave since no gap was found requiring a fix).
- `services/api/tests/pescador-http.test.ts` (pre-existing) already has a `'enforces RBAC and tenant isolation'` test proving Tenant B's owner gets 404 on Tenant A's capture ID, and role-gating on create/publish.
- **No unguarded resourceId route was found.** No code change made in this category, per the "if no gap, don't invent a fix" instruction.

## 4. Uploads

**No real binary file-upload endpoint exists in `services/api/src`.** `services/api/src/routes/customer-documents.ts` accepts document *metadata* only (`fileSizeBytes`, `fileMimeType`, `fileHash`, `fileName` — all client-reported strings/numbers persisted as attachment records; see `parseCreateDocumentAttachmentInput`, ~line 970-1017), with a server-side `MAX_ATTACHMENT_BYTES` bound on the declared size. There is no `multipart`, no `@fastify/multipart`, and no code path that receives or stores actual file bytes, so there is no MIME-sniffing, path-traversal, or filename-sanitization surface to hardened in this codebase today. Noting this explicitly per the brief rather than inventing an upload endpoint. If/when real binary upload is added, it must MIME-sniff (not trust `fileMimeType`), sanitize the filename (reject `..`, null bytes, absolute paths), and scope storage paths by `agencyId`.

## 5. Public Tokens

**No public-token-issuing code path found** (no share links, no signed URLs, no `randomBytes`/`randomUUID` token generation tied to a "public" or "share" concept in `services/api/src`). Auth session/JWT tokens exist (`dev-auth.ts`, `production-auth.ts`) but are a structural auth concern, out of scope for this wave and not touched. Nothing to fix; nothing invented.

## 6. Webhooks

**No webhook receiver endpoint found** in `services/api/src/app.ts` or elsewhere (`grep -rn "app.post.*webhook"` and similar: zero matches). The only hits for "webhook" are a code comment in `automations.ts` about duplicate-delivery idempotency for a not-yet-built feature, and connector/rate-limit scaffolding unrelated to inbound webhook signature verification. Nothing to fix; nothing invented.

## 7. XSS / CSRF

**Ruled out (re-verified):**
- `grep -rn "dangerouslySetInnerHTML"` across `apps/` source (excluding `dist/`/`node_modules/`) returns zero matches — confirmed unchanged from the pre-existing finding.
- `@fastify/helmet` is already a declared dependency (`services/api/package.json`) — confirms security headers (CSP, etc.) are wired via Fastify's helmet plugin. Not modified in this wave (already present, no header-hardening gap identified as low-risk-and-missing).
- CSRF: no cookie-session auth mechanism found in the reviewed API surface (`dev-auth.ts`/`production-auth.ts` use bearer-style tokens, not cookies, for the paths reviewed) — SameSite/Origin-check hardening is a structural auth-mechanism question, flagged below rather than changed.

## Flagged for human approval (NOT implemented, per AUTONOMY.md)

- None of the structural Auth/Tenant/RLS/RBAC, secrets/provider, or destructive-DB categories were touched — no gaps found in this wave that would have required such a change. If the team later adds a real binary upload endpoint, a public-token/share-link feature, or a webhook receiver, those should go through a fresh security pass since none currently exist for this wave to hard-check end-to-end.

## Test / build results

- `services/api` dependencies installed fresh in the worktree (`npm install`, no root `node_modules` was present).
- `npx tsc -p tsconfig.json --noEmit` — clean, no errors.
- `npm run lint` — 0 errors, 19 pre-existing warnings (all in files untouched by this wave: `app.ts`, `financial.ts`, `platform-routes.ts`, `settings-queries.ts`, `tests/rate-limit.test.ts`).
- `npx vitest run tests/pescador-ssrf.test.ts` — 8/8 passed.
- Full `npm test` (all suites, including Docker/Postgres-backed integration tests) — see final report for pass/fail summary; Docker Desktop is available in this environment.

## Commits

See `git log feature/security-appsec-wave1` — commits stage specific files only (never `git add -A`).
