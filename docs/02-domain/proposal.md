# Proposal (Proposta)

## Definição

Proposal é uma proposta comercial direcionada a um Customer específico,
opcionalmente originada de um Offer e/ou de um Wish. É o passo entre "o que a
agência oferece" (Offer) / "o que o cliente quer" (Wish) e uma futura venda
(Sale, ainda não implementada).

Proposal não é Offer, Wish, Sale, Trip nem Booking/Commission/Financial. Este
primeiro corte da vertical cobre apenas leitura e escrita dos dados
comerciais (preço, desconto, total, validade, condições e notas); qualquer
fluxo de transição de status ou geração automática de Sale fica fora de
escopo.

## Propriedades

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | UUID | Sim | Identificador único |
| `agencyId` | UUID | Sim | Agência dona do registro |
| `customerId` | UUID | Sim | Customer para quem a proposta é feita |
| `offerId` | UUID | Não | Offer de origem, se houver |
| `wishId` | UUID | Não | Wish de origem, se houver |
| `userId` | UUID | Não | Usuário responsável (não setável pelo cliente nesta vertical; sempre `null` na criação) |
| `proposedPrice` | Decimal(10,2) | Sim | Preço proposto, entrada monetária do usuário |
| `discount` | Decimal(10,2) | Não (padrão 0) | Valor de desconto **absoluto** (nunca percentual) |
| `total` | Decimal(10,2) | Sim | **Sempre calculado pelo servidor**: `total = proposedPrice - discount`. O cliente nunca pode enviar este campo — é rejeitado com 400 se presente no corpo da requisição |
| `validUntil` | DateTime | Não | Data/hora de validade da proposta |
| `conditions` | String | Não | Condições comerciais em texto livre |
| `notes` | String | Não | Notas internas |
| `status` | Enum | Sim (padrão DRAFT) | DRAFT, SENT, ACCEPTED, DECLINED, EXPIRED, CANCELLED. **Somente leitura nesta vertical** — não há endpoint, campo ou lógica que permita alterá-lo; é sempre retornado exatamente como armazenado, sem nenhuma derivação em tempo de leitura (diferente de Offer). Transições de status ficam propositalmente fora de escopo até que Sale exista. |
| `createdAt` | DateTime | Sim | Data de criação |
| `updatedAt` | DateTime | Sim | Data de atualização |

## Regras de Negócio

1. **Isolamento:** Proposal pertence a apenas 1 agência (tenant), reforçado por
   RLS em `002_rls_policies.sql` (`proposals_select/insert/update/delete_tenant`).
2. **Customer obrigatório:** toda Proposal exige um `customerId` que pertença
   à mesma agência do tenant atual; caso contrário, 404 (Customer não
   encontrado) — nunca um erro que revele a existência do recurso de outro
   tenant.
3. **Offer e Wish opcionais:** se informados, `offerId`/`wishId` também devem
   pertencer à mesma agência; caso contrário, 404. Nenhuma re-vinculação é
   permitida depois da criação (`offerId`/`wishId`/`customerId` são proibidos
   no PATCH).
4. **Cálculo de preço (regra central):**
   - `proposedPrice` é uma entrada monetária independente, digitada pelo
     usuário. Não há herança automática do preço de um Offer vinculado — o
     frontend pode pré-preencher o campo como conveniência de UX ao
     selecionar um Offer, mas isso é reversível e nunca vira uma regra de
     sincronização no backend.
   - `discount` é sempre um valor absoluto (nunca percentual, nunca símbolo
     de moeda).
   - `total = proposedPrice - discount`, sempre calculado no servidor, nunca
     aceito como entrada do cliente (create ou update).
   - Validações: `proposedPrice >= 0`, `discount >= 0`,
     `discount <= proposedPrice`, `total >= 0` (decorre da regra anterior,
     mas também validado explicitamente).
   - Se o Offer vinculado mudar de preço depois, a Proposal existente **não**
     é recalculada — não há trigger, job ou recomputo em leitura.
5. **Status somente leitura:** `status` nunca é aceito em POST ou PATCH
   (rejeitado com 400 `VALIDATION_ERROR`). Não existe dropdown, botão de
   transição ou efeito colateral em nenhuma camada.

## Endpoints

| Método | Rota | RBAC (piso) | Descrição |
|--------|------|-------------|-----------|
| GET | `/proposals` | VIEWER | Listar propostas do tenant atual |
| GET | `/proposals/:id` | VIEWER | Detalhes de uma proposta |
| POST | `/proposals` | MANAGER | Criar proposta |
| PATCH | `/proposals/:id` | MANAGER | Atualizar campos comerciais (preço, desconto, validade, condições, notas) |

## Exemplo

```json
{
  "id": "aa0e8400-e29b-41d4-a716-446655440010",
  "agencyId": "660e8400-e29b-41d4-a716-446655440001",
  "customerId": "770e8400-e29b-41d4-a716-446655440002",
  "offerId": "990e8400-e29b-41d4-a716-446655440004",
  "proposedPrice": 3600.00,
  "discount": 200.00,
  "total": 3400.00,
  "validUntil": "2026-03-15T23:59:59Z",
  "status": "DRAFT",
  "createdAt": "2026-02-01T09:30:00Z",
  "updatedAt": "2026-02-01T09:30:00Z"
}
```
