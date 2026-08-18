# Offer (Oferta)

## Definição

Offer é uma oferta reutilizável/interna da Agency. Ela representa aquilo que a
agência oferece antes de virar uma Proposal direcionada a um Customer.

Offer não é Wish, Proposal, Sale, Trip nem captura externa do futuro Pescador.

## Propriedades

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | UUID | Sim | Identificador único |
| `agencyId` | UUID | Sim | Agência dona do registro |
| `tripId` | UUID | Sim | Viagem vinculada no modelo atual; deve ser revisado após ADR-004 |
| `name` | String | Sim | Nome da oferta |
| `price` | Decimal | Sim | Preço com desconto |
| `discount` | Decimal | Não | Percentual de desconto |
| `validFrom` | DateTime | Sim | Data de início |
| `validTo` | DateTime | Sim | Data de término |
| `status` | Enum | Sim | ACTIVE, INACTIVE, EXPIRED |
| `createdAt` | DateTime | Sim | Data de criação |
| `updatedAt` | DateTime | Sim | Data de atualização |

## Regras de Negócio

1. **Isolamento:** Oferta pertence a apenas 1 agência
2. **Vínculo:** O vínculo obrigatório com Trip deve ser revisado após ADR-004, pois Trip passa a representar viagem concreta do cliente
3. **Validade:** `validTo` deve ser posterior a `validFrom`
4. **Preço:** Deve ser menor que o preço da viagem
5. **Desconto:** Entre 0% e 100%
6. **Expiração:** Status muda para EXPIRED automaticamente
7. **Pescador:** Não adicionar proveniência externa diretamente em Offer no V1

## Validações

```typescript
// Nome: 2-100 caracteres
name: z.string().min(2).max(100)

// Preço: positivo
price: z.number().positive()

// Desconto: 0-100%
discount: z.number().min(0).max(100).optional()

// Validade: futuro
validFrom: z.date()
validTo: z.date()
```

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/trips/:tripId/offers` | Listar ofertas da viagem |
| POST | `/trips/:tripId/offers` | Criar oferta |
| PUT | `/offers/:id` | Atualizar oferta |
| DELETE | `/offers/:id` | Remover oferta |

## Exemplo

```json
{
  "id": "990e8400-e29b-41d4-a716-446655440004",
  "agencyId": "660e8400-e29b-41d4-a716-446655440001",
  "tripId": "880e8400-e29b-41d4-a716-446655440003",
  "name": "Early Bird - 20% OFF",
  "price": 3600.00,
  "discount": 20.00,
  "validFrom": "2026-01-25T00:00:00Z",
  "validTo": "2026-02-28T23:59:59Z",
  "status": "ACTIVE",
  "createdAt": "2026-01-25T09:30:00Z"
}
```
