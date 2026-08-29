# Task 4: API Services Layer — Comprehensive Customer 360 Backend Implementation

## Overview
Implement complete API services layer for Customer 360. This task includes six service modules with full CRUD operations, masking utilities, OCR provider abstraction, document extraction/verification flows, audit logging, and route wiring. All endpoints tested with comprehensive test suite.

## Deliverables

### Part 1: Customer Addresses Service

**File:** `services/api/src/customer-addresses.ts`

Implements CRUD for structured addresses:
```typescript
export async function listAddresses(database, customerId): Promise<CustomerAddress[]>
export async function getAddressById(database, id): Promise<CustomerAddress | null>
export async function createAddress(database, data: CreateAddressInput): Promise<CustomerAddress>
export async function updateAddress(database, id, data: UpdateAddressInput): Promise<CustomerAddress | null>
export async function deleteAddress(database, id): Promise<CustomerAddress | null>
```

**Requirements:**
- Tenant-scoped queries using `getAgencyId()`
- Soft delete support (deletedAt field)
- Primary address uniqueness constraint (one per customer)
- Audit trail: record CUSTOMER_ADDRESS_CREATED, CUSTOMER_ADDRESS_DELETED events
- Input validation: street, number, district, city, state required
- Row mapping: snake_case DB → camelCase domain types

**Test Coverage:**
- CRUD operations
- Tenant isolation (cross-tenant denial)
- Primary address uniqueness
- Soft delete behavior
- Audit events recorded

---

### Part 2: Customer Dependents Service

**File:** `services/api/src/customer-dependents.ts`

Implements CRUD for dependents/companions:
```typescript
export async function listDependents(database, customerId): Promise<CustomerDependent[]>
export async function getDependentById(database, id): Promise<CustomerDependent | null>
export async function createDependent(database, data: CreateDependentInput): Promise<CustomerDependent>
export async function updateDependent(database, id, data: UpdateDependentInput): Promise<CustomerDependent | null>
export async function deleteDependent(database, id): Promise<CustomerDependent | null>
```

**Requirements:**
- Tenant-scoped queries
- Soft delete support
- Support all RelationshipType values (SPOUSE, CHILD, PARENT, COMPANION, OTHER)
- Audit trail: CUSTOMER_DEPENDENT_CREATED, CUSTOMER_DEPENDENT_DELETED events
- Name validation (non-blank required)
- Optional: birthDate, cpf, nationality, notes

**Test Coverage:**
- CRUD for all relationship types
- Tenant isolation
- Soft delete
- Audit events
- Name validation

---

### Part 3: Document Masking Utility

**File:** `services/api/src/document-masking.ts`

Implements PII masking functions:
```typescript
export function maskDocumentNumber(number: string, docType: DocumentType): string
export function maskCPF(cpf: string): string
export function shouldMaskInLogs(field: string): boolean
```

**Requirements:**
- `maskDocumentNumber`: Show first 3+ chars, mask remainder with * (e.g., "AB123456789" → "AB123456***")
- `maskCPF`: Format "123.***.***-**" format
- `shouldMaskInLogs`: Check if field name should be masked in logs
- Masking utilities used consistently in all logging

**Test Coverage:**
- Various document lengths
- CPF formatting
- Edge cases (short numbers, nulls)
- Log field detection

---

### Part 4: Customer Documents Service

**File:** `services/api/src/customer-documents.ts`

Implements document CRUD with masking:
```typescript
export async function listDocuments(database, customerId): Promise<CustomerDocument[]>
export async function getDocumentById(database, id): Promise<CustomerDocument | null>
export async function createDocument(database, data: CreateDocumentInput): Promise<CustomerDocument>
export async function updateDocument(database, id, data: UpdateDocumentInput): Promise<CustomerDocument | null>
export async function deleteDocument(database, id): Promise<CustomerDocument | null>
```

**Requirements:**
- Tenant-scoped queries
- Soft delete support
- Automatic expiry detection: `is_expired = expiryDate < CURRENT_DATE`
- Verification status tracking (PENDING, VERIFIED, MISMATCH, EXPIRED, MANUAL_REVIEW)
- Audit trail: CUSTOMER_DOCUMENT_CREATED, CUSTOMER_DOCUMENT_UPDATED, CUSTOMER_DOCUMENT_DELETED
- Document number validation (non-blank required)
- Support all DocumentType values (PASSAPORTE, RG, CNH, CPF, VISTO, CERTIDAO, OUTRO)

**Test Coverage:**
- CRUD for all document types
- Expiry detection
- Verification status workflow
- Tenant isolation
- Audit events
- Document number masking in logs

---

### Part 5: OCR Provider Abstraction

**File:** `services/api/src/ocr-provider.ts`

Defines extensible OCR provider contract (no vendor lock-in):
```typescript
export interface OcrProviderContract {
  name: string
  submitForExtraction(params: SubmitParams): Promise<string>
  getExtractionResult(taskId: string): Promise<ExtractionResult | null>
}

export interface SubmitParams {
  agencyId: string
  documentId: string
  attachmentId: string
  fileUrl: string
  documentType: string
}

export interface ExtractionResult {
  taskId: string
  status: 'processing' | 'completed' | 'failed'
  data?: Record<string, unknown>
  confidence?: number
  error?: string
}

export class MockOcrProvider implements OcrProviderContract { ... }
```

**Requirements:**
- Provider-agnostic interface (no Google Vision, AWS Textract, etc. hardcoded)
- MockOcrProvider for testing (returns sample data immediately)
- Future implementations: GoogleVisionProvider, TesseractProvider, AwsTextractProvider, etc.
- Extensible metadata handling via extracted_data JSONB

**Test Coverage:**
- Contract compliance
- Mock provider returns correct format
- Provider injection into extraction service

---

### Part 6: Document Extraction Service

**File:** `services/api/src/document-extraction.ts`

Implements OCR extraction flow with provider integration:
```typescript
export async function submitDocumentForExtraction(
  database, documentId, attachmentId, fileUrl, documentType, provider
): Promise<DocumentExtraction>

export async function completeDocumentExtraction(
  database, extractionId, extractedData, confidence?
): Promise<DocumentExtraction | null>

export async function getExtraction(database, id): Promise<DocumentExtraction | null>
```

**Requirements:**
- Tenant-scoped queries
- Provider-agnostic submission (provider injected as dependency)
- Track processing status: PENDING → PROCESSING → COMPLETED/FAILED
- Store extracted_data as JSONB (flexible schema)
- Store confidence score (0-100)
- Error handling and error_message logging
- Audit trail: EXTRACTION_STARTED, EXTRACTION_COMPLETED events

**Test Coverage:**
- Submission flow with mock provider
- Status tracking (PENDING → PROCESSING → COMPLETED)
- Error handling and error messages
- Confidence score handling
- Audit trail events

---

### Part 7: Document Verification Service

**File:** `services/api/src/document-verification.ts`

Implements verification flow (OCR extraction vs. customer record comparison):
```typescript
export async function createVerification(
  database, documentId, extractionId?, manualReviewNotes?
): Promise<DocumentVerification>

export async function verifyAgainstCustomer(
  database, documentId, extraction: DocumentExtraction
): Promise<DocumentVerification>

export async function getVerification(database, id): Promise<DocumentVerification | null>

export async function recordManualReview(
  database, verificationId, reviewedByUserId, notes
): Promise<DocumentVerification | null>
```

**Requirements:**
- Tenant-scoped queries
- Comparison logic: match extracted fields against customer + document records
  - holder_name vs. document.holderName
  - holder_birth_date vs. document.holderBirthDate
  - holder_nationality vs. document.holderNationality
  - document_number vs. document.documentNumber
- Discrepancies tracked in JSONB (field-by-field boolean matches)
- Manual review tracking: reviewed_at, reviewed_by_user_id, manual_review_notes
- Audit trail: VERIFICATION_COMPLETED events

**Test Coverage:**
- Exact field matches
- Mismatch detection
- Discrepancy reporting
- Manual review workflow
- Audit events
- Null/missing field handling

---

### Part 8: Document Attachment Service

**File:** `services/api/src/document-attachments.ts`

Implements file metadata management + abstraction:
```typescript
export async function createAttachment(
  database, documentId, attachmentType, fileName, fileSizeBytes, fileMimeType, secureFileKey
): Promise<DocumentAttachment>

export async function listAttachments(database, documentId): Promise<DocumentAttachment[]>

export async function deleteAttachment(database, id): Promise<DocumentAttachment | null>

export function validateFileType(mimeType: string): boolean
export function generateSecureFileKey(documentId: string, fileName: string): string
```

**Requirements:**
- Tenant-scoped queries
- Soft delete support (deletedAt field)
- File validation:
  - Allowed MIME types: image/* (png, jpg, jpeg, pdf, tiff)
  - Block executables (.exe, .bat, .sh, .com, etc.)
  - Max file size: 20MB (check at API layer, not DB)
- Secure file key generation (UUID-based, not user-controlled paths)
- File hash calculation (SHA256 for integrity checks)
- No full file paths stored (only metadata)
- Audit trail: ATTACHMENT_UPLOADED, ATTACHMENT_DELETED events

**Test Coverage:**
- File type validation
- MIME type checking
- Size validation
- Secure key generation
- Soft delete
- Audit events
- Malicious file blocking

---

### Part 9: Document Audit Service

**File:** `services/api/src/document-audit.ts`

Implements audit trail logging helpers:
```typescript
export async function recordAuditEvent(
  client, eventType: DocumentAuditEventType, data: { documentId?, attachmentId?, userId?, customerId?, metadata? }
): Promise<void>

export async function getAuditLog(database, customerId): Promise<DocumentAuditEvent[]>
export async function getDocumentAuditLog(database, documentId): Promise<DocumentAuditEvent[]>
```

**Requirements:**
- Insert-only logging (no updates/deletes to audit_events)
- Tenant-scoped queries
- Event types: DOCUMENT_CREATED, ATTACHMENT_UPLOADED, DOCUMENT_VIEWED, EXTRACTION_STARTED, EXTRACTION_COMPLETED, VERIFICATION_COMPLETED, DOCUMENT_SOFT_DELETED
- Metadata: flexible JSONB for additional context
- No PII in logs (use masking utility if needed)
- Chronological ordering (created_at DESC)

**Test Coverage:**
- Event recording
- Audit log retrieval (by customer, by document)
- Chronological order
- Metadata handling
- PII not logged

---

### Part 10: Express Route Wiring

**File:** `services/api/src/routes/customer-documents.ts`

Wire all endpoints:
```typescript
router.post('/customers/:customerId/addresses', createAddress)
router.get('/customers/:customerId/addresses', listAddresses)
router.get('/customers/:customerId/addresses/:addressId', getAddressById)
router.patch('/customers/:customerId/addresses/:addressId', updateAddress)
router.delete('/customers/:customerId/addresses/:addressId', deleteAddress)

router.post('/customers/:customerId/dependents', createDependent)
router.get('/customers/:customerId/dependents', listDependents)
router.get('/customers/:customerId/dependents/:dependentId', getDependentById)
router.patch('/customers/:customerId/dependents/:dependentId', updateDependent)
router.delete('/customers/:customerId/dependents/:dependentId', deleteDependent)

router.post('/customers/:customerId/documents', createDocument)
router.get('/customers/:customerId/documents', listDocuments)
router.get('/customers/:customerId/documents/:documentId', getDocumentById)
router.patch('/customers/:customerId/documents/:documentId', updateDocument)
router.delete('/customers/:customerId/documents/:documentId', deleteDocument)

router.post('/documents/:documentId/extract', submitForExtraction)
router.get('/documents/:documentId/extraction/:extractionId', getExtraction)

router.post('/documents/:documentId/verify', verifyDocument)
router.get('/documents/:documentId/verification', getVerification)

router.post('/documents/:documentId/attachments', uploadAttachment)
router.get('/documents/:documentId/attachments', listAttachments)
router.delete('/documents/:documentId/attachments/:attachmentId', deleteAttachment)

router.get('/customers/:customerId/audit-log', getCustomerAuditLog)
router.get('/documents/:documentId/audit-log', getDocumentAuditLog)
```

**Requirements:**
- All endpoints use tenant context from `getAgencyId()`
- Error handling with appropriate HTTP status codes
- Input validation before service calls
- Response mapping: snake_case DB rows → camelCase JSON

---

### Part 11: Test Suite

**Files:**
- `services/api/tests/customer-addresses.test.ts` — Address CRUD + tenant isolation
- `services/api/tests/customer-dependents.test.ts` — Dependent CRUD + soft delete
- `services/api/tests/customer-documents.test.ts` — Document CRUD + expiry
- `services/api/tests/document-masking.test.ts` — Masking utilities
- `services/api/tests/ocr-provider.test.ts` — Provider contract + mock
- `services/api/tests/document-extraction.test.ts` — Extraction flow
- `services/api/tests/document-verification.test.ts` — Verification logic
- `services/api/tests/document-attachments.test.ts` — File validation + metadata
- `services/api/tests/document-audit.test.ts` — Audit trail logging
- `services/api/tests/customer-documents-routes.test.ts` — Express route integration

**Coverage Requirements:**
- All CRUD operations (create, read, update, delete)
- Tenant isolation (cross-tenant denial)
- Soft delete behavior
- Audit trail verification
- Masking in logs
- Provider abstraction (mockable)
- File validation
- Cross-field comparisons (verification)
- Error handling (invalid inputs, missing resources)

---

## Implementation Notes

### Tenant Context
All services use `getAgencyId()` from `packages/domain/tenant-context.ts`. This is set by the API authentication middleware before route handlers.

### Database Runtime
All services accept `database: DatabaseRuntime` parameter (injected by Express middleware). Use `database.withTenantTransaction()` for DB operations.

### Audit Trail Integration
Use existing `recordAuditEvent()` pattern (already in codebase) or implement document-specific version. All CRUD operations must log events.

### File Abstraction
Document attachment storage uses:
- `secureFileKey`: UUID or hash-based identifier (NOT user filename)
- `fileName`: original filename (for display only)
- File content stored externally (S3, local disk, cloud storage TBD)
- API never exposes full file paths
- File URL generation uses `generateSecureFileKey()` + resolver pattern

### OCR Provider Extensibility
The OcrProviderContract allows:
- Mock implementation for testing (immediate results)
- Google Vision implementation (async polling)
- AWS Textract (async polling)
- Tesseract (local processing)
- Custom implementations without changes to extraction service

---

## Quality Gates

- [ ] Typecheck: `npx tsc --noEmit` (no errors)
- [ ] Lint: `npm run lint` (no errors)
- [ ] Tests: `npm test -- services/api` (all passing, >80% coverage)
- [ ] Security: No PII in logs, no hardcoded credentials, file validation strict
- [ ] Build: `npm run build` (no errors)

## Global Constraints (verify all)

- ✓ Tenant-scoped queries (getAgencyId() on all DB access)
- ✓ Soft delete support (no permanent deletes except audit-event purge)
- ✓ PII masking (no full document numbers, CPF in logs)
- ✓ File abstraction (no blob storage in DB, metadata only)
- ✓ Audit trail (all CRUD events recorded)
- ✓ OCR provider-agnostic (contract interface only)
- ✓ Comprehensive test coverage (CRUD, isolation, security, edge cases)
- ✓ P0 = 0, P1 = 0 (no errors, no warnings)

## Report File

Write to: `D:\travel-platform\.superpowers\sdd\task-4-report.md`

Include:
1. All 8 services implemented (yes/no)
2. All endpoints wired (yes/no)
3. Test results: pass/fail, coverage %
4. Typecheck, lint, build results
5. Commits (base, head, log)
6. Any concerns or deviations

## Success Criteria

- [ ] All 8 service files created + implemented
- [ ] All endpoints wired in routes file
- [ ] 9+ test files with comprehensive coverage
- [ ] Typecheck passes: `npx tsc --noEmit`
- [ ] Lint passes: `npm run lint`
- [ ] Tests pass: `npm test -- services/api` (all green)
- [ ] Build passes: `npm run build`
- [ ] No P0/P1 issues
- [ ] Commit: "feat(api): implement comprehensive Customer 360 API services (addresses, dependents, documents, OCR, audit)"
- [ ] Report completed
