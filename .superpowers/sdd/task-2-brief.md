# Task 2: Domain Types — Customer 360 TypeScript Interfaces & Enums

## Overview
Add comprehensive TypeScript type definitions to `packages/domain/types.ts` for all Customer 360 entities. This task defines the contract between API services and frontend components.

## Deliverables

**File:** `packages/domain/types.ts` (APPEND ONLY — no edits to existing types)

### 1. Extend Customer Interface

Update the existing `Customer` interface to include new fields:
```typescript
export interface Customer {
  id: string;
  agencyId: string;
  name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  passport?: string;
  // NEW FIELDS:
  rg?: string;
  nationalIdType?: string;
  birthDate?: Date;
  nationality?: string;
  whatsapp?: string;
  // EXISTING:
  address?: Record<string, unknown>; // Legacy, being migrated to CustomerAddress
  notes?: string;
  status: Status;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### 2. Add AddressType Enum & CustomerAddress Interface

```typescript
export enum AddressType {
  RESIDENTIAL = 'RESIDENTIAL',
  COMMERCIAL = 'COMMERCIAL',
  TEMPORARY = 'TEMPORARY',
}

export interface CustomerAddress {
  id: string;
  agencyId: string;
  customerId: string;
  type: AddressType;
  isPrimary: boolean;
  cep?: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  country: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
```

### 3. Add RelationshipType Enum & CustomerDependent Interface

```typescript
export enum RelationshipType {
  SPOUSE = 'SPOUSE',
  CHILD = 'CHILD',
  PARENT = 'PARENT',
  COMPANION = 'COMPANION',
  OTHER = 'OTHER',
}

export interface CustomerDependent {
  id: string;
  agencyId: string;
  customerId: string;
  name: string;
  relationshipType: RelationshipType;
  birthDate?: Date;
  cpf?: string;
  nationality?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
```

### 4. Add DocumentType Enum & CustomerDocument Interface

```typescript
export enum DocumentType {
  PASSAPORTE = 'PASSAPORTE',
  RG = 'RG',
  CNH = 'CNH',
  CPF = 'CPF',
  VISTO = 'VISTO',
  CERTIDAO = 'CERTIDAO',
  OUTRO = 'OUTRO',
}

export interface CustomerDocument {
  id: string;
  agencyId: string;
  customerId: string;
  documentType: DocumentType;
  documentNumber: string;
  holderName?: string;
  holderBirthDate?: Date;
  holderNationality?: string;
  issuingCountry?: string;
  issuingAuthority?: string;
  issuedDate?: Date;
  expiryDate?: Date;
  isExpired: boolean;
  verificationStatus: DocumentVerificationStatus;
  verifiedAt?: Date;
  verifiedByUserId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
```

### 5. Add DocumentVerificationStatus Enum

```typescript
export enum DocumentVerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  MISMATCH = 'MISMATCH',
  EXPIRED = 'EXPIRED',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
}
```

### 6. Add DocumentAttachmentType Enum & DocumentAttachment Interface

```typescript
export enum DocumentAttachmentType {
  FRONT = 'FRONT',
  BACK = 'BACK',
  PASSPORT_PAGE = 'PASSPORT_PAGE',
  VISA = 'VISA',
  OTHER = 'OTHER',
}

export interface DocumentAttachment {
  id: string;
  agencyId: string;
  documentId: string;
  attachmentType: DocumentAttachmentType;
  fileName: string;
  fileSizeBytes: number;
  fileMimeType: string;
  secureFileKey: string;
  fileHash?: string;
  createdAt: Date;
  deletedAt?: Date;
}
```

### 7. Add OcrProcessingStatus Enum & DocumentExtraction Interface (OCR-Ready)

```typescript
export enum OcrProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
}

export interface DocumentExtraction {
  id: string;
  agencyId: string;
  documentId: string;
  provider: string;
  extractedData: Record<string, unknown>;
  confidence?: number;
  processingStatus: OcrProcessingStatus;
  processedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 8. Add DocumentVerification Interface

```typescript
export interface DocumentVerification {
  id: string;
  agencyId: string;
  documentId: string;
  extractionId?: string;
  holderNameMatch?: boolean;
  holderBirthDateMatch?: boolean;
  holderNationalityMatch?: boolean;
  documentNumberMatch?: boolean;
  discrepancies?: Record<string, unknown>;
  manualReviewNotes?: string;
  reviewedAt?: Date;
  reviewedByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 9. Add DocumentAuditEventType Enum & DocumentAuditEvent Interface

```typescript
export enum DocumentAuditEventType {
  DOCUMENT_CREATED = 'DOCUMENT_CREATED',
  DOCUMENT_UPDATED = 'DOCUMENT_UPDATED',
  ATTACHMENT_UPLOADED = 'ATTACHMENT_UPLOADED',
  ATTACHMENT_DELETED = 'ATTACHMENT_DELETED',
  DOCUMENT_VIEWED = 'DOCUMENT_VIEWED',
  EXTRACTION_STARTED = 'EXTRACTION_STARTED',
  EXTRACTION_COMPLETED = 'EXTRACTION_COMPLETED',
  VERIFICATION_COMPLETED = 'VERIFICATION_COMPLETED',
  DOCUMENT_SOFT_DELETED = 'DOCUMENT_SOFT_DELETED',
}

export interface DocumentAuditEvent {
  id: string;
  agencyId: string;
  documentId?: string;
  attachmentId?: string;
  userId?: string;
  customerId?: string;
  eventType: DocumentAuditEventType;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}
```

## Important Notes

- All new types follow existing patterns in the file (existing Status, UserRole, CustomerAccountStatus enums)
- All enums use SCREAMING_SNAKE_CASE with explicit string values (e.g., `PENDING = 'PENDING'`)
- All interfaces follow existing patterns: required core fields, optional details, Date objects for timestamps
- Append new interfaces and enums at the end of the file — do NOT edit existing interfaces
- No breaking changes to existing exports

## Testing

- `npx tsc --noEmit` passes with no errors
- No unused type warnings
- All enums are properly exported

## Global Constraints (verify)

- ✓ Append-only (no edits to existing types)
- ✓ All types follow existing naming/pattern conventions
- ✓ P0 = 0, P1 = 0 (no errors, no warnings)
- ✓ TypeScript typecheck passes

## Report File

Write your implementation report to: `D:\travel-platform\.superpowers\sdd\task-2-report.md`

Include:
1. All new types added (yes/no)
2. Typecheck passes (yes/no / errors: ...)
3. Customer interface extended (yes/no)
4. All enums exported (yes/no)
5. Commits made (git log -1 --oneline)
6. Any concerns

## Success Criteria

- [ ] All types appended to `packages/domain/types.ts`
- [ ] Customer interface updated with new fields
- [ ] All 9 enums defined and exported
- [ ] All 8 interfaces defined and exported
- [ ] Typecheck passes: `npx tsc --noEmit`
- [ ] No unused imports
- [ ] Commit message: "feat(domain): add Customer 360 types (addresses, dependents, documents, OCR)"
- [ ] Report file completed
