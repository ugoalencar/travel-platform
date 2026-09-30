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

interface ErrorResponse {
  status: number;
  body: { error: string; code: string };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const errorCode = getErrorCode(error);
    request.observedErrorCode =
      typeof errorCode === 'string' ? errorCode : 'INTERNAL_ERROR';

    const { status, body } = resolveErrorResponse(error);

    // Expected client errors (4xx: auth, tenant, CORS, validation, not
    // found...) are logged at warn so they stay visible for security
    // monitoring without reading as application failures; only 5xx is
    // logged at error, with the error message to make it diagnosable.
    const logFields = {
      requestId: request.id,
      errorName: getErrorName(error),
      errorCode,
      status,
      ...(status >= 500 && error instanceof Error ? { errorMessage: error.message.slice(0, 500) } : {}),
    };
    if (status >= 500) {
      request.log.error(logFields, 'API request failed');
    } else {
      request.log.warn(logFields, 'API request rejected');
    }

    return reply.code(status).send(body);
  });
}

function resolveErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof UnauthorizedError) {
    return { status: 401, body: { error: error.message, code: error.code } };
  }

  if (error instanceof TenantError) {
    return { status: 403, body: { error: error.message, code: error.code } };
  }

  if (error instanceof CorsOriginNotAllowedError) {
    return { status: error.statusCode, body: { error: 'Origin not allowed', code: error.code } };
  }

  // Fastify's built-in body-size guard (from the explicit `bodyLimit`
  // configured in app.ts) -- surface it as a clean 413 rather than
  // falling through to the generic 500 branch below.
  if (isFastifyErrorWithCode(error, 'FST_ERR_CTP_BODY_TOO_LARGE')) {
    return { status: 413, body: { error: 'Request body too large', code: 'BODY_TOO_LARGE' } };
  }

  // Any other Fastify request-parsing error (empty or malformed JSON body,
  // unsupported content type, ...) is a client error carrying its own 4xx
  // statusCode: answer with that status and a generic message instead of
  // the 500 below, without echoing Fastify's internal message.
  const clientErrorStatus = getFastifyClientErrorStatus(error);
  if (clientErrorStatus !== undefined) {
    return {
      status: clientErrorStatus,
      body: clientErrorStatus === 415
        ? { error: 'Unsupported content type', code: 'UNSUPPORTED_MEDIA_TYPE' }
        : { error: 'Invalid request body', code: 'INVALID_REQUEST_BODY' },
    };
  }

  if (
    error instanceof ValidationError ||
    error instanceof NotFoundError ||
    error instanceof ConflictError
  ) {
    return { status: error.statusCode, body: { error: error.message, code: error.code } };
  }

  return { status: 500, body: { error: 'Internal server error', code: 'INTERNAL_ERROR' } };
}

function isFastifyErrorWithCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function getFastifyClientErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { code, statusCode } = error as { code?: unknown; statusCode?: unknown };
  if (typeof code !== 'string' || !code.startsWith('FST_')) return undefined;
  if (typeof statusCode !== 'number' || statusCode < 400 || statusCode > 499) return undefined;
  return statusCode;
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function getErrorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error
    ? error.code
    : undefined;
}
