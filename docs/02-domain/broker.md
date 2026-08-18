# Broker (Parceiro)

## Definição

Broker é um parceiro que indica clientes para a agência e recebe comissão sobre as vendas.

## Propriedades

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | UUID | Sim | Identificador único |
| `agencyId` | UUID | Sim | Agência dona do registro |
| `name` | String | Sim | Nome do broker |
| `email` | String | Sim | Email (único por agência) |
| `phone` | String | Não | Telefone |
| `commission` | Decimal | Sim | Comissão padrão (%) |
| `status` | Enum | Sim | ACTIVE, INACTIVE |
| `createdAt` | DateTime | Sim | Data de criação |
| `updatedAt` | DateTime | Sim | Data de atualização |

## Regras de Negócio

1. **Isolamento:** Broker pertence a apenas 1 agência
2. **Comissão:** Percentual entre 0% e 50%
3. **Vendas:** Broker pode ser vinculado a vendas
4. **Relatório:** Agência pode ver total de vendas e comissões do broker

## Validações

```typescript
// Nome: 2-100 caracteres
name: z.string().min(2).max(100)

// Email: formato válido
email: z.string().email()

// Comissão: 0-50%
commission: z.number().min(0).max(50)
```

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/brokers` | Listar brokers |
| POST | `/brokers` | Criar broker |
| GET | `/brokers/:id` | Detalhes do broker |
| PUT | `/brokers/:id` | Atualizar broker |
| DELETE | `/brokers/:id` | Remover broker |

## Exemplo

```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "agencyId": "660e8400-e29b-41d4-a716-446655440001",
  "name": "Maria Santos",
  "email": "maria@parceira.com",
  "phone": "11988887777",
  "commission": 10.00,
  "status": "ACTIVE",
  "createdAt": "2026-01-20T14:00:00Z"
}
```
