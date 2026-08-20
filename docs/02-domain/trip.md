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
| `customerId` | UUID | Sim | Cliente/viajante associado à viagem |
| `saleId` | UUID | Não | Venda de origem, quando a viagem decorre de uma venda |
| `name` | String | Sim | Nome da viagem concreta |
| `destination` | String | Sim | Destino |
| `description` | String | Não | Descrição detalhada |
| `startDate` | Date | Sim | Data de início |
| `endDate` | Date | Sim | Data de término |
| `status` | Enum | Sim | PLANNED, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED |
| `notes` | String | Não | Observações internas |
| `metadata` | JSON | Não | Dados extras (fotos, itinerário) |
| `createdAt` | DateTime | Sim | Data de criação |
| `updatedAt` | DateTime | Sim | Data de atualização |

## Regras de Negócio

1. **Isolamento:** Viagem pertence a apenas 1 agência
2. **Cliente:** Viagem deve estar associada ao cliente/viajante no modelo V1
3. **Histórico:** Trip é a base do histórico de viagens do cliente
4. **Reservas:** A partir do V1.1, uma Trip pode agrupar múltiplos Bookings
5. **Datas:** `endDate` deve ser igual ou posterior a `startDate`

## Validações

```typescript
// Nome: obrigatório
name: z.string().min(1)

// Destino: obrigatório
destination: z.string().min(1)

// Datas: endDate >= startDate
startDate: z.date()
endDate: z.date()
```

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/trips` | Listar viagens |
| GET | `/trips/:id` | Detalhes da viagem |
| POST | `/trips` | Criar viagem |
| PATCH | `/trips/:id` | Atualizar viagem |

## Exemplo

```json
{
  "id": "880e8400-e29b-41d4-a716-446655440003",
  "agencyId": "660e8400-e29b-41d4-a716-446655440001",
  "customerId": "770e8400-e29b-41d4-a716-446655440002",
  "name": "Viagem de João para Cancún",
  "destination": "Cancún, México",
  "description": "Viagem concreta do cliente, originada de uma venda aceita",
  "startDate": "2026-06-15",
  "endDate": "2026-06-22",
  "status": "PLANNED",
  "createdAt": "2026-01-25T09:00:00Z"
}
```
