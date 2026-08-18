# Agency (Agência)

## Definição

Agência é o tenant (inquilino) do sistema. Cada agência opera de forma isolada.

## Propriedades

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | UUID | Sim | Identificador único |
| `name` | String | Sim | Nome da agência |
| `slug` | String | Sim | Slug único (URL-friendly) |
| `cnpj` | String | Não | CNPJ (único) |
| `email` | String | Não | Email de contato |
| `phone` | String | Não | Telefone |
| `address` | JSON | Não | Endereço |
| `settings` | JSON | Não | Configurações |
| `plan` | Enum | Sim | FREE, BASIC, PRO, ENTERPRISE |
| `status` | Enum | Sim | ACTIVE, INACTIVE, SUSPENDED |
| `createdAt` | DateTime | Sim | Data de criação |
| `updatedAt` | DateTime | Sim | Data de atualização |

## Regras de Negócio

1. **Tenant:** Uma agência = um tenant isolado
2. **Plano:** Define limites de uso
3. **Owner:** Agência deve ter exatamente 1 Owner
4. **Remoção:** Agência não pode ser removida (apenas suspensa)

## Planos

| Plano | Clientes | Viagens | Usuários |
|-------|----------|---------|----------|
| FREE | 50 | 10 | 2 |
| BASIC | 500 | 100 | 10 |
| PRO | 5.000 | 500 | 50 |
| ENTERPRISE | Ilimitado | Ilimitado | Ilimitado |

## Validações

```typescript
// Nome: 2-100 caracteres
name: z.string().min(2).max(100)

// Slug: lowercase, hífens, único
slug: z.string().regex(/^[a-z0-9-]+$/)

// CNPJ: 14 dígitos
cnpj: z.string().regex(/^\d{14}$/).optional()
```

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/agencies/me` | Perfil da agência atual |
| PUT | `/agencies/me` | Atualizar agência |

## Exemplo

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "name": "Viagens Brasil",
  "slug": "viagens-brasil",
  "cnpj": "12345678000195",
  "email": "contato@viagensbrasil.com",
  "plan": "BASIC",
  "status": "ACTIVE",
  "createdAt": "2026-01-10T08:00:00Z"
}
```
