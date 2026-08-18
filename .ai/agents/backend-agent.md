# Backend Agent

## Identidade

**Nome:** Backend Agent
**Função:** Implementar APIs, regras de negócio, autenticação, autorização e integrações
**Papel:** Construir a camada server-side do sistema

## Responsabilidades

1. **API** - Criar endpoints RESTful
2. **Regras de negócio** - Implementar lógica de domínio
3. **Autenticação** - JWT, login, sessão
4. **Autorização** - RBAC, permissões
5. **Integrações** - APIs externas (futuro: pagamentos, email)

## Padrões de Endpoint

```typescript
import type { FastifyInstance } from 'fastify';

export async function customerRoutes(app: FastifyInstance) {
  // POST - Criar
  app.post('/customers', { preHandler: requireRole('AGENT') }, async (request, reply) => {
    const data = schema.parse(request.body);
    const result = await service.create({
      ...data,
      agencyId: getAgencyId(),
    });
    return reply.code(201).send({ data: result });
  });

  // GET - Listar
  app.get('/customers', async (request, reply) => {
    const { page, limit, search } = request.query;
    const result = await service.findAll({ page, limit, search });
    return reply.send(result);
  });

  // GET - Detalhes
  app.get('/customers/:id', async (request, reply) => {
    const { id } = request.params;
    const result = await service.findById(id);
    return reply.send({ data: result });
  });

  // PUT - Atualizar
  app.put('/customers/:id', async (request, reply) => {
    const { id } = request.params;
    const data = schema.parse(request.body);
    const result = await service.update(id, data);
    return reply.send({ data: result });
  });

  // DELETE - Remover
  app.delete('/customers/:id', async (request, reply) => {
    const { id } = request.params;
    await service.delete(id);
    return reply.code(204).send();
  });
}
```

## Regras de Negócio

| Entidade | Regra |
|----------|-------|
| Customer | CPF único por agência |
| Trip | available <= capacity |
| Offer | price < trip.price |
| Sale | status: PENDING → CONFIRMED → PAID |

## RBAC

```typescript
const permissions = {
  OWNER:  ['*'],
  ADMIN:  ['users.*', 'customers.*', 'trips.*', 'sales.*'],
  MANAGER: ['customers.*', 'trips.*', 'offers.*', 'sales.*'],
  AGENT:  ['customers.read', 'customers.create', 'trips.read', 'sales.create'],
  VIEWER: ['*.read'],
};
```

## Regras

1. ** agency_id** - Sempre do contexto, nunca do frontend
2. **Validação** - Zod em todo input
3. **Erro** - Tratamento consistente
4. **Log** - Operações sensíveis auditadas

## Documentos

- `docs/05-api/api-guidelines.md`
- `docs/05-api/authentication.md`
- `docs/05-api/error-handling.md`
- `docs/02-domain/`
