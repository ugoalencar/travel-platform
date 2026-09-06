# STREAM 03 — FINANCEIRO COMPLETO

## Missão
Transformar Financeiro em módulo financeiro real e remover mistura conceitual com Pescador.

## Navegação
FINANCEIRO
- Dashboard
- Receitas
- Despesas
- Contas a receber
- Contas a pagar
- Caixa / movimentações
- Conciliação
- Categorias
- Centros de custo se domínio comportar
- Relatórios

PESCADOR deve permanecer fora da seção Financeiro.

## Dashboard financeiro
Indicadores:
- receita no período
- despesas no período
- saldo
- contas a receber
- contas a pagar
- vencidos
- margem
- vendas
- ticket médio
- fluxo de caixa projetado

Filtros:
- período
- status
- categoria
- vendedor/agente se aplicável

## Receitas
CRUD:
- origem
- venda/booking relacionado
- cliente
- descrição
- categoria
- valor
- moeda
- competência
- vencimento
- recebimento
- forma de pagamento
- status
- observação

## Despesas
CRUD:
- fornecedor
- descrição
- categoria
- valor
- vencimento
- pagamento
- forma
- recorrência se suportada
- status

## Contas a receber/pagar
Status:
- aberto
- parcial
- pago
- vencido
- cancelado

Pagamento parcial se arquitetura suportar de forma segura.

## Caixa
Movimentações:
- entrada
- saída
- ajuste
- origem
- data
- saldo calculado

Não permitir alteração direta de saldo sem lançamento/audit trail.

## Conciliação
Base funcional:
- lançamento esperado
- lançamento recebido/pago
- status conciliado/não conciliado
Integração bancária futura provider-based.

## Categorias
Receitas/despesas configuráveis por tenant.

## Relatórios
- DRE gerencial simplificada
- fluxo de caixa
- contas vencidas
- receitas por período
- despesas por categoria
- margem por venda/booking
- recebimentos

## Precisão
Usar money/decimal-safe existente.
Nunca float ingênuo.

## Segurança
RBAC
tenant scope
RLS/FORCE
audit
sem cross-tenant
customer não acessa financeiro interno

## Integração
Sale/Booking → financeiro:
evitar duplicidade
definir vínculo
testar idempotência

## UI
create/edit/view/filter/paginate/export se houver base.
Dashboard com cards + tabelas + gráficos simples se suportado.

## Testes
CRUD receitas/despesas
parcial/pago/vencido
totalizadores
rounding
duplicate submit
sale→financial idempotency
cross-tenant
RBAC
reports consistency
audit
human-like flow

## Final
P0=0
P1=0
READY FOR PRODUCT INTEGRATION
