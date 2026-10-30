# ADR-007: Domínio "receita da agência" (separado de comissão de funcionário, valor vendido e repasse)

## Status

**Aceito pelo usuário em 2026-10-23**, como rascunhado, com D1 e D3 nos padrões
propostos (AGENCY_COLLECTS por padrão; comissão do funcionário independente do
recebimento do fornecedor). Antes de implementar: a Fase 0 de comissões precisa
estar integrada e validada, e nenhuma migration é aplicada em banco real sem
autorização específica.

## Metadados

- **Origem:** `.claude/ESPECIFICACAO-AJUSTES-GADOTTI-2026-10-23.md`, §2.1–§2.2,
  §8 (Frente 6), §9 (Frente 7), §10 (Frente 8), §11 (Frente 9) e §13 (Onda 0, item b).
- **Decisões de referência:** Gadotti D1 (arrecadação), D3 (comissão do
  funcionário não depende do fornecedor), D4 (arredondamento), D6 (cancelamento
  com receita recebida), D7 (lotes e janelas). A nomenclatura segue a spec §14.
- **Relacionados:** ADR-006 (cronograma e quitação do cliente), ADR-008
  (passageiros e campos de venda), DEC-007, ADR-005.
- **Revisão Codex:** não ocorreu.

## Contexto

- **Não existe receita da agência em nenhum dos produtos.** O Lite tem apenas
  `seller_commissions` (comissão do vendedor). O Full tem apenas
  `commission_entries` e `employee_commission_rules` (comissão do funcionário)
  (spec §8; `COMMISSION-ENGINE-SPEC.md` §1; `employee-commissions.ts`).
- `TravelProduct.commissionPercent` no Full é um campo **armazenado e validado,
  mas não consumido** por nenhum cálculo (grep em `services/api/src`, spec §5).
  Trata-se de dado órfão.
- `SaleItem.commission` no Full: tipo verificado, semântica de uso **não
  verificada** (spec §15).
- A Gadotti é a agência que revende. Ela recebe **% sobre o total**, **% sobre
  parte** (taxas, tarifas), **valor fixo por passageiro** (ônibus intermunicipal),
  **só sobre taxas** (cruzeiro) e **vários fornecedores com percentuais
  distintos** (aéreo e pacotes). Esses são valores de política comercial do
  fornecedor, não regras legais. Devem ser configuração, sem hardcode.
- O relato separa duas linhas de dinheiro: a **receita da agência** (o fornecedor
  paga à agência) e a **comissão do funcionário** (a agência paga ao vendedor).
  Elas são obrigações diferentes e não podem compartilhar tabela de regra.

## Decisão proposta

### 1. Cinco grandezas, cada uma com o seu lugar

| Grandeza | Definição | Onde vive (proposta) | Não confundir com |
| --- | --- | --- | --- |
| Valor vendido (meta) | total vendido ao cliente | `sales.gross_amount` (Lite) / `sales.total` (Full) | receita |
| Componentes | tarifa, taxas, hospedagem, seguro | `sale_items` (Full já tem; Lite ganha, ADR-008) | total |
| Receita da agência | comissão devida **à agência** pelo fornecedor | `agency_revenue_entries` (novo) | margem, comissão do funcionário |
| Repasse ao fornecedor | custo pago ao fornecedor | `payables` / `sale_cost_items` (Lite); `payables` (Full) | receita |
| Comissão do funcionário | obrigação da agência com o vendedor | `seller_commissions` (Lite) / `commission_entries` (Full) | receita |

- Relatórios de resultado somam **receita ou margem**, nunca as duas.
- `margem = vendido − custo` só existe no modelo em que a agência cobra tudo e
  repassa (`AGENCY_COLLECTS`). No modelo `SUPPLIER_COLLECTS` existe apenas receita.
  (Ver Gadotti D1 abaixo.)

### 2. Três eventos distintos (nenhum implica o outro)

| Evento | Significa | Estado da entrada |
| --- | --- | --- |
| **Direito** | a receita passou a ser devida | `ENTITLED` (com `entitled_at`) |
| **Disponibilidade** | a receita entrou num lote ou janela para cobrança do fornecedor | `AVAILABLE` |
| **Liquidação** | o fornecedor pagou de fato a agência | `RECEIVED` |

- Quitação do cliente não é liquidação do fornecedor. Aprovação de cartão não é
  dinheiro recebido; o cadastro da forma de pagamento pode tratá-la como quitada
  apenas para fins de direito (ver item 6).

### 3. Regra de receita versionada (mesmo padrão da COM-01, sem reaproveitar tabelas de comissão)

```text
agency_revenue_scopes(id, scope_owner_id, supplier_id NULL, product_id NULL,
                      category_id NULL, status, legacy_ref)
  precedência: produto+fornecedor > produto > fornecedor+categoria
               > fornecedor > categoria > padrão da agência

agency_revenue_rule_versions(id, scope_id, version_number, effective_from DATE,
  revised_at, revised_by, reason,
  mode           -- PERCENTAGE | FIXED_PER_PASSENGER | FIXED_PER_SALE
                 --   | FIXED_PER_ITEM | NONE
  base_selector  -- LINE_TOTAL | NET_FARE | TAXES | FEES | TAXES_AND_FEES | MARGIN
                 --   (somente para PERCENTAGE)
  value NUMERIC(14,4),
  entitlement_event,       -- ON_SALE_CONFIRMATION | ON_FULL_SETTLEMENT
                           --   | ON_BALANCE_DEADLINE
  settlement_policy_id,
  calc_version)
```

- Versões são **append-only**. Regra nova não altera entradas existentes. Regra
  retroativa não é permitida nesta versão (mesma política do Lite,
  `assertNotRetroactive`).
- Vigência é uma coluna (`effective_from`) e a projeção é calculada. Não se usa
  `valid_until` derivado (defeito R11 do relatório de paridade).

### 4. Cálculo por item e por fornecedor

- Bases, por item (`SaleItem`):
  - `LINE_TOTAL` = qty × preço − desconto + taxas + fees;
  - `NET_FARE` = qty × preço − desconto;
  - `TAXES`, `FEES`, `TAXES_AND_FEES`;
  - `MARGIN` (definição pendente, Q4).
- `receita_item = round_half_up(base_item × taxa / 100, 2)`;
  `receita_venda = Σ receita_item`.
- Cada item gera uma linha em `agency_revenue_entries` com **snapshot completo**:
  versão, base, taxa, memória de cálculo e `calc_version`.
- Fixo por passageiro usa `passenger_count` da venda ou do item (ADR-008).
- **Item sem fornecedor ou sem regra aplicável** gera entrada `PENDING_RULE`:
  valor 0, fora de qualquer relatório de receita reconhecida.
- Arredondamento (Gadotti D4): para a **receita da agência**, half-up
  decimal-safe por item, igual ao `roundMoney` do Lite. Para a **comissão do
  funcionário**, vale o arredondamento atual de cada produto (Gadotti F4, sem
  mudança).

### 5. Estados e transições

- `FORECAST` → `ENTITLED` → `AVAILABLE` → `RECEIVED`, com `CANCELLED` possível
  antes de `RECEIVED`.
- Transições só no servidor, por uma função única de domínio, com auditoria.
- **Modelo de arrecadação (Gadotti D1)**: parâmetro `collection_model` por
  fornecedor ou produto. `AGENCY_COLLECTS` é o padrão proposto (igual ao Lite
  hoje). `SUPPLIER_COLLECTS` é o cliente pagando o fornecedor diretamente.
  Sem essa escolha não se calcula fluxo de caixa.

### 6. Cancelamento, estorno e vínculo com quitação

- Cancelar entrada em `FORECAST`, `ENTITLED` ou `AVAILABLE` → `CANCELLED`, sem
  efeito financeiro.
- Cancelar venda com entrada `RECEIVED` → **409** por padrão (Gadotti D6). Não há
  clawback automático.
- Estorno de baixa do cliente que desfaz a quitação, antes da liquidação do
  fornecedor, devolve a entrada de `ENTITLED` para `FORECAST`.
- Entrada em lote fechado (`AVAILABLE` congelada) não pode ser cancelada sem ajuste
  manual (fora da v1).

### 7. Lotes e janelas (Gadotti D7)

- `settlement_policy` com `mode`:
  - `PER_SALE`: cada entrada `ENTITLED` vira `AVAILABLE` na hora;
  - `BATCH`: agrupa por fornecedor e janela (semanal, quinzenal, mensal ou
    intervalo configurável), com **corte por `entitled_at`** e pagamento previsto
    por `payout_day_offset`.
- **Sem calendário fixo no produto e sem padrão.** Cada fornecedor escolhe a
  política. Não há default (Gadotti D7).
- `agency_revenue_batches(id, supplier_id, window_start, window_end,
  expected_amount, received_amount, status OPEN|CLOSED|RECEIVED, closed_by,
  received_at, legacy_ref)`.
- Fechar o lote congela as entradas. O recebimento efetivo é registrado com
  alocação ao lote, valor, data, conta e referência. A diferença
  (`expected − received`) fica **visível e aberta**; não há baixa automática por
  perda.
- Uma entrada pertence a **no máximo um lote ativo** (índice único parcial). Mesma
  lição do canal único da F3.

### 8. Comissão do funcionário (Gadotti D3)

- Ambientes separados: telas, permissões, tabelas e relatórios próprios. No menu,
  "Comissões de funcionários" (existente) e "Receita da agência" (novo).
- Vínculo opcional: `commission_entries.agency_revenue_entry_id` e
  `seller_commissions.agency_revenue_entry_id` (nulo permitido), **somente para
  análise** ("receita da venda − comissão do funcionário"). **Sem netting.**
- A obrigação com o funcionário **não depende** de o fornecedor ter pago a agência
  (D3, padrão proposto). A liberação existente por recebimento **do cliente**
  permanece como está. Ver F2 abaixo.
- Cancelar receita **não** cancela comissão automaticamente; o sistema sinaliza.
- Base futura `AGENCY_REVENUE` para regra de funcionário: fora do escopo v1.

### 9. Permissões e auditoria

- Permissões propostas: `revenue.rules_manage`, `revenue.read_all`,
  `revenue.receive`. Separadas de `commissions.*`.
- Eventos de auditoria obrigatórios: `AGENCY_REVENUE_RULE_CREATED`,
  `AGENCY_REVENUE_RULE_REVISED`, `AGENCY_REVENUE_CALCULATED`,
  `AGENCY_REVENUE_ENTITLED`, `AGENCY_REVENUE_RECEIVED`,
  `AGENCY_REVENUE_CANCELLED`. Se a gravação do evento falhar, a operação é
  revertida.
- FKs compostas por tenant ou agência e RLS, conforme o produto.

## Alternativas consideradas

1. **Reaproveitar `commission_entries` com um beneficiário "AGENCIA".** Rejeitada:
   as obrigações são diferentes, as bases são diferentes e a mistura cria dupla
   contagem.
2. **Tratar a receita como margem (venda − custo).** Rejeitada: só vale em
   `AGENCY_COLLECTS`, não expressa percentual por fornecedor e perde a granularidade
   por item.
3. **Uma regra por produto (`TravelProduct.commissionPercent`).** Rejeitada: o
   campo é órfão, não há um fornecedor por item e aéreo tem vários fornecedores.
   O escopo com precedência resolve isso.
4. **Netting: abater a receita da comissão do funcionário.** Rejeitada pela D3:
   cria dependência do recebimento do fornecedor e confunde os dois fluxos.
5. **Liberar a receita só com quitação total do cliente, sem parametrizar.**
   Rejeitada como regra fixa; passa a ser uma das três opções de
   `entitlement_event`, escolhida por regra.

## Consequências

**Positivas**

- Os três eventos ficam separados e auditáveis. Relatórios de projeção podem
  dizer o que é contratado, projetado ou indefinido.
- A regra de receita reaproveita o padrão de versões da COM-01, sem um terceiro
  motor desconectado.

**Negativas**

- Novo domínio com tabelas, lotes, políticas e relatórios.
- Pode haver alta carga de cálculo em aéreo com muitos itens. Medir antes de
  otimizar.
- Requer decisões D1 e D7 que ainda não foram tomadas formalmente.

**Testes previstos** (propostos, ainda não existem)

- `agency-revenue-rules.test.ts`: precedência, vigência, versões no mesmo dia.
- `agency-revenue-calc.test.ts`: casos R1–R7 como tabela, com módulo puro de
  cálculo e paridade Full × Lite.
- `agency-revenue-lifecycle.test.ts`: transições válidas e inválidas,
  concorrência, cancelamento.
- `revenue-batches.test.ts`: janelas, corte por `entitled_at`, congelamento,
  diferença, unicidade de lote.
- `revenue-commission-link.test.ts`: vínculo opcional, sem alterar valores, sem
  cancelamento automático.
- Isolamento de tenant e auditoria com rollback.

Casos numéricos de referência (valores ilustrativos, não da Gadotti):

| # | Cenário | Resultado |
| --- | --- | --- |
| R1 | total 1.000,00; 7%; `LINE_TOTAL` | 70,00 |
| R2 | fixo por passageiro 25,00; 4 pax | 100,00 (3 pax → 75,00) |
| R3 | cruzeiro: taxas 1.200,00; 10% só sobre `TAXES` | 120,00 (e não 920,00 sobre o total) |
| R4 | aéreo: A 2.000 @5%, B 3.000 @12%, C 150 @30% | 505,00 sobre venda 5.150,00 (3 snapshots) |
| R5 | 333,33 @7% | 23,33 |
| R6 | 18,50 @3% | 0,56 (half-up); comissão do funcionário mantém F4 |
| R7 | entrada sem regra | `PENDING_RULE`, 0,00 |

## Impacto no Lite e DEC-007 (Full primeiro)

- O Lite não tem receita da agência. Pela DEC-007, o Full implementa domínio,
  regras, entradas, lotes e permissões **antes**. Depois, o Lite recebe o mesmo
  contrato e o mesmo módulo puro de cálculo, com paridade testada.
- O Lite pode omitir a receita da agência se o produto decidir, mas não pode
  oferecê-la antes do Full (DEC-007 §3 e §4).
- **Lacuna de paridade já existente:** `FIXED_PER_PASSENGER` existe no Full e não
  no Lite (`commission-engine.ts:183-194`, `FIXED` é por venda). Isso é divergência
  legada. Deve ser corrigida no Lite como parte de paridade, não como capacidade
  nova.
- **Local do módulo puro de cálculo (pergunta Q5).** Opções: (a) módulo em
  `packages/domain`, importado pelos dois serviços pelo caminho relativo que já é
  usado por `services/api`; (b) duplicado, com teste de paridade. A opção (a)
  reduz duplicação (AGENTS, política de redução de código). A opção (b) preserva a
  separação dos serviços (DEC-007 §5). Não verificado se `services/api-lite`
  importa `packages/domain` hoje.
- Não há fusão de bancos nem de serviços. Mudanças arquiteturais continuam exigindo
  ADR.

## Dependências e decisões humanas pendentes

| Item | Tipo | Efeito neste ADR | Estado |
| --- | --- | --- | --- |
| **D1** (quem recebe do cliente) | **Bloqueante** | Sem D1 não há fluxo de caixa nem `MARGIN`. Sob `SUPPLIER_COLLECTS`, **não está definido** o que dispara `ENTITLED` (a agência não recebe do cliente). Ver Q1. | Padrão proposto: `AGENCY_COLLECTS`. Não aprovado. |
| **D3** (comissão independe do fornecedor) | Decisão humana | Padrão: independente. Se for dependente, o item 8 muda. | Padrão proposto. Não aprovado. |
| **D4** (arredondamento da receita) | Decisão humana | Padrão: half-up por item. | Padrão proposto. Não aprovado. |
| **D6** (cancelar com receita recebida) | Decisão humana | Padrão: 409, sem clawback. | Padrão proposto. Não aprovado. |
| **D7** (lotes e janelas) | Decisão humana | Padrão: sem calendário fixo, sem default, corte por `entitled_at`. | Padrão proposto. Não aprovado. |
| **F2** (fonte de "exige recebimento") | Decisão humana **pendente** | **Bloqueia a liberação de comissão do funcionário por recebimento** (item 8). A spec distingue `requires_receipt` (comissão, existente) de `counts_as_settled_on_authorization` (direito de receita, proposto). Não se pode rotular a regra na UI enquanto F2 não for confirmada. A spec **não** destrava COM-03. | **Continua pendente.** Este ADR não a resolve. |
| **F1** (catálogo de categorias e atribuição no Full) | Decisão tomada, implementação pendente | Necessário para o relatório de receita por vendedor. | Aceita; sem implementação. |
| **F3** (canal único, cancelar com 409) | Decisão tomada | Aplicada ao item 6 e ao item 7 (canal único). | Aceita. |
| **Q1** `SUPPLIER_COLLECTS` | Pergunta | Quando a entrada vira `ENTITLED`? Proposta da spec: "a agência só rastreia pagamento para fins de direito". Precisa de definição. | Aberta |
| **Q2** Razão do recebimento do fornecedor | Pergunta técnica | Usar `payments` (IN) ou tabela nova de recebimento de receita? Spec diz "payments IN ou equivalente". | Aberta |
| **Q3** Produto órfão `commissionPercent` | Pergunta de migração | Migrar para regra de escopo produto ou descartar após decisão? Não remover antes de consolidar. | Aberta |
| **Q4** Definição de `MARGIN` | Pergunta | Base `MARGIN` = venda − custo do item? Só faz sentido em `AGENCY_COLLECTS`. | Aberta |
| **Q5** Local do módulo puro | Pergunta técnica | Ver seção de Lite. | Aberta |
| **Q6** Política de `ON_BALANCE_DEADLINE` com atraso | Pergunta (spec A6) | Saldo atrasado não vira `ENTITLED` sem quitação. Confirmar. | Aberta |

**Não decidido por este ADR:** valores de percentual, fornecedores, lotes e
calendário reais da Gadotti. Tudo isso é configuração do cliente, não produto.

## Riscos

- **Dupla contagem** de receita e de comissão, ou de receita e de venda bruta.
  Mitigação: separação de grandezas (item 1) e teste de relatório derivado.
- **Erro de base de cálculo** (ex.: sobre o total em vez de sobre as taxas).
  Mitigação: casos R1–R7 como oráculo e snapshot de memória de cálculo.
- **Agência paga o funcionário antes de receber** (risco de caixa). Mitigação:
  decisão D3 explícita e alerta de projeção.
- **Lote com diferença** que nunca fecha. Mitigação: diferença visível e aberta.
- **Cancelamento após recebimento** sem reversão. Mitigação: 409 (D6).
- **Concorrência** em fechar lote e receber. Mitigação: lock por lote e teste em
  `test:db`.
- **Dependência de D1 e F2**. Se decididas de forma diferente da proposta, o
  desenho muda.
- **Risco jurídico** sobre política de cancelamento e arrependimento (CDC art. 49
  × ANAC). Não é decidido aqui (spec A10 e §4.3).

## Verificação deste rascunho

- Nada foi executado: nenhum código, migration, teste, banco, deploy ou acesso
  online.
- Fatos de código vêm da spec §2, §5, §8–§11, com leitura pontual nas referências
  citadas na spec. Não reverificados nesta sessão, exceto o que está nomeado acima.
- Os valores R1–R7 são ilustrativos e não derivam de dados da Gadotti.

## Aprovação

- **Status atual:** Aceito (2026-10-23).
- **Aprovação humana:** pendente.
- **Data da aprovação:** pendente.
- **Aprovado por:** pendente.
