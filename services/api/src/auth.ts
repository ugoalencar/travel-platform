import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';
import { UnauthorizedError, type AuthPayload } from '../../../packages/domain/tenant-context';
import type { UserRole } from '../../../packages/domain/types';

export interface AuthenticatedPrincipal {
  userId: string;
  agencyId: string;
  role: UserRole;
  email: string;
}

export interface AuthProvider {
  authenticate(request: FastifyRequest): Promise<AuthenticatedPrincipal | null>;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthPayload;
  }
}

export function createAuthenticateHook(authProvider: AuthProvider) {
  return (
    request: FastifyRequest,
    _reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void => {
    authProvider
      .authenticate(request)
      .then((principal) => {
        if (!principal) {
          done(new UnauthorizedError('Authentication required'));
          return;
        }

        request.auth = {
          sub: principal.userId,
          agency_id: principal.agencyId,
          role: principal.role,
          email: principal.email,
        };
        done();
      })
      .catch((error: unknown) => {
        done(error instanceof Error ? error : new Error('Authentication failed'));
      });
  };
}
