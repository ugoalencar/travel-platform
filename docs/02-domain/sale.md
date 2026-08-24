# Sale (Venda)

## Definição

Sale é o registro de uma venda comercial fechada para um Customer específico,
opcionalmente originada de um Proposal e/ou intermediada por um Broker. É o
passo depois de Proposal ("o que foi proposto") e antes de Trip/Commission
(ainda fora de escopo desta vertical).

Sale não é Proposal, Offer, Wish, Trip nem Booking/Commission/Financial. Este
primeiro corte da vertical cobre apenas leitura e escrita dos dados
comerciais (valor, desconto, total e notas); qualquer fluxo de transição de
status, gestão de pagamento (`paidAt`) ou geração automática de Commission
fica fora de escopo.

## Propriedades

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | UUID | Sim | Identificador único |
| `agencyId` | UUID | Sim | Agência dona do registro |
| `customerId` | UUID | Sim | Customer para quem a venda foi feita |
| `proposalId` | UUID | Não | Proposal de origem, se houver. No máximo 1 Sale por Proposal (`UNIQUE(agency_id, proposal_id)`) |
| `brokerId` | UUID | Não | Broker intermediário, se houver |
| `userId` | UUID | Sim | Usuário responsável. Não é enviável pelo cliente (rejeitado em POST/PATCH) — é sempre atribuído server-side a partir da sessão autenticada atual |
| `amount` | Decimal(10,2) | Sim | Valor da venda, entrada monetária do usuário |
| `discount` | Decimal(10,2) | Não (padrão 0) | Valor de desconto **absoluto** (nunca percentual) |
| `total` | Decimal(10,2) | Sim | **Sempre calculado pelo servidor**: `total = amount - discount`. O cliente nunca pode enviar este campo — é rejeitado com 400 se presente no corpo da requisição |
| `status` | Enum | Sim (padrão PENDING) | PENDING, CONFIRMED, PAID, CANCELLED, REFUNDED. **Somente leitura nesta vertical (DEFERRED)** — não há endpoint, campo, botão de transição ou lógica que permita alterá-lo; sempre retornado exatamente como armazenado |
| `notes` | String | Não | Notas internas |
| `paidAt` | DateTime | Não | Data de pagamento. **Não gerenciado nesta vertical** — sempre `null` na criação e nunca alterável via PATCH |
| `createdAt` | DateTime | Sim | Data de criação |
| `updatedAt` | DateTime | Sim | Data de atualização |

## Regras de Negócio

1. **Isolamento:** Sale pertence a apenas 1 agência (tenant), reforçado por
   RLS em `002_rls_policies.sql` (`sales_select/insert/update/delete_tenant`).
2. **Customer obrigatório:** toda Sale exige um `customerId` que pertença
   à mesma agência do tenant atual; caso contrário, 404 (Customer não
   encontrado) — nunca um erro que revele a existência do recurso de outro
   tenant.
3. **Proposal e Broker opcionais:** se informados, `proposalId`/`brokerId`
   também devem pertencer à mesma agência; caso contrário, 404. Nenhuma
   re-vinculação é permitida depois da criação (`customerId`/`proposalId`/
   `brokerId` são proibidos no PATCH). Uma tentativa de criar uma segunda
   Sale para o mesmo `proposalId` é rejeitada de forma limpa (409 Conflict),
   sem vazar o nome da constraint SQL na resposta de erro.
4. **Sem sincronização automática com Proposal (D3):** `amount`/`discount`
   são entradas independentes do usuário — não há herança automática do
   `proposedPrice`/`total` de um Proposal vinculado. O frontend pode
   pré-preencher `amount` a partir do `total` do Proposal selecionado como
   conveniência de UX ao criar a venda, mas isso é reversível e nunca vira
   uma regra de sincronização no backend (nem na criação, nem em leituras
   subsequentes).
5. **Sem moeda assumida (D1):** nenhum símbolo ou unidade de moeda é
   adicionado em nenhuma camada — os valores são números simples, mesma
   convenção silenciosa de Offer/Proposal.
6. **Cálculo de preço (regra central, D2):**
   - `amount` é uma entrada monetária obrigatória, digitada pelo usuário.
   - `discount` é sempre um valor absoluto (nunca percentual, nunca símbolo
     de moeda), com padrão 0.
   - `total = amount - discount`, sempre calculado no servidor (aritmética
     em centavos para evitar erros de ponto flutuante), nunca aceito como
     entrada do cliente (create ou update).
   - Validações: `amount >= 0`, `discount >= 0`, `discount <= amount`,
     `total >= 0` (decorre da regra anterior, mas também validado
     explicitamente).
7. **Status somente leitura (D4):** `status` nunca é aceito em POST ou PATCH
   (rejeitado com 400 `VALIDATION_ERROR`). Não existe dropdown, botão de
   transição ou efeito colateral em nenhuma camada.
8. **Sem efeito colateral em Commission:** criar ou atualizar uma Sale nunca
   cria, atualiza ou referencia registros de Commission — essa vertical
   ainda não foi implementada e fica inteiramente fora de escopo aqui.

## Endpoints

| Método | Rota | RBAC (piso) | Descrição |
|--------|------|-------------|-----------|
| GET | `/sales` | VIEWER | Listar vendas do tenant atual (lista única; ver nota abaixo) |
| GET | `/sales/:id` | VIEWER | Detalhes de uma venda |
| POST | `/sales` | AGENT | Criar venda |
| PATCH | `/sales/:id` | AGENT | Atualizar campos comerciais (valor, desconto, notas) |

Nota sobre RBAC de listagem: `docs/03-security/authorization.md` documenta
duas semânticas para Sale — "Listar todas" (OWNER/ADMIN/MANAGER) e "Listar
próprias" (todos os 5 papéis). Como `userId` nunca é populado a partir de
entrada do cliente nesta vertical (é sempre atribuído a partir da sessão
autenticada, nunca escolhido pelo usuário), não existe um subconjunto "próprio"
controlável pelo cliente para filtrar — por isso `GET /sales` é implementado
como uma única listagem em nível de tenant, no piso mais baixo documentado
("listar próprias" = VIEWER+), o que é consistente com as duas linhas
documentadas já que não há um subconjunto mais estreito a ocultar de um
VIEWER. "Editar status" (piso próprio, mais alto) não é exercida por nenhuma
rota nesta vertical, pois o status é tratado como somente leitura (D4).

## Exemplo

```json
{
  "id": "bb0e8400-e29b-41d4-a716-446655440020",
  "agencyId": "660e8400-e29b-41d4-a716-446655440001",
  "customerId": "770e8400-e29b-41d4-a716-446655440002",
  "proposalId": "aa0e8400-e29b-41d4-a716-446655440010",
  "amount": 3600.00,
  "discount": 200.00,
  "total": 3400.00,
  "status": "PENDING",
  "createdAt": "2026-02-01T09:30:00Z",
  "updatedAt": "2026-02-01T09:30:00Z"
}
```
