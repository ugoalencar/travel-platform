import type { FastifyInstance } from 'fastify';
import { TenantError, UnauthorizedError } from '../../../packages/domain/tenant-context';

declare module 'fastify' {
  interface FastifyRequest {
    // SUPPORT-OBS: set here so the structured "request completed" log line
    // (observability.ts onResponse hook) can carry the same errorCode the
    // client received, without re-deriving error-class-to-code mapping.
    observedErrorCode?: string;
  }
}

export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
}

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;
}

export class ConflictError extends Error {
  readonly code = 'CONFLICT';
  readonly statusCode = 409;
}

// SEC-E: thrown by the @fastify/cors `origin` callback for a rejected
// Origin. Given its own class (rather than falling through to the
// generic 500 branch) so a blocked CORS preflight/request gets a clean,
// specific 403 instead of an internal-error response.
export class CorsOriginNotAllowedError extends Error {
  readonly code = 'CORS_ORIGIN_NOT_ALLOWED';
  readonly statusCode = 403;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const errorCode = getErrorCode(error);
    request.observedErrorCode =
      typeof errorCode === 'string' ? errorCode : 'INTERNAL_ERROR';

    request.log.error(
      {
        requestId: request.id,
        errorName: getErrorName(error),
        errorCode,
      },
      'API request failed',
    );

    if (error instanceof UnauthorizedError) {
      return reply.code(401).send({
        error: error.message,
        code: error.code,
      });
    }

    if (error instanceof TenantError) {
      return reply.code(403).send({
        error: error.message,
        code: error.code,
      });
    }

    if (error instanceof CorsOriginNotAllowedError) {
      return reply.code(error.statusCode).send({
        error: 'Origin not allowed',
        code: error.code,
      });
    }

    // Fastify's built-in body-size guard (from the explicit `bodyLimit`
    // configured in app.ts) -- surface it as a clean 413 rather than
    // falling through to the generic 500 branch below.
    if (isFastifyErrorWithCode(error, 'FST_ERR_CTP_BODY_TOO_LARGE')) {
      return reply.code(413).send({
        error: 'Request body too large',
        code: 'BODY_TOO_LARGE',
      });
    }

    if (
      error instanceof ValidationError ||
      error instanceof NotFoundError ||
      error instanceof ConflictError
    ) {
      return reply.code(error.statusCode).send({
        error: error.message,
        code: error.code,
      });
    }

    return reply.code(500).send({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  });
}

function isFastifyErrorWithCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function getErrorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error
    ? error.code
    : undefined;
}
