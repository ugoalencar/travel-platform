# Travel Lite — Hardening pré-homologação (Gadotti)

Escopo: somente gaps da auditoria funcional que **não dependem de decisão
da cliente**. Regras de negócio ainda não confirmadas ficam em
[Decisões pendentes da cliente](#pending-client-decision).

## O que mudou

### Clientes

A tela de cadastro/edição passou a expor todos os campos que já existiam no
banco e na API: data de nascimento, CEP, rua, número, complemento, bairro,
cidade, UF, observações e, na edição, o status. Sem mudança de schema. Ao
editar, um campo apagado é enviado como `null` e é de fato limpo.

### Relatório de vendedores

- `GET /reports/sellers?from&to&seller_id&category_id&status[&format=csv]`
  devolve, por vendedor: quantidade de vendas, valor vendido, custo, margem,
  recebido, a receber, comissão gerada, comissão paga, comissão a pagar e
  quantas vendas estão com comissão aguardando regra.
- Sem `status`, contam só as vendas efetivas (`CONFIRMED`, `PARTIALLY_PAID`
  e `PAID`); rascunhos e canceladas não são "vendido".
- `status` aceita um valor ou uma lista separada por vírgula, tanto aqui
  quanto em `/reports/sales`.
- **Drill-down:** `GET /reports/sales` com os mesmos filtros + `seller_id`.
  As duas rotas usam a mesma consulta por venda (`loadSalesReportRows`), então
  a soma das vendas listadas é sempre igual à linha do vendedor.
- `/reports/sales` passou a trazer também `received_amount`,
  `pending_amount`, `commission_amount` e `commission_status` por venda.
- **Definições:**
  - *recebido / a receber*: parcelas não canceladas da venda;
  - *comissão a pagar*: comissão com valor, `PENDING` ou `APPROVED`;
  - *comissão paga*: `PAID`;
  - `PENDING_RULE` não tem valor e aparece só como contagem.
- **Tela:**
  - em Relatórios › Vendedores, clicar no nome do vendedor lista as vendas
    que formam os totais;
  - em Vendedores › Resumo aparece o resumo do período (padrão: mês atual),
    com o link "Ver vendas deste vendedor".

### Permissões financeiras

| Ação | Antes | Agora |
|---|---|---|
| Pagar conta a pagar (inclui comissão) — `POST /payables/:id/pay` | OPERATOR+ | **MANAGER/ADMIN** |
| Estornar recebimento/pagamento — `POST /payments/:id/reverse` | — | **MANAGER/ADMIN** |
| Aprovar comissão | MANAGER+ | MANAGER+ (sem mudança) |
| Lançar conta a pagar — `POST /payables` | OPERATOR+ | OPERATOR+ (sem mudança) |
| Registrar recebimento de cliente — `POST /receivables/:id/receive` | OPERATOR+ | OPERATOR+ (sem mudança; ver decisão pendente) |

A tela esconde "Pagar" e "Estornar" de quem não é gerente ou administrador.
Quem garante a regra é a API, que responde 403.

### Estorno controlado

`POST /payments/:id/reverse` com `{ reason, reversed_at? }` (migration
`003_payment_reversals.sql`).

- O pagamento original e o lançamento no ledger **nunca** são alterados nem
  apagados.
- O estorno grava:
  - um pagamento inverso (direção oposta, mesmo valor e mesma conta), com
    `reversal_of_payment_id`, `reversal_reason` e `created_by`;
  - um lançamento inverso no ledger, com `reversal_of_transaction_id`.
- A conta a receber ou a pagar tem `paid_amount` e status recalculados
  (`OPEN` ou `PARTIALLY_PAID`). A venda volta a `PARTIALLY_PAID` ou
  `CONFIRMED`. Uma comissão paga por aquela conta volta a `APPROVED`. O
  saldo da conta é recomposto pelo próprio ledger.
- O estorno gera um audit event `PAYMENT_REVERSED` (usuário, motivo, valor e
  alvo) e um evento de outbox `PAYMENT_REVERSED`.
- O estorno é idempotente: um segundo estorno do mesmo pagamento responde
  409, e estornar um estorno também responde 409. Índices únicos parciais
  garantem isso também no banco.
- O isolamento entre tenants vale aqui: pagamento de outro tenant → 404.

<a id="pending-client-decision"></a>
## PENDING CLIENT DECISION

Não implementado de propósito. Cada item precisa de resposta da Gadotti antes
de virar regra.

| # | Tema | Pergunta |
|---|---|---|
| 1 | Momento da comissão | Comissão é devida no fechamento da venda (comportamento atual) ou só no recebimento? |
| 2 | Comissão proporcional | Com venda parcelada, a comissão é liberada por parcela recebida? |
| 3 | Comissão por categoria | O percentual muda por categoria (aéreo, terrestre, excursão, outros)? |
| 4 | Divisão de venda | Uma venda pode ser dividida entre duas vendedoras? Em que proporção? |
| 5 | Entrada | Há entrada com valor ou data diferente das demais parcelas? |
| 6 | Formas de pagamento | Uma venda pode ter mais de uma forma de pagamento (ex.: PIX + cartão)? |
| 7 | Taxa de cartão | A taxa da maquininha deve ser descontada (da margem ou do recebido)? |
| 8 | Margem negativa | Existe venda com prejuízo ou cortesia? Hoje o banco recusa margem negativa. |
| 9 | Fechamento mensal | Precisam travar meses já fechados contra alterações e estornos? |
| 10 | Transferência entre contas | Movimentam dinheiro entre contas (banco ↔ caixa)? |
| 11 | Fornecedor estruturado | Precisam de cadastro de fornecedor (hoje só texto livre na conta a pagar)? |
| 12 | Localizador | Registrar localizador/PNR na venda? |
| 13 | Passageiros | Registrar passageiros por venda? |
| 14 | Data da viagem | Registrar a data da viagem (diferente da data da venda)? |
| 15 | Quem registra recebimento | Operadoras podem dar baixa em recebimento de cliente ou só a gestão? |
| 16 | Perfil de gestor | Além da Patricia, alguém mais deve ter perfil de gerente (pagar, estornar, aprovar comissão)? |
| 17 | Data do estorno | O estorno pode ter data retroativa ou deve sempre usar a data do dia? |
