# Trip (Viagem)

## Definição

Trip representa a viagem concreta do cliente e serve como base para histórico.

Trip não representa produto genérico, pacote de catálogo nem Offer. A oferta
reutilizável/interna da agência deve ser modelada como Offer; a condição
comercial direcionada a um cliente deve ser modelada como Proposal.

## Propriedades

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | UUID | Sim | Identificador único |
| `agencyId` | UUID | Sim | Agência dona do registro |
| `name` | String | Sim | Nome da viagem concreta |
| `destination` | String | Sim | Destino |
| `description` | String | Não | Descrição detalhada |
| `startDate` | DateTime | Sim | Data de início |
| `endDate` | DateTime | Sim | Data de término |
| `price` | Decimal | Sim | Preço ou valor de referência da viagem |
| `capacity` | Int | Sim | Capacidade quando aplicável |
| `available` | Int | Sim | Disponibilidade quando aplicável |
| `status` | Enum | Sim | ACTIVE, INACTIVE, SOLD_OUT, CANCELLED |
| `metadata` | JSON | Não | Dados extras (fotos, itinerário) |
| `createdAt` | DateTime | Sim | Data de criação |
| `updatedAt` | DateTime | Sim | Data de atualização |

## Regras de Negócio

1. **Isolamento:** Viagem pertence a apenas 1 agência
2. **Cliente:** Viagem deve estar associada ao cliente/viajante no modelo V1
3. **Histórico:** Trip é a base do histórico de viagens do cliente
4. **Reservas:** A partir do V1.1, uma Trip pode agrupar múltiplos Bookings
5. **Datas:** `endDate` deve ser posterior a `startDate`

## Validações

```typescript
// Nome: 2-200 caracteres
name: z.string().min(2).max(200)

// Destino: 2-100 caracteres
destination: z.string().min(2).max(100)

// Preço: positivo
price: z.number().positive()

// Capacidade: positiva
capacity: z.number().int().positive()

// Disponível: 0 até capacity
available: z.number().int().min(0)

// Datas: endDate > startDate
startDate: z.date()
endDate: z.date()
```

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/trips` | Listar viagens (filtros) |
| POST | `/trips` | Criar viagem |
| GET | `/trips/:id` | Detalhes da viagem |
| PUT | `/trips/:id` | Atualizar viagem |
| DELETE | `/trips/:id` | Remover viagem |

## Exemplo

```json
{
  "id": "880e8400-e29b-41d4-a716-446655440003",
  "agencyId": "660e8400-e29b-41d4-a716-446655440001",
  "name": "Viagem de João para Cancún",
  "destination": "Cancún, México",
  "description": "Viagem concreta do cliente, originada de uma venda aceita",
  "startDate": "2026-06-15T00:00:00Z",
  "endDate": "2026-06-22T00:00:00Z",
  "price": 4500.00,
  "capacity": 20,
  "available": 15,
  "status": "ACTIVE",
  "createdAt": "2026-01-25T09:00:00Z"
}
```
