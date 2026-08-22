# Autorização

## Hierarquia de Roles

```
OWNER (100)
  └── Pode tudo na agência
  └── Não pode ser removido

ADMIN (80)
  └── Gerencia usuários
  └── Gerencia configurações
  └── Acessa tudo

MANAGER (60)
  └── Gerencia equipe
  └── Gerencia viagens/ofertas
  └── Vê relatórios

AGENT (40)
  └── Cadastra clientes
  └── Registra vendas
  └── Vê suas vendas

VIEWER (20)
  └── Apenas visualiza
  └── Sem edição
```

## Matriz de Permissões

| Recurso | OWNER | ADMIN | MANAGER | AGENT | VIEWER |
|---------|-------|-------|---------|-------|--------|
| **Agency** | | | | | |
| Ver perfil | ✅ | ✅ | ✅ | ✅ | ✅ |
| Editar perfil | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Users** | | | | | |
| Listar | ✅ | ✅ | ✅ | ❌ | ❌ |
| Criar | ✅ | ✅ | ❌ | ❌ | ❌ |
| Editar | ✅ | ✅ | ❌ | ❌ | ❌ |
| Remover | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Customers** | | | | | |
| Listar | ✅ | ✅ | ✅ | ✅* | ✅ |
| Criar | ✅ | ✅ | ✅ | ✅ | ❌ |
| Editar | ✅ | ✅ | ✅ | ✅* | ❌ |
| Remover | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Trips** | | | | | |
| Listar | ✅ | ✅ | ✅ | ✅ | ✅ |
| Criar | ✅ | ✅ | ✅ | ❌ | ❌ |
| Editar | ✅ | ✅ | ✅ | ❌ | ❌ |
| Remover | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Offers** | | | | | |
| Listar | ✅ | ✅ | ✅ | ✅ | ✅ |
| Criar | ✅ | ✅ | ✅ | ❌ | ❌ |
| Editar | ✅ | ✅ | ✅ | ❌ | ❌ |
| Remover | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Proposals** | | | | | |
| Listar | ✅ | ✅ | ✅ | ✅ | ✅ |
| Criar | ✅ | ✅ | ✅ | ❌ | ❌ |
| Editar | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Sales** | | | | | |
| Listar todas | ✅ | ✅ | ✅ | ❌ | ❌ |
| Listar próprias | ✅ | ✅ | ✅ | ✅ | ✅ |
| Criar | ✅ | ✅ | ✅ | ✅ | ❌ |
| Editar status | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Brokers** | | | | | |
| Listar | ✅ | ✅ | ✅ | ❌ | ❌ |
| Criar | ✅ | ✅ | ❌ | ❌ | ❌ |
| Editar | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Reports** | | | | | |
| Dashboard | ✅ | ✅ | ✅ | ✅* | ✅ |
| Relatórios | ✅ | ✅ | ✅ | ❌ | ❌ |

\* Apenas seus próprios registros

## Implementação

### Middleware de Role

```typescript
import type { FastifyReply, FastifyRequest } from 'fastify';

function requireRole(minRole: UserRole) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const context = getTenantContext();
    const currentLevel = ROLE_HIERARCHY[context.userRole];
    const requiredLevel = ROLE_HIERARCHY[minRole];

    if (currentLevel < requiredLevel) {
      return reply.code(403).send({
        error: 'Insufficient permissions'
      });
    }
  };
}

// Uso
app.get('/users', { preHandler: requireRole('ADMIN') }, listUsers);
app.post('/trips', { preHandler: requireRole('MANAGER') }, createTrip);
```

### Validação de Ownership

```typescript
async function validateOwnership(resourceId: string, userId: string) {
  const resource = await getResource(resourceId);

  if (resource.userId !== userId && resource.agencyId !== getAgencyId()) {
    throw new ForbiddenError('Access denied');
  }
}
```
