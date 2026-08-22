# Offer (Oferta)

## Definição

Offer é uma oferta reutilizável/interna da Agency. Ela representa aquilo que a
agência oferece antes de virar uma Proposal direcionada a um Customer.

Offer não é Wish, Proposal, Sale, Trip nem captura externa do futuro Pescador.
Offer pertence apenas à Agency — não há vínculo obrigatório com Trip, Customer
ou Wish no modelo atual.

## Propriedades

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | UUID | Sim | Identificador único |
| `agencyId` | UUID | Sim | Agência dona do registro |
| `name` | String | Sim | Nome da oferta |
| `description` | String | Não | Descrição da oferta |
| `price` | Decimal | Sim | Preço da oferta |
| `validFrom` | DateTime | Não | Data/hora de início de validade |
| `validUntil` | DateTime | Não | Data/hora de término de validade |
| `status` | Enum | Sim | ACTIVE, INACTIVE, EXPIRED |
| `createdAt` | DateTime | Sim | Data de criação |
| `updatedAt` | DateTime | Sim | Data de atualização |

## Regras de Negócio

1. **Isolamento:** Oferta pertence a apenas 1 agência
2. **Sem vínculo obrigatório:** Offer não possui relação obrigatória com Trip,
   Customer ou Wish no V1
3. **Validade:** quando ambas as datas são informadas, `validFrom` deve ser
   anterior ou igual a `validUntil`
4. **Preço:** deve ser maior ou igual a zero
5. **Expiração (leitura derivada):** o campo `status` persistido nunca é
   alterado automaticamente. Toda leitura (GET, list, e as respostas de
   create/update) exibe `status = EXPIRED` quando `validUntil` está no
   passado (`validUntil < now()`), computado em tempo de leitura, sem
   nenhuma escrita, cron, trigger ou job em segundo plano
6. **Pescador:** Não adicionar proveniência externa diretamente em Offer no V1

## Validações

```typescript
// Nome: obrigatório
name: z.string().min(1)

// Preço: não-negativo
price: z.number().min(0)

// Validade: validFrom <= validUntil quando ambos informados
validFrom: z.date().optional()
validUntil: z.date().optional()

// status (PATCH apenas): ACTIVE, INACTIVE ou EXPIRED
status: z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED']).optional()
```

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/offers` | Listar ofertas |
| GET | `/offers/:id` | Detalhes da oferta |
| POST | `/offers` | Criar oferta |
| PATCH | `/offers/:id` | Atualizar oferta |

## Exemplo

```json
{
  "id": "990e8400-e29b-41d4-a716-446655440004",
  "agencyId": "660e8400-e29b-41d4-a716-446655440001",
  "name": "Early Bird",
  "price": 3600.00,
  "validFrom": "2026-01-25T00:00:00Z",
  "validUntil": "2026-02-28T23:59:59Z",
  "status": "ACTIVE",
  "createdAt": "2026-01-25T09:30:00Z"
}
```
