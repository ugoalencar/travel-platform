import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';
import type { IncomingHttpHeaders } from 'node:http';
import { UnauthorizedError, type CustomerAuthPayload } from '../../../packages/domain/tenant-context';

// Fully separate from AuthProvider/AuthenticatedPrincipal in auth.ts. A
// customer identity must never be produced by, or accepted as, the staff
// auth path -- separate types, separate hook, separate request
// decoration (`customerAuth`, not `auth`).
export interface AuthenticatedCustomerPrincipal {
  agencyId: string;
  customerId: string;
}

export interface CustomerAuthProvider {
  authenticateCustomer(request: {
    headers: IncomingHttpHeaders;
  }): Promise<AuthenticatedCustomerPrincipal | null>;
}

declare module 'fastify' {
  interface FastifyRequest {
    customerAuth?: CustomerAuthPayload;
  }
}

export function createCustomerAuthenticateHook(provider: CustomerAuthProvider) {
  return (
    request: FastifyRequest,
    _reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void => {
    provider
      .authenticateCustomer(request)
      .then((principal) => {
        if (!principal) {
          done(new UnauthorizedError('Customer authentication required'));
          return;
        }

        request.customerAuth = {
          agencyId: principal.agencyId,
          customerId: principal.customerId,
        };
        done();
      })
      .catch((error: unknown) => {
        done(error instanceof Error ? error : new Error('Customer authentication failed'));
      });
  };
}
