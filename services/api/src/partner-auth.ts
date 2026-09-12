import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';
import type { IncomingHttpHeaders } from 'node:http';
import { UnauthorizedError, type PartnerAuthPayload } from '../../../packages/domain/tenant-context';

// Fully separate from AuthProvider/AuthenticatedPrincipal (auth.ts) and
// from CustomerAuthProvider (customer-auth.ts). A partner identity must
// never be produced by, or accepted as, the staff or customer auth path
// -- separate types, separate hook, separate request decoration
// (`partnerAuth`, not `auth`/`customerAuth`).
export interface AuthenticatedPartnerPrincipal {
  agencyId: string;
  partnerId: string;
}

export interface PartnerAuthProvider {
  authenticatePartner(request: {
    headers: IncomingHttpHeaders;
  }): Promise<AuthenticatedPartnerPrincipal | null>;
}

declare module 'fastify' {
  interface FastifyRequest {
    partnerAuth?: PartnerAuthPayload;
  }
}

export function createPartnerAuthenticateHook(provider: PartnerAuthProvider) {
  return (
    request: FastifyRequest,
    _reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void => {
    provider
      .authenticatePartner(request)
      .then((principal) => {
        if (!principal) {
          done(new UnauthorizedError('Partner authentication required'));
          return;
        }

        request.partnerAuth = {
          agencyId: principal.agencyId,
          partnerId: principal.partnerId,
        };
        done();
      })
      .catch((error: unknown) => {
        done(error instanceof Error ? error : new Error('Partner authentication failed'));
      });
  };
}
