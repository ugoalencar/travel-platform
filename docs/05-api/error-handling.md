# Tratamento de Erros

## Formato

```json
{
  "error": "Mensagem do erro",
  "code": "ERROR_CODE",
  "details": {}
}
```

## Códigos de Status

| Código | Descrição |
|--------|-----------|
| 200 | Sucesso |
| 201 | Criado |
| 204 | Sem conteúdo (delete) |
| 400 | Bad request (validação) |
| 401 | Não autenticado |
| 403 | Não autorizado |
| 404 | Não encontrado |
| 409 | Conflito (duplicado) |
| 422 | Entidade processável |
| 429 | Rate limit |
| 500 | Erro interno |

## Erros de Validação (400)

```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format",
      "received": "invalid-email"
    },
    {
      "field": "name",
      "message": "Required",
      "received": null
    }
  ]
}
```

## Erro de Autenticação (401)

```json
{
  "error": "Authentication required",
  "code": "UNAUTHORIZED"
}
```

## Erro de Autorização (403)

```json
{
  "error": "Insufficient permissions",
  "code": "FORBIDDEN",
  "details": {
    "required": "ADMIN",
    "current": "AGENT"
  }
}
```

## Erro Não Encontrado (404)

```json
{
  "error": "Resource not found",
  "code": "NOT_FOUND",
  "details": {
    "resource": "Customer",
    "id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

## Erro de Conflito (409)

```json
{
  "error": "Resource already exists",
  "code": "CONFLICT",
  "details": {
    "field": "email",
    "value": "existing@email.com"
  }
}
```

## Erro Cross-Tenant (403)

```json
{
  "error": "Access denied: resource belongs to another agency",
  "code": "TENANT_ACCESS_DENIED"
}
```

## Erro Interno (500)

```json
{
  "error": "Internal server error",
  "code": "INTERNAL_ERROR"
}
```

**NUNCA** expor detalhes do erro em produção.

## Implementação

```typescript
import type { FastifyInstance } from 'fastify';

// Handler de erro Fastify
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    logger.error(error);

    if ('code' in error && 'statusCode' in error) {
      return reply.code(error.statusCode).send({
        error: error.message,
        code: error.code,
        details: error.details,
      });
    }

    return reply.code(500).send({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  });
}

// Erros customizados
class ValidationError extends Error {
  code = 'VALIDATION_ERROR';
  statusCode = 400;
  details: any[];

  constructor(details: any[]) {
    super('Validation failed');
    this.details = details;
  }
}

class TenantError extends Error {
  code = 'TENANT_ACCESS_DENIED';
  statusCode = 403;
}
```
