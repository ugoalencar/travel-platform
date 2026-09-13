/**
 * Proposals -- HTTP surface for proposal CRUD and lifecycle transitions.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import {
  acceptProposal,
  cancelProposal,
  createProposal,
  declineProposal,
  getProposalWithCustomerById,
  listProposalsWithCustomer,
  sendProposal,
  updateProposal,
} from '../proposals';
import {
  parseCreateProposalInput,
  parseUpdateProposalInput,
} from '../commercial-input-parsing';
import { NotFoundError } from '../errors';

export interface ProposalsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerProposalsRoutes(
  app: FastifyInstance,
  options: ProposalsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/proposals', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const proposals = await listProposalsWithCustomer(database);
    return { proposals };
  });

  app.get<{ Params: { id: string } }>(
    '/proposals/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const proposal = await getProposalWithCustomerById(database, request.params.id);

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      return { proposal };
    }
  );

  app.post('/proposals', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const { customerId, data } = parseCreateProposalInput(request.body);
    const proposal = await createProposal(database, customerId, data);

    reply.code(201);
    return { proposal };
  });

  app.patch<{ Params: { id: string } }>(
    '/proposals/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateProposalInput(request.body);
      const proposal = await updateProposal(database, request.params.id, data);

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      return { proposal };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/proposals/:id/send',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const proposal = await sendProposal(database, request.params.id);
      if (!proposal) throw new NotFoundError('Proposal not found');
      return { proposal };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/proposals/:id/cancel',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const proposal = await cancelProposal(database, request.params.id);
      if (!proposal) throw new NotFoundError('Proposal not found');
      return { proposal };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/proposals/:id/accept',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const proposal = await acceptProposal(database, request.params.id);
      if (!proposal) throw new NotFoundError('Proposal not found');
      return { proposal };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/proposals/:id/decline',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const proposal = await declineProposal(database, request.params.id);
      if (!proposal) throw new NotFoundError('Proposal not found');
      return { proposal };
    }
  );
}
