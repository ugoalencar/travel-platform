# ADR-006: Parcelamento real de recebíveis no Full

## Status

**Aceito pelo usuário em 2026-10-23**, como rascunhado, com os padrões D1–D7 da
especificação dos ajustes Gadotti. Antes de implementar: a Fase 0 de comissões
precisa estar integrada e validada, e nenhuma migration é aplicada em banco real
sem autorização específica (ver "Dependências e decisões humanas").

## Metadados

- **Origem:** `.claude/ESPECIFICACAO-AJUSTES-GADOTTI-2026-10-23.md`, §6 (Frente 4),
  §7 (Frente 5) e §13 (Onda 0, item a).
- **Decisões de referência:** decisões D1–D7 da especificação Gadotti (§14). Para
  evitar confusão com os arquivos `docs/decisions/D2…D5-*.md`, que usam outra
  numeração, este ADR as cita como "Gadotti D2", "Gadotti D5" etc.
- **Relacionados:** ADR-005 (SQL é a fonte de verdade do schema), ADR-007
  (receita da agência, que consome o estado de quitação deste ADR), DEC-007
  (Full primeiro, Lite como subconjunto).
- **Revisão Codex:** não ocorreu (Codex sem créditos). Este rascunho exige revisão
  antes de virar aceito.

## Contexto

### Full hoje

- A tabela `receivables` tem `CONSTRAINT receivables_agency_sale_key UNIQUE
  (agency_id, sale_id)` (`infrastructure/migrations/010_financial_foundation.sql:51`).
  Logo, o Full aceita **um único recebível por venda**, com vencimento `now()`.
- Não existe parcela, entrada nem saldo com prazo. O Full também não tem a
  noção de baixa parcial por recebível além do status `PARTIALLY_PAID` já existente
  em `financial.ts` (alocação parcial por pagamento).
- A decisão `docs/decisions/D5-FINANCIAL-INSTALLMENTS-DEMO-DECISION.md`
  (2026-09-03, "Accepted for local demo planning") reconhece exatamente essa
  restrição de unicidade e aceita um contorno para a demonstração. Ela **não** é
  o modelo de produto e precisa ser atualizada na Onda 0 (fora deste ADR).

### Lite hoje

- A venda Lite cria **N recebíveis iguais**, mensais a partir de `due_date`:
  `base = floor(total / n, 2)` e a última parcela absorve o resíduo
  (`services/api-lite/src/routes/sales.ts`, conforme spec §6).
- A baixa é **parcial** e aceita valor menor que o saldo, recusa excesso e
  serializa por venda com lock (`routes/cash-flow.ts:220-285`, spec §7).
- Não há entrada, não há parcela mínima, não há vínculo com a data de embarque.
- A forma de pagamento não influencia o cronograma; só influencia a liberação de
  comissão do funcionário (`requires_receipt`).

### Requisito da Gadotti (valores são exemplos do registro, não padrão do produto)

- Cartão em até 10x sem juros, com parcela mínima (ex.: R$ 100).
- Boleto/Pix parcelado com **entrada obrigatória** (ex.: 30%) e **saldo** com
  prazo até X dias antes do embarque. O saldo pode ser pago **do jeito que o
  cliente quiser** até o prazo: não há parcela rígida para ele.

### Problema

Um recebível por venda não representa parcelamento. Parcelas fixas iguais não
representam saldo com baixas livres. O modelo precisa cobrir os dois casos com
o mesmo mecanismo de quitação, sem depender de parcelas rígidas para todo caso.

### Regra de produto aplicável

DEC-007 manda que o Full seja a referência funcional e que o Lite só ofereça o
que o Full também oferece. Hoje o Lite tem o cronograma de N parcelas, e o Full
não tem equivalente declarado. Isso é uma divergência legada. Este ADR cria o
equivalente **no Full primeiro** (DEC-007 §4) e só depois o Lite passa a usá-lo.

## Decisão proposta

### 1. Recebível continua sendo a unidade de cobrança, com uma linha por parcela

- Nova migration (nunca editar a `010`; ADR-005 e política de migrations
  aplicadas imutáveis) que:
  - remove `receivables_agency_sale_key UNIQUE (agency_id, sale_id)`;
  - adiciona `kind` (`SINGLE` | `DOWN_PAYMENT` | `INSTALLMENT` | `BALANCE`),
    `installment_number` e `installment_count`;
  - cria `UNIQUE (agency_id, sale_id, installment_number)`.
- `due_date` passa a ser **data civil** (`DATE`) no fuso da agência, conforme o
  contrato de §2.3 da spec. A conversão do tipo atual (`TIMESTAMPTZ`) é a
  pergunta Q4.
- Estados da linha: `OPEN` | `PARTIALLY_PAID` | `PAID` | `CANCELLED`. Os estados
  já existentes do Full são reaproveitados; nenhum novo valor de enum de venda é
  criado.

### 2. A condição de pagamento gera o cronograma no servidor

Entidade `payment_conditions` (configuração, aplicável por categoria, produto e
forma de pagamento), com os campos da spec §6:

| Campo | Papel |
| --- | --- |
| `schedule_kind` | `SINGLE` · `EQUAL_INSTALLMENTS` · `DOWN_PAYMENT_PLUS_BALANCE` |
| `max_installments` | inteiro ≥ 1 |
| `min_installment_amount` | dinheiro ≥ 0; nulo = sem mínimo |
| `down_payment_mode` / `down_payment_value` | `NONE` · `PERCENT` · `AMOUNT` |
| `balance_deadline_anchor` / `balance_deadline_offset_days` | `SALE_DATE` · `TRAVEL_START`; offset negativo = antes do embarque |
| `allows_partial_payments` | baixas livres no saldo |
| `interest_free` | v1 aceita apenas `true` (ver item 6) |

- O cliente envia só: condição escolhida, número de parcelas e forma de
  pagamento. Nunca envia valor de parcela, data de vencimento ou taxa.
- Regras do servidor (autoridade; a UI apenas reflete):
  - `N_máx = min(max_installments, floor(total / min_installment_amount))`
    quando houver mínimo; `N > N_máx` → 422;
  - entrada obrigatória ausente ou abaixo do mínimo → 422;
  - âncora `TRAVEL_START` sem data de embarque → **422** (não adivinha data);
  - condição não aplicável à forma de pagamento ou à categoria → 422.
- Algoritmo do cronograma (mesmo oráculo para Full e Lite):
  - `EQUAL_INSTALLMENTS`: parcelas `floor(total/n, 2)`, resíduo na última (caso
    P3: 333,33 + 333,33 + 333,34);
  - `DOWN_PAYMENT_PLUS_BALANCE`: entrada = `round_half_up(total × pct / 100, 2)`;
    saldo = `total − entrada`, para que a soma sempre feche (caso P5: 1.050,05 ×
    30% = 315,015 → **315,02**; saldo **735,03**);
  - `SINGLE`: um recebível pelo valor total. Parcelamento do cartão pelo viajante
    é apenas informativo (`traveler_installments`).
- Snapshot: `sales.payment_condition_snapshot` guarda a condição completa, valores,
  rótulos, versão e o cronograma gerado. Alterar a condição depois não muda vendas
  existentes.

### 3. Quitação e saldo são derivados de baixas, não de parcelas

- Saldo da venda = `total − Σ(baixas alocadas)`. `received`, `remaining` e
  `settled_at` (gravado quando `remaining` chega a zero) são calculados no
  servidor, nunca enviados pelo cliente.
- **Alocação da baixa:** por ordem de vencimento nos recebíveis abertos (padrão
  proposto), ou no recebível indicado, se houver. Esta é a pergunta Q1.
- Baixa acima do saldo → 422. Reenvio com a mesma `idempotency_key` devolve a
  mesma resposta e não cria segunda baixa. A venda é travada com advisory lock,
  o mesmo padrão já usado no estorno do Lite.
- Vencimento sem pagamento é **sinal**, não quitação: um recebível vencido fica
  marcado (`late`) e não altera o saldo.
- Com `DOWN_PAYMENT_PLUS_BALANCE`, o saldo é um único recebível `BALANCE` que
  aceita baixas livres até o prazo. A quitação não depende de parcelas.

### 4. Prazos e mudança de embarque

- `balance_deadline = âncora + offset`.
- Mudança de data de embarque (Gadotti D5) **não recalcula automaticamente**. A
  operação "revisar condição da venda" exige permissão própria, motivo obrigatório
  e auditoria. Ela gera nova versão de snapshot e reprograma **somente**
  recebíveis abertos. Recebíveis pagos ou parcialmente pagos não mudam.
- Estorno de baixa que reabre o saldo limpa `settled_at` e reverte os efeitos
  dependentes na receita (ADR-007, item de cancelamento e estorno).

### 5. Entrada

- Entrada obrigatória **não bloqueia** a confirmação da venda (Gadotti D2
  padrão proposto). A venda recebe sinalização derivada `down_payment_pending`,
  visível em relatório. Essa sinalização **bloqueia o direito de receita**
  (ADR-007), mas não cria status novo de venda.

### 6. Juros

- v1 aceita somente condições sem juros. Condição com juros é recusada. O cálculo
  de juros não entra nesta versão (spec A5). O art. 52 do CDC exige informar a
  taxa; a exigência precisa ser reconfirmada no texto oficial antes de qualquer
  condição com juros (spec §15).

### 7. Tipos

- Dinheiro: `NUMERIC(14,2)`. Taxas: `NUMERIC(7,4)` em pontos percentuais.
  Datas de vencimento e de âncora: `DATE` civil.

### 8. Estado de venda

- `SaleStatus` (`packages/domain/types.ts:517-523`) mantém `PENDING`, `CONFIRMED`,
  `PAID`, `CANCELLED`, `REFUNDED`. Um equivalente a `PARTIALLY_PAID` é **derivado
  na leitura** do saldo, não um novo valor do enum.

## Alternativas consideradas

1. **Manter um recebível por venda e guardar parcelas em JSON.** Rejeitada:
   vencimento, baixa e relatório por parcela ficam opacos. Viola a regra de que o
   SQL é a fonte de verdade (ADR-005) e impede filtros de vencimento em SQL.
2. **Tabela separada de cronograma (`payment_schedule_items`) e `receivables`
   como agregado.** Conceitualmente limpa, mas duplica a noção de cobrança e exige
   reescrever `receive`, DRE, cash-flow e overdue do Full. Custo alto sem ganho
   observado hoje. Fica como alternativa caso o cronograma precise de
   granularidade que a linha de recebível não comporte.
3. **Parcelas rígidas para todo caso.** Rejeitada: o saldo com baixas livres até o
   prazo não cabe em parcelas fixas, e obrigaria o cliente a um cronograma que a
   Gadotti não pediu.
4. **Saldo único, sem parcelas.** Rejeitada: não atende parcelamento com
   vencimentos nem parcela mínima.
5. **Manter `revenues` como cronograma (estado da demo D5).** Rejeitada como
   modelo definitivo: mistura receita com cobrança do cliente. A transição não
   apaga nada, conforme a spec §6.

## Consequências

**Positivas**

- Um único motor de cronograma compartilhado por Full e Lite, testado com o mesmo
  oráculo (casos P1–P9 da spec).
- Cobre cartão (`SINGLE`), parcelado com vencimentos (`EQUAL_INSTALLMENTS`) e
  entrada com saldo livre (`DOWN_PAYMENT_PLUS_BALANCE`).
- Quitação derivada de baixas evita inconsistência entre status de parcela e saldo.

**Negativas**

- Migration em tabela central de recebíveis do Full, com impacto em `financial.ts`,
  DRE, overdue e cash-flow.
- Migração de dados existentes: cada venda com um recebível passa a ter
  `kind = SINGLE`, `installment_number = 1`, `installment_count = 1`. Precisa de
  teste de migração em banco descartável com autorização explícita.
- Mudança de tipo de `due_date` (Q4).
- Conflito de arquivos com a Fase 0 (`services/api/src/financial.ts`).

**Testes previstos** (propostos, ainda não existem)

- `payment-conditions.test.ts`: casos P1–P9 como tabela; âncora sem embarque falha
  fechada; condição não aplicável; N inválido; entrada obrigatória.
- `payment-schedule.test.ts`: oráculo compartilhado Full × Lite.
- `sale-balance.test.ts` e `sale-payments-concurrency.test.ts` (este último em
  `test:db`).
- Teste de migração da unicidade em banco descartável, com autorização.

## Impacto no Lite e DEC-007 (Full primeiro)

- O cronograma de N parcelas do Lite é capacidade sem equivalente declarado no
  Full. DEC-007 §4 exige que o equivalente exista no Full antes de qualquer
  evolução no Lite. A ordem é: ADR aprovado → migration e serviço no Full → UI no
  Full → matriz de paridade → Lite usa o mesmo algoritmo e o mesmo oráculo.
- O Lite pode **omitir** `DOWN_PAYMENT_PLUS_BALANCE` se o produto decidir assim
  (DEC-007 §3). Não pode oferecer entrada obrigatória antes que o Full a tenha.
- Não há fusão de bancos nem de serviços (DEC-007 §5). Lite continua em
  `services/api-lite`, com o próprio schema, cujas migrations seguem o ADR-005 do
  produto Lite.
- Nenhuma capacidade deste ADR é liberada no Lite sem a versão Full validada.

## Dependências e decisões humanas pendentes

| Item | Tipo | Efeito neste ADR | Estado |
| --- | --- | --- | --- |
| **D1** (quem recebe do cliente) | Decisão humana, **bloqueante** | Cronograma de recebível do cliente só existe quando a agência recebe (`AGENCY_COLLECTS`). Sob `SUPPLIER_COLLECTS` não há recebível do cliente na agência. | Padrão proposto: `AGENCY_COLLECTS`. Não aprovado. |
| **D2** (entrada) | Decisão humana | Entrada não bloqueia confirmação; sinaliza `down_payment_pending`. | Padrão proposto. Não aprovado. |
| **D5** (embarque alterado / saldo em atraso) | Decisão humana | Revisão manual com motivo e auditoria; sem recálculo automático. | Padrão proposto. Não aprovado. |
| **D7** (lotes/janelas) | Decisão humana | **Ajuste de cobertura:** D7 trata de lotes de repasse da agência (ADR-007), não de cronograma do cliente. Aqui ele só afirma que o modelo não assume calendário fixo. Pergunta de confirmação: D7 deve ficar fora deste ADR? | Padrão proposto. Não aprovado. |
| **F2** (fonte de "exige recebimento") | Decisão humana **pendente** | **Não bloqueia** o cronograma. Condições são aplicadas a formas de pagamento, mas a fonte de `requires_receipt` não muda o que este ADR define. A regra de liberação da comissão fica no ADR-007. | Continua pendente. Não resolvido aqui. |
| **Q1** Alocação da baixa | Pergunta | Ordem de vencimento (padrão) ou recebível indicado obrigatório? | Aberta |
| **Q2** Entrada com vencimento na data da venda | Pergunta | A spec propõe vencimento na venda. Confirmar. | Aberta |
| **Q3** Juros em parcelamento | Pergunta + parecer | Confirmar que a v1 bloqueia juros. Reconfirmar o art. 52 do CDC no texto oficial. | Aberta |
| **Q4** Tipo de `due_date` no Full | Pergunta técnica | Converter `TIMESTAMPTZ` → `DATE` no Full muda relatórios e o fuso. | Aberta |
| **Q5** Baixa contra parcela específica | Pergunta | Permitir baixa dirigida a uma parcela, além da alocação automática? | Aberta |
| **Q6** Atualização de `docs/decisions/D5-*` | Ação da Onda 0 | Atualizar a decisão de demo, que hoje contorna a unicidade. | Fora deste ADR |
| **Número da migration** | Pergunta de consolidação | A ser definido na consolidação. As numerações 099 e 100 já estão ocupadas por trabalho da Fase 0 na árvore principal (não commitado). | Aberta |

**Fora do escopo deste ADR** (não decide): receita da agência (ADR-007), campos
configuráveis de venda (ADR-008), comissão do funcionário, regras de cancelamento
e arrependimento (parecer jurídico, spec A10).

## Riscos

- **Dupla contagem** entre `revenues` (demo D5) e recebíveis durante a transição.
- **Corrida** em baixas simultâneas. Mitigação: lock por venda e teste de
  concorrência em `test:db`.
- **Estorno** que reabre saldo depois que a receita já foi liberada. Mitigação:
  ADR-007 (D6, bloqueio com 409).
- **Relatórios que assumem um recebível por venda.** Não verificado nesta sessão;
  precisa de busca antes da migration.
- **Migração**: vendas existentes precisam de conversão sem perda. Sem teste em
  banco descartável autorizado, o risco é alto.
- **Fuso e datas**: a conversão de `TIMESTAMPTZ` para `DATE` pode deslocar
  vencimentos (risco R4 do relatório de paridade).
- **Juros e legislação**: condição com juros sem parecer é risco regulatório.
  Mitigação: v1 sem juros.

## Verificação deste rascunho

- Nada foi executado: nenhum código, migration, teste, banco, deploy ou acesso
  online.
- Fatos de código citados aqui vêm da spec (§6–§7) e foram conferidos por leitura
  pontual em `010_financial_foundation.sql:51` e em `packages/domain/types.ts:517-523`.
  Demais referências a arquivos seguem a spec e não foram reverificadas.
- Não foi consultado nenhum dado real da Gadotti. Valores numéricos são exemplos
  do registro ou ilustrativos.

## Aprovação

- **Status atual:** Aceito (2026-10-23).
- **Aprovação humana:** pendente.
- **Data da aprovação:** pendente.
- **Aprovado por:** pendente.
