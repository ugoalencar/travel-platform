/**
 * Contracts / E-signature (Agent 03) -- templates, generated documents,
 * parties -- staff-side, plus a public token-only signing flow mirroring
 * routes/enrollment.ts. RBAC enforced inside each service function
 * (requireRole).
 *
 * Registered as one unit from app.ts, same convention as routes/offers.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import type { DatabaseRuntime } from '../database';
import { NotFoundError } from '../errors';
import {
  createContractTemplate,
  updateContractTemplate,
  listContractTemplates,
  getContractTemplateById,
  createContractDocument,
  listContractDocuments,
  getContractDocumentById,
  markContractDocumentReady,
  sendContractDocument,
  cancelContractDocument,
  addContractParty,
  listContractParties,
  removeContractParty,
  revokeContractSignatureLink,
  resolvePublicSignatureToken,
  recordPublicSignatureView,
  submitSignature,
  type CreateContractTemplateInput,
  type UpdateContractTemplateInput,
  type CreateContractDocumentInput,
  type AddContractPartyInput,
  type SubmitSignatureInput,
} from '../contracts';

export interface ContractsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerContractsRoutes(
  app: FastifyInstance,
  options: ContractsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.post('/contracts/templates', { preHandler: protectedHooks }, async (request, reply) => {
    const body = request.body as CreateContractTemplateInput;
    const template = await createContractTemplate(database, body);
    reply.code(201);
    return { template };
  });

  app.get('/contracts/templates', { preHandler: protectedHooks }, async () => {
    const templates = await listContractTemplates(database);
    return { templates };
  });

  app.get<{ Params: { id: string } }>(
    '/contracts/templates/:id',
    { preHandler: protectedHooks },
    async (request) => {
      const template = await getContractTemplateById(database, request.params.id);
      if (!template) {
        throw new NotFoundError('Template não encontrado');
      }
      return { template };
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/contracts/templates/:id',
    { preHandler: protectedHooks },
    async (request) => {
      const body = request.body as UpdateContractTemplateInput;
      const template = await updateContractTemplate(database, request.params.id, body);
      if (!template) {
        throw new NotFoundError('Template não encontrado');
      }
      return { template };
    },
  );

  app.post('/contracts/documents', { preHandler: protectedHooks }, async (request, reply) => {
    const body = request.body as CreateContractDocumentInput;
    const document = await createContractDocument(database, body);
    reply.code(201);
    return { document };
  });

  app.get('/contracts/documents', { preHandler: protectedHooks }, async () => {
    const documents = await listContractDocuments(database);
    return { documents };
  });

  app.get<{ Params: { id: string } }>(
    '/contracts/documents/:id',
    { preHandler: protectedHooks },
    async (request) => {
      const document = await getContractDocumentById(database, request.params.id);
      if (!document) {
        throw new NotFoundError('Documento não encontrado');
      }
      return { document };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/contracts/documents/:id/ready',
    { preHandler: protectedHooks },
    async (request) => {
      const document = await markContractDocumentReady(database, request.params.id);
      return { document };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/contracts/documents/:id/send',
    { preHandler: protectedHooks },
    async (request) => {
      const result = await sendContractDocument(database, request.params.id);
      // Raw signature tokens are returned exactly once, here, at send time
      // -- never persisted, never returned by any other endpoint. In a
      // real deployment these are emailed by the provider rather than
      // handed back to the staff caller, but no such delivery integration
      // exists yet (LocalSignatureProvider stub only).
      return { document: result.document, links: result.links };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/contracts/documents/:id/cancel',
    { preHandler: protectedHooks },
    async (request) => {
      const document = await cancelContractDocument(database, request.params.id);
      return { document };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/contracts/documents/:id/parties',
    { preHandler: protectedHooks },
    async (request, reply) => {
      const body = request.body as AddContractPartyInput;
      const party = await addContractParty(database, request.params.id, body);
      reply.code(201);
      return { party };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/contracts/documents/:id/parties',
    { preHandler: protectedHooks },
    async (request) => {
      const parties = await listContractParties(database, request.params.id);
      return { parties };
    },
  );

  app.delete<{ Params: { id: string; partyId: string } }>(
    '/contracts/documents/:id/parties/:partyId',
    { preHandler: protectedHooks },
    async (request, reply) => {
      const removed = await removeContractParty(
        database,
        request.params.id,
        request.params.partyId,
      );
      if (!removed) {
        throw new NotFoundError('Signatário não encontrado');
      }
      reply.code(204);
      return null;
    },
  );

  app.post<{ Params: { partyId: string } }>(
    '/contracts/parties/:partyId/revoke-link',
    { preHandler: protectedHooks },
    async (request) => {
      const revoked = await revokeContractSignatureLink(database, request.params.partyId);
      if (!revoked) {
        throw new NotFoundError('Link de assinatura ativo não encontrado');
      }
      return { revoked: true };
    },
  );

  // ------------------------------------------------------------
  // Public signing flow -- token-only, no staff auth. Same generic-
  // rejection posture as /invitations/:token: an invalid/expired/revoked/
  // already-signed token always produces the same 404 body, never
  // revealing which failure mode occurred or whether any
  // tenant/document/party ever existed for that token.
  // ------------------------------------------------------------
  app.get('/contracts/sign/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const info = await resolvePublicSignatureToken(database, token);
    if (!info) {
      reply.code(404);
      return { error: 'Link de assinatura inválido ou expirado' };
    }
    await recordPublicSignatureView(database, info, token);
    return { fullName: info.fullName, email: info.email, role: info.role };
  });

  app.post('/contracts/sign/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = request.body as SubmitSignatureInput;
    const info = await resolvePublicSignatureToken(database, token);
    if (!info) {
      reply.code(404);
      return { error: 'Link de assinatura inválido ou expirado' };
    }
    const userAgent = request.headers['user-agent'];
    const result = await submitSignature(database, info, token, {
      ...body,
      ipAddress: request.ip,
      ...(userAgent !== undefined ? { userAgent } : {}),
    });
    return { documentStatus: result.documentStatus };
  });
}
