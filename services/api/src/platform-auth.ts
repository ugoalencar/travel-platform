import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';
import type { IncomingHttpHeaders } from 'node:http';
import { UnauthorizedError } from '../../../packages/domain/tenant-context';
import type { PlatformUserRole } from '../../../packages/domain/types';

export interface PlatformAuthenticatedPrincipal {
  platformUserId: string;
  role: PlatformUserRole;
  email?: string;
}

export interface PlatformAuthProvider {
  authenticate(request: { headers: IncomingHttpHeaders }): Promise<PlatformAuthenticatedPrincipal | null>;
}

declare module 'fastify' {
  interface FastifyRequest {
    platformAuth?: {
      sub: string;
      role: PlatformUserRole;
      email?: string;
    };
  }
}

export function createPlatformAuthenticateHook(authProvider: PlatformAuthProvider) {
  return (
    request: FastifyRequest,
    _reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void => {
    authProvider
      .authenticate(request)
      .then((principal) => {
        if (!principal) {
          done(new UnauthorizedError('Platform authentication required'));
          return;
        }

        const auth: typeof request.platformAuth = {
          sub: principal.platformUserId,
          role: principal.role,
        };
        if (principal.email !== undefined) {
          auth.email = principal.email;
        }
        request.platformAuth = auth;
        done();
      })
      .catch((error: unknown) => {
        done(error instanceof Error ? error : new Error('Platform authentication failed'));
      });
  };
}

export function requirePlatformRole(...roles: PlatformUserRole[]) {
  return (request: FastifyRequest) => {
    if (!request.platformAuth || !roles.includes(request.platformAuth.role)) {
      throw new UnauthorizedError('Insufficient platform role');
    }
  };
}
