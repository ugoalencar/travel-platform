# Customer (Cliente)

## Definição

Cliente é a pessoa que compra pacotes de viagem através da agência.

A identidade técnica principal de Customer é `id` (UUID). CPF e email são
atributos de negócio para identificação, contato e deduplicação dentro da Agency,
mas não são identidade técnica nem identificadores globais.

## Propriedades

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | UUID | Sim | Identificador único |
| `agencyId` | UUID | Sim | Agência dona do registro |
| `name` | String | Sim | Nome completo |
| `email` | String | Não | Email (único por agência) |
| `phone` | String | Não | Telefone |
| `cpf` | String | Não | CPF (único por agência) |
| `passport` | String | Não | Número do passaporte |
| `address` | JSON | Não | Endereço |
| `notes` | String | Não | Observações |
| `status` | Enum | Sim | ACTIVE, INACTIVE |
| `createdAt` | DateTime | Sim | Data de criação |
| `updatedAt` | DateTime | Sim | Data de atualização |

## Regras de Negócio

1. **Isolamento:** Cliente pertence a apenas 1 agência
2. **Identidade técnica:** `id` (UUID)
3. **CPF:** Opcional; único por agência quando informado
4. **Email:** Opcional, mutável; único por agência quando informado
5. **Remoção:** Soft delete (status = INACTIVE)

## Validações

```typescript
// Nome: 2-100 caracteres
name: z.string().min(2).max(100)

// Email: formato válido
email: z.string().email().optional()

// CPF: 11 dígitos
cpf: z.string().regex(/^\d{11}$/).optional()

// Telefone: formato brasileiro
phone: z.string().regex(/^\d{10,11}$/).optional()
```

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/customers` | Listar (paginado, busca) |
| POST | `/customers` | Criar |
| GET | `/customers/:id` | Detalhes |
| PUT | `/customers/:id` | Atualizar |
| DELETE | `/customers/:id` | Remover (soft delete) |

## Exemplo

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "agencyId": "660e8400-e29b-41d4-a716-446655440001",
  "name": "João Silva",
  "email": "joao@email.com",
  "phone": "11999998888",
  "cpf": "12345678901",
  "passport": "AB123456",
  "status": "ACTIVE",
  "createdAt": "2026-01-15T10:30:00Z"
}
```
