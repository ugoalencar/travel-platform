/**
 * INSURANCE (Seguro) (Agent 09 -- Products Upsell): catalog products, sold
 * policies, covered travelers, policy documents. Finance convergence:
 * selling a policy (POST /insurance/policies with saleId) creates a real
 * Receivable via financial.ts's createReceivable -- never a parallel
 * formula or AR table. RBAC mirrors /sales (VIEWER reads, AGENT
 * sells/manages, MANAGER curates the product catalog).
 *
 * Registered as one unit from app.ts, same convention as routes/offers.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import { AuditEventType, recordAuditEvent } from '../audit-log';
import type { DatabaseRuntime } from '../database';
import { NotFoundError, ValidationError } from '../errors';
import {
  addInsuranceTraveler,
  createInsuranceDocument,
  createInsurancePolicy,
  createInsuranceProduct,
  getInsurancePolicyById,
  getInsuranceProductById,
  listInsuranceDocuments,
  listInsurancePolicies,
  listInsuranceProducts,
  listInsuranceTravelers,
  updateInsurancePolicyStatus,
  type CreateInsuranceDocumentInput,
  type CreateInsurancePolicyInput,
  type CreateInsuranceProductInput,
  type AddInsuranceTravelerInput,
  type InsurancePolicyStatus,
} from '../insurance';

export interface InsuranceRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerInsuranceRoutes(
  app: FastifyInstance,
  options: InsuranceRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/insurance/products', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const products = await listInsuranceProducts(database);
    return { products };
  });

  app.get<{ Params: { id: string } }>(
    '/insurance/products/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const product = await getInsuranceProductById(database, request.params.id);
      if (!product) throw new NotFoundError('Insurance product not found');
      return { product };
    }
  );

  app.post('/insurance/products', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const data = request.body as CreateInsuranceProductInput;
    const product = await createInsuranceProduct(database, data);
    await database.withTenantTransaction((client) =>
      recordAuditEvent(client, {
        eventType: AuditEventType.INSURANCE_PRODUCT_CREATED,
        entityType: 'insurance_product',
        entityId: product.id,
        metadata: { fieldsChanged: `${product.insurerName}/${product.planName}` },
      })
    );
    reply.code(201);
    return { product };
  });

  app.get('/insurance/policies', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const policies = await listInsurancePolicies(database);
    return { policies };
  });

  app.get<{ Params: { id: string } }>(
    '/insurance/policies/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const policy = await getInsurancePolicyById(database, request.params.id);
      if (!policy) throw new NotFoundError('Insurance policy not found');
      return { policy };
    }
  );

  app.post('/insurance/policies', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = request.body as CreateInsurancePolicyInput;
    const policy = await createInsurancePolicy(database, data);
    await database.withTenantTransaction((client) =>
      recordAuditEvent(client, {
        eventType: AuditEventType.INSURANCE_POLICY_CREATED,
        entityType: 'insurance_policy',
        entityId: policy.id,
        metadata: { amount: policy.saleAmount, currency: policy.currency },
      })
    );
    reply.code(201);
    return { policy };
  });

  app.patch<{ Params: { id: string } }>(
    '/insurance/policies/:id/status',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const body = request.body as { status?: InsurancePolicyStatus };
      if (typeof body.status !== 'string') {
        throw new ValidationError('Field "status" is required');
      }
      const policy = await updateInsurancePolicyStatus(
        database,
        request.params.id,
        body.status
      );
      if (!policy) throw new NotFoundError('Insurance policy not found');
      await database.withTenantTransaction((client) =>
        recordAuditEvent(client, {
          eventType: AuditEventType.INSURANCE_POLICY_STATUS_UPDATED,
          entityType: 'insurance_policy',
          entityId: policy.id,
          metadata: { toStatus: policy.status, status: policy.status },
        })
      );
      return { policy };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/insurance/policies/:id/travelers',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const travelers = await listInsuranceTravelers(database, request.params.id);
      return { travelers };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/insurance/policies/:id/travelers',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      const body = request.body as Omit<AddInsuranceTravelerInput, 'insurancePolicyId'>;
      const traveler = await addInsuranceTraveler(database, {
        ...body,
        insurancePolicyId: request.params.id,
      });
      await database.withTenantTransaction((client) =>
        recordAuditEvent(client, {
          eventType: AuditEventType.INSURANCE_TRAVELER_ADDED,
          entityType: 'insurance_policy',
          entityId: traveler.insurancePolicyId,
        })
      );
      reply.code(201);
      return { traveler };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/insurance/policies/:id/documents',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const documents = await listInsuranceDocuments(database, request.params.id);
      return { documents };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/insurance/policies/:id/documents',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      const body = request.body as Omit<CreateInsuranceDocumentInput, 'insurancePolicyId'>;
      const document = await createInsuranceDocument(database, {
        ...body,
        insurancePolicyId: request.params.id,
      });
      await database.withTenantTransaction((client) =>
        recordAuditEvent(client, {
          eventType: AuditEventType.INSURANCE_DOCUMENT_CREATED,
          entityType: 'insurance_policy',
          entityId: document.insurancePolicyId,
          metadata: { fieldsChanged: document.fileName },
        })
      );
      reply.code(201);
      return { document };
    }
  );
}
