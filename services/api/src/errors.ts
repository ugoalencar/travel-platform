import type { FastifyInstance } from 'fastify';
import { TenantError, UnauthorizedError } from '../../../packages/domain/tenant-context';

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

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    request.log.error(
      {
        requestId: request.id,
        errorName: getErrorName(error),
        errorCode: getErrorCode(error),
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

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function getErrorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error
    ? error.code
    : undefined;
}
