# Wish (Desejo)

## Definição

Wish faz parte do V1.

Wish é uma intenção estruturada de viagem do cliente sobre viagens futuras. Ajuda
a agência a oferecer pacotes personalizados, mas não é Offer, Proposal, Sale,
Lead nem oportunidade comercial.

## Propriedades

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | UUID | Sim | Identificador único |
| `agencyId` | UUID | Sim | Agência dona do registro |
| `customerId` | UUID | Sim | Cliente dono do desejo |
| `destination` | String | Não | Destino desejado |
| `budget` | Decimal | Não | Orçamento máximo |
| `travelersCount` | Int | Não | Número de viajantes |
| `startDate` | DateTime | Não | Data preferida |
| `endDate` | DateTime | Não | Data fim preferida |
| `notes` | String | Não | Observações |
| `status` | Enum | Sim | ACTIVE, MATCHED, PROPOSED, FULFILLED, EXPIRED, CANCELLED |
| `createdAt` | DateTime | Sim | Data de criação |
| `updatedAt` | DateTime | Sim | Data de atualização |

## Regras de Negócio

1. **Isolamento:** Wish pertence a apenas 1 agência
2. **Vínculo:** Sempre pertence a 1 cliente
3. **Status:** Pode evoluir de ACTIVE para MATCHED, PROPOSED e FULFILLED
4. **Expiração/cancelamento:** Pode mudar para EXPIRED ou CANCELLED
5. **V1:** Wish faz parte do modelo V1 aprovado pelo ADR-004

## Casos de Uso

1. **Registrar desejo:** Cliente diz "quero ir a Paris"
2. **Buscar ofertas:** Agência busca viagens que combinam
3. **Notificar:** Quando viagem similar aparece, notifica cliente
4. **Converter:** Cliente compra e desejo vira FULFILLED

## Validações

```typescript
// Destino: 2-100 caracteres
destination: z.string().min(2).max(100).optional()

// Orçamento: positivo
budget: z.number().positive().optional()

// Notas: até 500 caracteres
notes: z.string().max(500).optional()
```

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/customers/:customerId/wishes` | Listar desejos do cliente |
| POST | `/customers/:customerId/wishes` | Criar desejo |
| PUT | `/wishes/:id` | Atualizar desejo |
| DELETE | `/wishes/:id` | Remover desejo |

## Exemplo

```json
{
  "id": "aa0e8400-e29b-41d4-a716-446655440005",
  "agencyId": "660e8400-e29b-41d4-a716-446655440001",
  "customerId": "550e8400-e29b-41d4-a716-446655440000",
  "destination": "Paris, França",
  "budget": 8000.00,
  "travelersCount": 2,
  "startDate": "2026-12-20T00:00:00Z",
  "endDate": "2026-12-31T00:00:00Z",
  "notes": "Lua de mel, quer hotel romântico",
  "status": "ACTIVE",
  "createdAt": "2026-01-15T11:00:00Z"
}
```
