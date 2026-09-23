import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';
import type { IncomingHttpHeaders } from 'node:http';
import { ForbiddenError, UnauthorizedError } from '../../../packages/domain/tenant-context';
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

/**
 * Authorization gate for platform routes. 401 (UnauthorizedError) only
 * when no platform principal is attached at all; 403 (ForbiddenError)
 * when the principal is authenticated but lacks one of the required
 * roles -- matching HTTP semantics and the F-02 audit requirement that a
 * READ_ONLY_AUDITOR (or any other low-privilege role) gets 403, not 401,
 * on a write it is not allowed to perform.
 */
export function requirePlatformRole(...roles: PlatformUserRole[]) {
  return (request: FastifyRequest) => {
    if (!request.platformAuth) {
      throw new UnauthorizedError('Platform authentication required');
    }
    if (!roles.includes(request.platformAuth.role)) {
      throw new ForbiddenError('Insufficient platform role');
    }
  };
}
