/**
 * Customer 360 -- HTTP surface.
 *
 * Registered from `app.ts` as a single unit so the whole Customer 360 route
 * set shares one auth pipeline and one set of parsers. Every route runs behind
 * the staff `protectedHooks` (authenticate + establishTenant + rate limit) and
 * derives its tenant from the ambient context, never from the request body.
 *
 * Nested resources are checked for existence through their parent
 * (`getCustomerById`, `getDocumentById`) before the child is touched, so a
 * caller cannot use a child id to probe whether a customer or document exists
 * in another tenant.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import {
  AddressType,
  DocumentAttachmentType,
  DocumentType,
  DocumentVerificationStatus,
  OcrProcessingStatus,
  RelationshipType,
  UserRole,
} from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { NotFoundError, ValidationError } from '../errors';
import {
  createAddress,
  deleteAddress,
  getAddressById,
  listAddresses,
  updateAddress,
  type CreateAddressInput,
  type UpdateAddressInput,
} from '../customer-addresses';
import {
  convertDependentToCustomer,
  createDependent,
  deleteDependent,
  getDependentById,
  listDependents,
  updateDependent,
  type CreateDependentInput,
  type UpdateDependentInput,
} from '../customer-dependents';
import {
  createDocument,
  deleteDocument,
  getDocumentById,
  listDocuments,
  updateDocument,
  type CreateDocumentInput,
  type UpdateDocumentInput,
} from '../customer-documents';
import {
  createTravelRequirement,
  deleteTravelRequirement,
  getTravelRequirementById,
  listTravelRequirements,
  updateTravelRequirement,
  type CreateTravelRequirementInput,
  type UpdateTravelRequirementInput,
} from '../travel-requirements';
import { TravelRequirementType, TravelerType } from '../../../../packages/domain/types';
import { getCustomerById } from '../customers';
import {
  calculateFileHash,
  createAttachment,
  deleteAttachment,
  generateSecureFileKey,
  getAttachmentById,
  listAttachments,
  MAX_ATTACHMENT_BYTES,
  validateFileSize,
  validateFileType,
  isBlockedFileName,
} from '../document-attachments';
import { readFile as readStoredFile, saveFile } from '../file-storage';
import {
  getExtraction,
  listExtractionsForDocument,
  pollExtraction,
  submitDocumentForExtraction,
} from '../document-extraction';
import {
  getLatestVerificationForDocument,
  getVerification,
  recordManualReview,
  verifyAgainstCustomer,
} from '../document-verification';
import { getAuditLog, getDocumentAuditLog } from '../document-audit';
import { MockOcrProvider, type OcrProviderContract } from '../ocr-provider';

export interface CustomerDocumentRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
  /**
   * OCR backend used by the extraction endpoints. Defaults to the in-memory
   * mock so the route surface stays exercisable before a real provider is
   * configured -- the contract, not the vendor, is what this layer depends on.
   */
  ocrProvider?: OcrProviderContract;
}

export function registerCustomerDocumentRoutes(
  app: FastifyInstance,
  options: CustomerDocumentRoutesOptions,
): void {
  const { database, protectedHooks } = options;
  const ocrProvider = options.ocrProvider ?? new MockOcrProvider();

  const assertCustomerExists = async (customerId: string): Promise<void> => {
    const customer = await getCustomerById(database, customerId);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
  };

  const assertDocumentExists = async (documentId: string): Promise<void> => {
    const document = await getDocumentById(database, documentId);
    if (!document) {
      throw new NotFoundError('Document not found');
    }
  };

  // ============================================================
  // ADDRESSES
  // ============================================================

  app.get<{ Params: { customerId: string } }>(
    '/customers/:customerId/addresses',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      await assertCustomerExists(request.params.customerId);
      const addresses = await listAddresses(database, request.params.customerId);
      return { addresses };
    },
  );

  app.get<{ Params: { customerId: string; addressId: string } }>(
    '/customers/:customerId/addresses/:addressId',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const address = await getAddressById(database, request.params.addressId);
      if (!address || address.customerId !== request.params.customerId) {
        throw new NotFoundError('Address not found');
      }
      return { address };
    },
  );

  app.post<{ Params: { customerId: string } }>(
    '/customers/:customerId/addresses',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      await assertCustomerExists(request.params.customerId);
      const data = parseCreateAddressInput(request.body, request.params.customerId);
      const address = await createAddress(database, data);
      reply.code(201);
      return { address };
    },
  );

  app.patch<{ Params: { customerId: string; addressId: string } }>(
    '/customers/:customerId/addresses/:addressId',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const existing = await getAddressById(database, request.params.addressId);
      if (!existing || existing.customerId !== request.params.customerId) {
        throw new NotFoundError('Address not found');
      }
      const data = parseUpdateAddressInput(request.body);
      const address = await updateAddress(database, request.params.addressId, data);
      if (!address) {
        throw new NotFoundError('Address not found');
      }
      return { address };
    },
  );

  app.delete<{ Params: { customerId: string; addressId: string } }>(
    '/customers/:customerId/addresses/:addressId',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const existing = await getAddressById(database, request.params.addressId);
      if (!existing || existing.customerId !== request.params.customerId) {
        throw new NotFoundError('Address not found');
      }
      const address = await deleteAddress(database, request.params.addressId);
      if (!address) {
        throw new NotFoundError('Address not found');
      }
      return { address };
    },
  );

  // ============================================================
  // DEPENDENTS
  // ============================================================

  app.get<{ Params: { customerId: string } }>(
    '/customers/:customerId/dependents',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      await assertCustomerExists(request.params.customerId);
      const dependents = await listDependents(database, request.params.customerId);
      return { dependents };
    },
  );

  app.get<{ Params: { customerId: string; dependentId: string } }>(
    '/customers/:customerId/dependents/:dependentId',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const dependent = await getDependentById(database, request.params.dependentId);
      if (!dependent || dependent.customerId !== request.params.customerId) {
        throw new NotFoundError('Dependent not found');
      }
      return { dependent };
    },
  );

  app.post<{ Params: { customerId: string } }>(
    '/customers/:customerId/dependents',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      await assertCustomerExists(request.params.customerId);
      const data = parseCreateDependentInput(request.body, request.params.customerId);
      const dependent = await createDependent(database, data);
      reply.code(201);
      return { dependent };
    },
  );

  app.patch<{ Params: { customerId: string; dependentId: string } }>(
    '/customers/:customerId/dependents/:dependentId',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const existing = await getDependentById(database, request.params.dependentId);
      if (!existing || existing.customerId !== request.params.customerId) {
        throw new NotFoundError('Dependent not found');
      }
      const data = parseUpdateDependentInput(request.body);
      const dependent = await updateDependent(database, request.params.dependentId, data);
      if (!dependent) {
        throw new NotFoundError('Dependent not found');
      }
      return { dependent };
    },
  );

  app.delete<{ Params: { customerId: string; dependentId: string } }>(
    '/customers/:customerId/dependents/:dependentId',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const existing = await getDependentById(database, request.params.dependentId);
      if (!existing || existing.customerId !== request.params.customerId) {
        throw new NotFoundError('Dependent not found');
      }
      const dependent = await deleteDependent(database, request.params.dependentId);
      if (!dependent) {
        throw new NotFoundError('Dependent not found');
      }
      return { dependent };
    },
  );

  // Promotes a companion into a real, independent customer record --
  // requested directly: "ao mesmo tempo que ele é um acompanhante ele
  // vira um cliente e entra na mira de ofertas". ADMIN-gated (not just
  // AGENT like the rest of this resource) since it creates a brand new
  // billable-relationship customer record, not just edits the dependent.
  app.post<{ Params: { customerId: string; dependentId: string } }>(
    '/customers/:customerId/dependents/:dependentId/convert-to-customer',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      const existing = await getDependentById(database, request.params.dependentId);
      if (!existing || existing.customerId !== request.params.customerId) {
        throw new NotFoundError('Dependent not found');
      }
      const result = await convertDependentToCustomer(database, request.params.dependentId);
      reply.code(201);
      return result;
    },
  );

  // ============================================================
  // DOCUMENTS
  // ============================================================

  app.get<{ Params: { customerId: string } }>(
    '/customers/:customerId/documents',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      await assertCustomerExists(request.params.customerId);
      const documents = await listDocuments(database, request.params.customerId);
      return { documents };
    },
  );

  app.get<{ Params: { customerId: string; documentId: string } }>(
    '/customers/:customerId/documents/:documentId',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const document = await getDocumentById(database, request.params.documentId);
      if (!document || document.customerId !== request.params.customerId) {
        throw new NotFoundError('Document not found');
      }
      return { document };
    },
  );

  app.post<{ Params: { customerId: string } }>(
    '/customers/:customerId/documents',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      await assertCustomerExists(request.params.customerId);
      const data = parseCreateDocumentInput(request.body, request.params.customerId);
      const document = await createDocument(database, data);
      reply.code(201);
      return { document };
    },
  );

  app.patch<{ Params: { customerId: string; documentId: string } }>(
    '/customers/:customerId/documents/:documentId',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const existing = await getDocumentById(database, request.params.documentId);
      if (!existing || existing.customerId !== request.params.customerId) {
        throw new NotFoundError('Document not found');
      }
      const data = parseUpdateDocumentInput(request.body);
      const document = await updateDocument(database, request.params.documentId, data);
      if (!document) {
        throw new NotFoundError('Document not found');
      }
      return { document };
    },
  );

  app.delete<{ Params: { customerId: string; documentId: string } }>(
    '/customers/:customerId/documents/:documentId',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const existing = await getDocumentById(database, request.params.documentId);
      if (!existing || existing.customerId !== request.params.customerId) {
        throw new NotFoundError('Document not found');
      }
      const document = await deleteDocument(database, request.params.documentId);
      if (!document) {
        throw new NotFoundError('Document not found');
      }
      return { document };
    },
  );

  // ============================================================
  // TRAVEL REQUIREMENTS (Requisitos de viagem)
  // ============================================================

  app.get<{ Params: { customerId: string } }>(
    '/customers/:customerId/travel-requirements',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      await assertCustomerExists(request.params.customerId);
      const requirements = await listTravelRequirements(database, request.params.customerId);
      return { requirements };
    },
  );

  app.post<{ Params: { customerId: string } }>(
    '/customers/:customerId/travel-requirements',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      await assertCustomerExists(request.params.customerId);
      const data = parseCreateTravelRequirementInput(request.body, request.params.customerId);
      const requirement = await createTravelRequirement(database, data);
      reply.code(201);
      return { requirement };
    },
  );

  app.patch<{ Params: { customerId: string; requirementId: string } }>(
    '/customers/:customerId/travel-requirements/:requirementId',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const existing = await getTravelRequirementById(database, request.params.requirementId);
      if (!existing || existing.customerId !== request.params.customerId) {
        throw new NotFoundError('Travel requirement not found');
      }
      const data = parseUpdateTravelRequirementInput(request.body);
      const requirement = await updateTravelRequirement(
        database,
        request.params.requirementId,
        data,
      );
      if (!requirement) {
        throw new NotFoundError('Travel requirement not found');
      }
      return { requirement };
    },
  );

  app.delete<{ Params: { customerId: string; requirementId: string } }>(
    '/customers/:customerId/travel-requirements/:requirementId',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const existing = await getTravelRequirementById(database, request.params.requirementId);
      if (!existing || existing.customerId !== request.params.customerId) {
        throw new NotFoundError('Travel requirement not found');
      }
      const requirement = await deleteTravelRequirement(database, request.params.requirementId);
      if (!requirement) {
        throw new NotFoundError('Travel requirement not found');
      }
      return { requirement };
    },
  );

  // ============================================================
  // ATTACHMENTS
  // ============================================================

  app.get<{ Params: { documentId: string } }>(
    '/documents/:documentId/attachments',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      await assertDocumentExists(request.params.documentId);
      const attachments = await listAttachments(database, request.params.documentId);
      return { attachments };
    },
  );

  // Real file bytes (multipart), not the metadata-only JSON shape the
  // route used to accept -- no object store was ever wired up anywhere
  // in the codebase (confirmed by a full repo grep) despite
  // document-attachments.ts's validation/key-minting being fully built,
  // so "attach a document" had no way to actually receive a file.
  // Reported directly: "documentação... o cliente normalmente para
  // viagens internacionais até vacinas são necessárias" -- staff need
  // to attach the actual passport/visa/vaccination-certificate scan,
  // not just describe it. See file-storage.ts for the local-disk
  // object-store adapter this saves into.
  app.post<{ Params: { documentId: string } }>(
    '/documents/:documentId/attachments',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      await assertDocumentExists(request.params.documentId);

      const file = await request.file();
      if (!file) {
        throw new ValidationError('A file is required');
      }
      const attachmentTypeField = file.fields.attachmentType;
      const attachmentTypeValue =
        attachmentTypeField && !Array.isArray(attachmentTypeField) && attachmentTypeField.type === 'field'
          ? String(attachmentTypeField.value)
          : undefined;
      if (!attachmentTypeValue || !Object.values(DocumentAttachmentType).includes(attachmentTypeValue as DocumentAttachmentType)) {
        throw new ValidationError(
          `Field "attachmentType" must be one of: ${Object.values(DocumentAttachmentType).join(', ')}`,
        );
      }

      let buffer: Buffer;
      try {
        buffer = await file.toBuffer();
      } catch (error: unknown) {
        // @fastify/multipart throws its own FST_REQ_FILE_TOO_LARGE (413) when
        // the stream exceeds app.ts's registered `limits.fileSize` -- mapped
        // to the same ValidationError (400) every other size/type rejection
        // in this route uses, rather than leaking a differently-shaped error.
        if (error && typeof error === 'object' && 'code' in error && error.code === 'FST_REQ_FILE_TOO_LARGE') {
          throw new ValidationError(`File size must be between 1 byte and ${MAX_ATTACHMENT_BYTES} bytes`);
        }
        throw error;
      }
      if (isBlockedFileName(file.filename)) {
        throw new ValidationError('File type is not permitted');
      }
      if (!validateFileType(file.mimetype)) {
        throw new ValidationError('Unsupported file type');
      }
      if (!validateFileSize(buffer.length)) {
        throw new ValidationError(`File size must be between 1 byte and ${MAX_ATTACHMENT_BYTES} bytes`);
      }

      // The storage key is minted server-side: a client never gets to choose
      // where its bytes land.
      const secureFileKey = generateSecureFileKey(request.params.documentId, file.filename);
      await saveFile(secureFileKey, buffer);

      const attachment = await createAttachment(
        database,
        request.params.documentId,
        attachmentTypeValue as DocumentAttachmentType,
        file.filename,
        buffer.length,
        file.mimetype,
        secureFileKey,
        { fileHash: calculateFileHash(buffer) },
      );

      reply.code(201);
      return { attachment };
    },
  );

  app.get<{ Params: { documentId: string; attachmentId: string } }>(
    '/documents/:documentId/attachments/:attachmentId/download',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.VIEWER);
      await assertDocumentExists(request.params.documentId);
      const attachment = await getAttachmentById(database, request.params.attachmentId);
      if (!attachment || attachment.documentId !== request.params.documentId) {
        throw new NotFoundError('Attachment not found');
      }

      const content = await readStoredFile(attachment.secureFileKey);
      reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.fileName)}"`);
      reply.type(attachment.fileMimeType);
      return reply.send(content);
    },
  );

  app.delete<{ Params: { documentId: string; attachmentId: string } }>(
    '/documents/:documentId/attachments/:attachmentId',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      await assertDocumentExists(request.params.documentId);
      const attachment = await deleteAttachment(database, request.params.attachmentId);
      if (!attachment || attachment.documentId !== request.params.documentId) {
        throw new NotFoundError('Attachment not found');
      }
      return { attachment };
    },
  );

  // ============================================================
  // OCR EXTRACTION
  // ============================================================

  app.post<{ Params: { documentId: string } }>(
    '/documents/:documentId/extract',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      const document = await getDocumentById(database, request.params.documentId);
      if (!document) {
        throw new NotFoundError('Document not found');
      }

      const body = asRecord(request.body);
      const attachmentId = requireStringField(body, 'attachmentId');
      const fileUrl = requireStringField(body, 'fileUrl');

      const extraction = await submitDocumentForExtraction(
        database,
        request.params.documentId,
        attachmentId,
        fileUrl,
        document.documentType,
        ocrProvider,
      );

      reply.code(202);
      return { extraction };
    },
  );

  app.get<{ Params: { documentId: string } }>(
    '/documents/:documentId/extractions',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      await assertDocumentExists(request.params.documentId);
      const extractions = await listExtractionsForDocument(database, request.params.documentId);
      return { extractions };
    },
  );

  app.get<{ Params: { documentId: string; extractionId: string } }>(
    '/documents/:documentId/extraction/:extractionId',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const extraction = await getExtraction(database, request.params.extractionId);
      if (!extraction || extraction.documentId !== request.params.documentId) {
        throw new NotFoundError('Extraction not found');
      }
      return { extraction };
    },
  );

  /**
   * Advance a PROCESSING extraction by polling the provider once.
   *
   * Every realistic hosted OCR backend is asynchronous (submit, then poll --
   * see ocr-provider.ts), so a PROCESSING extraction never self-completes.
   * This is what the review UI calls to check "is the candidate ready yet",
   * and it is safe to call repeatedly: a terminal extraction (COMPLETED or
   * FAILED) is returned unchanged rather than re-queried against the
   * provider.
   */
  app.post<{ Params: { documentId: string; extractionId: string } }>(
    '/documents/:documentId/extraction/:extractionId/poll',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const extraction = await getExtraction(database, request.params.extractionId);
      if (!extraction || extraction.documentId !== request.params.documentId) {
        throw new NotFoundError('Extraction not found');
      }

      if (extraction.processingStatus !== OcrProcessingStatus.PROCESSING) {
        return { extraction };
      }

      const taskId = extraction.extractedData['taskId'];
      if (typeof taskId !== 'string' || taskId.trim().length === 0) {
        throw new ValidationError('Extraction has no provider task id to poll');
      }

      const polled = await pollExtraction(
        database,
        request.params.extractionId,
        taskId,
        ocrProvider,
      );
      if (!polled) {
        throw new NotFoundError('Extraction not found');
      }
      return { extraction: polled };
    },
  );

  // ============================================================
  // VERIFICATION
  // ============================================================

  app.post<{ Params: { documentId: string } }>(
    '/documents/:documentId/verify',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      await assertDocumentExists(request.params.documentId);

      const body = asRecord(request.body);
      const extractionId = requireStringField(body, 'extractionId');

      const extraction = await getExtraction(database, extractionId);
      if (!extraction || extraction.documentId !== request.params.documentId) {
        throw new NotFoundError('Extraction not found');
      }

      const verification = await verifyAgainstCustomer(
        database,
        request.params.documentId,
        extraction,
      );

      reply.code(201);
      return { verification };
    },
  );

  app.get<{ Params: { documentId: string } }>(
    '/documents/:documentId/verification',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      await assertDocumentExists(request.params.documentId);
      const verification = await getLatestVerificationForDocument(
        database,
        request.params.documentId,
      );
      if (!verification) {
        throw new NotFoundError('Verification not found');
      }
      return { verification };
    },
  );

  app.post<{ Params: { documentId: string; verificationId: string } }>(
    '/documents/:documentId/verification/:verificationId/manual-review',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      await assertDocumentExists(request.params.documentId);

      const existing = await getVerification(database, request.params.verificationId);
      if (!existing || existing.documentId !== request.params.documentId) {
        throw new NotFoundError('Verification not found');
      }

      const body = asRecord(request.body);
      const notes = requireStringField(body, 'notes');
      const reviewedByUserId = requireStringField(body, 'reviewedByUserId');

      const verification = await recordManualReview(
        database,
        request.params.verificationId,
        reviewedByUserId,
        notes,
      );
      if (!verification) {
        throw new NotFoundError('Verification not found');
      }
      return { verification };
    },
  );

  // ============================================================
  // AUDIT TRAIL (read-only; the table itself is insert-only)
  // ============================================================

  app.get<{ Params: { customerId: string } }>(
    '/customers/:customerId/audit-log',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      await assertCustomerExists(request.params.customerId);
      const events = await getAuditLog(database, request.params.customerId);
      return { events };
    },
  );

  app.get<{ Params: { documentId: string } }>(
    '/documents/:documentId/audit-log',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      await assertDocumentExists(request.params.documentId);
      const events = await getDocumentAuditLog(database, request.params.documentId);
      return { events };
    },
  );
}

// ============================================================
// INPUT PARSERS
// Each parser rejects unknown keys so a client cannot smuggle a column the
// route was never meant to expose (agencyId, deletedAt, verifiedByUserId).
// ============================================================

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  return body as Record<string, unknown>;
}

function rejectUnknownFields(
  record: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }
}

function requireStringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required and must be a non-empty string`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string`);
  }
  return value;
}

function nullableString(
  record: Record<string, unknown>,
  field: string,
): string | null | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string or null`);
  }
  return value;
}

function optionalBoolean(record: Record<string, unknown>, field: string): boolean | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new ValidationError(`Field "${field}" must be a boolean`);
  }
  return value;
}

function optionalEnum<T extends string>(
  record: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(`Field "${field}" must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function requireEnum<T extends string>(
  record: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T {
  const value = optionalEnum(record, field, allowed);
  if (value === undefined) {
    throw new ValidationError(`Field "${field}" is required and must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

const ADDRESS_FIELDS = [
  'type', 'isPrimary', 'cep', 'street', 'number', 'complement',
  'district', 'city', 'state', 'country',
] as const;

export function parseCreateAddressInput(
  body: unknown,
  customerId: string,
): CreateAddressInput {
  const record = asRecord(body);
  rejectUnknownFields(record, ADDRESS_FIELDS);

  const data: CreateAddressInput = {
    customerId,
    street: requireStringField(record, 'street'),
    number: requireStringField(record, 'number'),
    district: requireStringField(record, 'district'),
    city: requireStringField(record, 'city'),
    state: requireStringField(record, 'state'),
  };

  const type = optionalEnum(record, 'type', Object.values(AddressType));
  if (type !== undefined) data.type = type;

  const isPrimary = optionalBoolean(record, 'isPrimary');
  if (isPrimary !== undefined) data.isPrimary = isPrimary;

  const cep = optionalString(record, 'cep');
  if (cep !== undefined) data.cep = cep;

  const complement = optionalString(record, 'complement');
  if (complement !== undefined) data.complement = complement;

  const country = optionalString(record, 'country');
  if (country !== undefined) data.country = country;

  return data;
}

export function parseUpdateAddressInput(body: unknown): UpdateAddressInput {
  const record = asRecord(body);
  rejectUnknownFields(record, ADDRESS_FIELDS);

  const data: UpdateAddressInput = {};

  const type = optionalEnum(record, 'type', Object.values(AddressType));
  if (type !== undefined) data.type = type;

  const isPrimary = optionalBoolean(record, 'isPrimary');
  if (isPrimary !== undefined) data.isPrimary = isPrimary;

  const cep = nullableString(record, 'cep');
  if (cep !== undefined) data.cep = cep;

  const complement = nullableString(record, 'complement');
  if (complement !== undefined) data.complement = complement;

  for (const field of ['street', 'number', 'district', 'city', 'state', 'country'] as const) {
    const value = optionalString(record, field);
    if (value !== undefined) data[field] = value;
  }

  return data;
}

const DEPENDENT_FIELDS = [
  'name', 'relationshipType', 'birthDate', 'cpf', 'nationality', 'notes',
  'hasPowerOfAttorney', 'powerOfAttorneyNotes', 'existingCustomerId',
] as const;

export function parseCreateDependentInput(
  body: unknown,
  customerId: string,
): CreateDependentInput {
  const record = asRecord(body);
  rejectUnknownFields(record, DEPENDENT_FIELDS);

  const existingCustomerId = optionalString(record, 'existingCustomerId');

  const data: CreateDependentInput = {
    customerId,
    // Identity comes from the linked customer's own record when one is
    // attached (service layer resolves it) -- name is only required
    // from the client when creating a standalone companion.
    name: existingCustomerId !== undefined ? '' : requireStringField(record, 'name'),
    relationshipType: requireEnum(record, 'relationshipType', Object.values(RelationshipType)),
  };
  if (existingCustomerId !== undefined) data.existingCustomerId = existingCustomerId;

  for (const field of ['birthDate', 'cpf', 'nationality', 'notes', 'powerOfAttorneyNotes'] as const) {
    const value = optionalString(record, field);
    if (value !== undefined) data[field] = value;
  }
  const hasPowerOfAttorney = optionalBoolean(record, 'hasPowerOfAttorney');
  if (hasPowerOfAttorney !== undefined) data.hasPowerOfAttorney = hasPowerOfAttorney;

  return data;
}

export function parseUpdateDependentInput(body: unknown): UpdateDependentInput {
  const record = asRecord(body);
  rejectUnknownFields(record, DEPENDENT_FIELDS);

  const data: UpdateDependentInput = {};

  const name = optionalString(record, 'name');
  if (name !== undefined) data.name = name;

  const relationshipType = optionalEnum(
    record,
    'relationshipType',
    Object.values(RelationshipType),
  );
  if (relationshipType !== undefined) data.relationshipType = relationshipType;

  for (const field of ['birthDate', 'cpf', 'nationality', 'notes', 'powerOfAttorneyNotes'] as const) {
    const value = nullableString(record, field);
    if (value !== undefined) data[field] = value;
  }
  const hasPowerOfAttorney = optionalBoolean(record, 'hasPowerOfAttorney');
  if (hasPowerOfAttorney !== undefined) data.hasPowerOfAttorney = hasPowerOfAttorney;

  return data;
}

const DOCUMENT_CREATE_FIELDS = [
  'documentType', 'documentNumber', 'holderName', 'holderBirthDate', 'holderNationality',
  'issuingCountry', 'issuingAuthority', 'issuedDate', 'expiryDate', 'notes',
] as const;

const DOCUMENT_UPDATE_FIELDS = [
  ...DOCUMENT_CREATE_FIELDS,
  'verificationStatus',
] as const;

export function parseCreateDocumentInput(
  body: unknown,
  customerId: string,
): CreateDocumentInput {
  const record = asRecord(body);
  rejectUnknownFields(record, DOCUMENT_CREATE_FIELDS);

  const data: CreateDocumentInput = {
    customerId,
    documentType: requireEnum(record, 'documentType', Object.values(DocumentType)),
    documentNumber: requireStringField(record, 'documentNumber'),
  };

  for (const field of [
    'holderName', 'holderBirthDate', 'holderNationality', 'issuingCountry',
    'issuingAuthority', 'issuedDate', 'expiryDate', 'notes',
  ] as const) {
    const value = optionalString(record, field);
    if (value !== undefined) data[field] = value;
  }

  return data;
}

export function parseUpdateDocumentInput(body: unknown): UpdateDocumentInput {
  const record = asRecord(body);
  rejectUnknownFields(record, DOCUMENT_UPDATE_FIELDS);

  const data: UpdateDocumentInput = {};

  const documentType = optionalEnum(record, 'documentType', Object.values(DocumentType));
  if (documentType !== undefined) data.documentType = documentType;

  const documentNumber = optionalString(record, 'documentNumber');
  if (documentNumber !== undefined) data.documentNumber = documentNumber;

  const verificationStatus = optionalEnum(
    record,
    'verificationStatus',
    Object.values(DocumentVerificationStatus),
  );
  if (verificationStatus !== undefined) data.verificationStatus = verificationStatus;

  for (const field of [
    'holderName', 'holderBirthDate', 'holderNationality', 'issuingCountry',
    'issuingAuthority', 'issuedDate', 'expiryDate', 'notes',
  ] as const) {
    const value = nullableString(record, field);
    if (value !== undefined) data[field] = value;
  }

  return data;
}

const TRAVEL_REQUIREMENT_CREATE_FIELDS = [
  'travelerType', 'dependentId', 'tripId', 'destination', 'type', 'required', 'fulfilled',
  'documentId', 'expirationDate', 'notes',
] as const;

const TRAVEL_REQUIREMENT_UPDATE_FIELDS = [
  'destination', 'required', 'fulfilled', 'documentId', 'expirationDate', 'notes',
] as const;

export function parseCreateTravelRequirementInput(
  body: unknown,
  customerId: string,
): CreateTravelRequirementInput {
  const record = asRecord(body);
  rejectUnknownFields(record, TRAVEL_REQUIREMENT_CREATE_FIELDS);

  const data: CreateTravelRequirementInput = {
    customerId,
    type: requireEnum(record, 'type', Object.values(TravelRequirementType)),
  };

  const travelerType = optionalEnum(record, 'travelerType', Object.values(TravelerType));
  if (travelerType !== undefined) data.travelerType = travelerType;

  for (const field of ['dependentId', 'tripId', 'destination', 'documentId', 'expirationDate', 'notes'] as const) {
    const value = optionalString(record, field);
    if (value !== undefined) data[field] = value;
  }

  const required = optionalBoolean(record, 'required');
  if (required !== undefined) data.required = required;

  const fulfilled = optionalBoolean(record, 'fulfilled');
  if (fulfilled !== undefined) data.fulfilled = fulfilled;

  return data;
}

export function parseUpdateTravelRequirementInput(body: unknown): UpdateTravelRequirementInput {
  const record = asRecord(body);
  rejectUnknownFields(record, TRAVEL_REQUIREMENT_UPDATE_FIELDS);

  const data: UpdateTravelRequirementInput = {};

  for (const field of ['destination', 'documentId', 'expirationDate', 'notes'] as const) {
    const value = nullableString(record, field);
    if (value !== undefined) data[field] = value;
  }

  const required = optionalBoolean(record, 'required');
  if (required !== undefined) data.required = required;

  const fulfilled = optionalBoolean(record, 'fulfilled');
  if (fulfilled !== undefined) data.fulfilled = fulfilled;

  return data;
}

