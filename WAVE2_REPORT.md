BRANCH: feature/mega-ocr
HEAD: 5de1b29 feat(ocr): per-field confidence, human review UI, and polish for Customer 360 OCR flow
BASE MAIN: fe1d3f1 fix(tests): financial-http.test.ts missing migrations for permission_restrictions

SCOPE:
Agent 06 (OCR / Document Extraction). Finished the OCR extraction/verification vertical that was
already largely built in this worktree's working tree:
1. Verified per-field confidence tracking end to end: migration 052 (additive `field_confidence`
   JSONB column on `document_extractions`), `packages/domain/types.ts`, `document-extraction.ts`
   (normalize/persist/read), `ocr-provider.ts` (`ExtractionResult.fieldConfidences`, mock provider
   support), and the HTTP routes/response shape in `customer-documents.ts`.
2. Built the missing human-review UI: `DocumentOcrReview` in
   `apps/agency/src/pages/CustomerDetailPage.tsx`, wired into the "documents" tab. It fetches the
   latest COMPLETED extraction for a document, shows each candidate field (holderName,
   holderBirthDate, holderNationality, documentNumber, issuingCountry, expiryDate) next to its
   confidence, flags anything under 70%, and applies only staff-selected fields via one PATCH to
   the document -- never automatically. It then calls `verifyDocumentExtraction` to record the
   review for audit. This replaced a static "Aguardando extração" placeholder that left
   `listDocumentExtractions` and `verifyDocumentExtraction` imported but dead code.
3. Fixed an unsafe enum comparison (`extraction.processingStatus !== 'PROCESSING'` vs the
   `OcrProcessingStatus` enum) in the poll-extraction route, caught by eslint
   `@typescript-eslint/no-unsafe-enum-comparison`.
4. Did not touch Auth/Tenant/RLS core, RBAC hierarchy, other migrations, or finance formulas.
5. Did not merge to main.

MIGRATIONS:
infrastructure/migrations/052_document_extractions_field_confidence.sql -- single additive
`ALTER TABLE document_extractions ADD COLUMN field_confidence JSONB` (nullable, backward
compatible with providers that only report one overall score, e.g. the mock).

RLS: PASS
The base table `document_extractions` already has `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL
SECURITY`, and tenant-scoped SELECT/INSERT/UPDATE/DELETE policies keyed on
`agency_id = current_agency_id()` since migration 023_customer_360_rls.sql. Migration 052 only
adds a column to that table, so it inherits the existing RLS/FORCE RLS/policy set automatically --
nothing new to enable.

TENANT ISOLATION: PASS
Every extraction/verification read and write in document-extraction.ts and
document-verification.ts derives `agencyId` from `getAgencyId()` (ambient tenant context) and
scopes every query by it; routes run behind `protectedHooks` (authenticate + establishTenant).
The new review UI never sends a tenant id from the client -- it PATCHes through
`updateCustomerDocument(customerId, documentId, fields)`, which is itself tenant-scoped
server-side. Covered by the existing cross-tenant assertions in
customer-documents-routes.test.ts (all 63 passing).

RBAC: PASS (unchanged)
No role-hierarchy code was touched. Extraction/verification routes still gate on `requireRole`
as before; not modified in this change beyond the enum-comparison fix.

AUDIT: PASS
`completeDocumentExtraction` records an `EXTRACTION_COMPLETED` audit event with field names only
(never extracted values, per NON_NEGOTIABLES.md "sem dados sensíveis em logs"). The new review UI
calls `verifyDocumentExtraction`, which persists a `document_verifications` row tying the accepted
fields back to the source extraction for audit trail purposes.

LINT: PASS
`npx eslint` clean on all touched files (services/api/src/document-extraction.ts,
ocr-provider.ts, routes/customer-documents.ts, apps/agency/src/pages/CustomerDetailPage.tsx) after
fixing the enum comparison and an unnecessary type assertion.

TYPECHECK: PASS
`npx tsc --noEmit` clean in both services/api and apps/agency.

UNIT: PASS
102/102 tests passing across the three OCR-scoped suites, run directly and synchronously:
- tests/customer-documents-routes.test.ts (63 tests)
- tests/document-extraction.test.ts (27 tests)
- tests/ocr-provider.test.ts (12 tests)

INTEGRATION: NA (environment-gated, pre-existing, unrelated)
Ran the full services/api suite. DB-backed integration/e2e files (sale-routes.test.ts,
customer-e2e.test.ts, transportation-e2e.test.ts, etc.) fail at `resetDisposableDatabase` with a
child-process spawn error -- they require a disposable Postgres via docker-compose that is not
available in this sandbox. Confirmed this is an environment limitation, not a regression: the
failure is a spawn/setup error (not an assertion failure), none of those files were touched by
this change, and they were already failing the same way before any Agent 06 work began.

BUILD: PASS
`npm run build` in apps/agency (tsc --noEmit + vite build) succeeds; output chunk-size warning
only (pre-existing, unrelated to this change).

KNOWN GAPS:
- No dedicated component test was written for `DocumentOcrReview` (no existing test harness for
  CustomerDetailPage in this repo; adding one would have meant building page-level test
  infrastructure from scratch). Coverage instead rests on: tsc, eslint, vite build, and the 102
  passing backend tests that exercise every API path the component calls
  (list/submit/poll/verify). A human should click through the "documents" tab once against a
  running dev API before this ships.
- Confidence handling for `documentType`/`issuedDate` fields extracted by the provider but not in
  `OCR_REVIEW_FIELDS` is intentionally out of scope -- those aren't reviewable/applicable fields on
  `CustomerDocument` in the current schema.
- Browser smoke test not run (no dev server / browser session available in this pass); relied on
  tsc + build + backend test coverage instead.

WORKTREE: CLEAN (all changes committed at 5de1b29)
HUMAN DECISION REQUIRED: NO

FINAL VERDICT:
READY FOR INTEGRATION
