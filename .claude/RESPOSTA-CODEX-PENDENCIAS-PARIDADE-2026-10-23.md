# Resposta às quatro pendências da consolidação do Codex — paridade de comissões Full / Lite

Data: 2026-10-23. Autor: Claude. Entrada: `.claude/CONSOLIDACAO-CODEX-RESPOSTA-PARIDADE-2026-10-23.md`.
**Somente documentação.** Nenhum código, banco, migration, deploy ou commit nesta rodada. Frente financeira em **HOLD**.
SQL/pseudocódigo abaixo é ilustrativo, **não executado e não testado**. Não toquei em CEP, exportação de relatórios nem arquivos de outros agentes.
Esta resposta **corrige** o que eu disse antes onde houver conflito (itens marcados "RETRATAÇÃO").

## Quadro

| # | Pendência | Estado | O que falta |
| - | --- | --- | --- |
| 1 | F2: forma × perfil não são alternativas; sem política → bloqueado, não ON_SALE | **Resolvido (contrato)** — recurso segue **BLOQUEADO** | **Decisão humana:** configurar o perfil e confirmar o `requires_receipt` das formas (§1.5) |
| 2 | Quitação parcial, soma entre canais, reabertura, contradição "1 payable" × "novos payables" | **Resolvido (contrato)**; DDL **bloqueada** até ADR | Nenhuma decisão financeira nova (F3 já cobre); ADR + ajuste do código da Fase 0 antes da COM-03 (§2.6) |
| 3 | Ordem histórica não reconstruível | **Impossibilidade registrada**; baseline definido | **Decisão humana:** data de corte e aprovação do baseline (§3.5) |
| 4 | Concorrência do acumulado | **Resolvido (protocolo)**; **não testado** | Decisão humana mínima: limite de atribuição retroativa (§4.6) |

---

## 1. F2 reescrita — forma de pagamento e perfil são dois eixos complementares

**RETRATAÇÃO.** O "F2 = forma OU perfil" e o `resolveReleasePolicy` que "devolve `ON_SALE`" (RESPOSTA…, §8, e RELATÓRIO FASE0) estavam errados. Também retiro o `release_mode … DEFAULT 'ON_SALE'` dos DDLs anteriores. `ON_SALE` libera dinheiro; não pode ser o que acontece por falta de configuração.

### 1.1 Os dois eixos (instrução humana vigente, preservada)

| Eixo | Pergunta que responde | Onde vive | Quem muda |
| --- | --- | --- | --- |
| **Forma de pagamento** | **SE** a venda exige recebimento efetivado para valer/pagar comissão | atributo `requires_receipt` da forma (no Lite: `payment_methods.requires_receipt`, migration 011) | cadastro da forma |
| **Perfil financeiro da agência** (global, com vigência) | **COMO** a exigência afeta metas e liberação: `META_E_LIBERACAO` (a venda só entra na meta/liberação conforme o recebido) ou `SOMENTE_LIBERACAO` (a meta conta a venda confirmada; só a liberação segue o recebimento) | `tenant_financial_profiles` (spec do Lite §4: vigência, motivo, autor; append-only) | gestão, com reautenticação |

Os dois são **necessários juntos** quando `requires_receipt = true`. Quando `requires_receipt = false`, o perfil não altera aquela venda, mas o perfil ainda precisa existir para a agência (ele governa as vendas com exigência).

### 1.2 Nota de fato sobre o código do Lite (não confundir com a instrução)

O Lite **implementado** (migration 011, `finance.ts:390-417`, `sales.ts:326-332`) tem só o eixo "forma" e comporta-se como `SOMENTE_LIBERACAO` fixo: a meta conta a venda inteira; só a liberação segue o recebido. Não existe tabela de perfil no Lite. A spec §12.3 chama o perfil de "descartado", mas essa confirmação **não é verificável** (já registrada). Portanto: o Lite atual é um **caso particular** do contrato abaixo (perfil implícito `SOMENTE_LIBERACAO`), não uma prova de que o perfil foi revogado.

### 1.3 Política resolvida ou bloqueio — contrato

```ts
type ReleaseEffect = 'META_E_LIBERACAO' | 'SOMENTE_LIBERACAO';
type ReleasePolicy =
  | { status: 'RESOLVED'; requiresReceipt: false }                       // forma configurada como "não exige"
  | { status: 'RESOLVED'; requiresReceipt: true; effect: ReleaseEffect } // forma exige + perfil vigente
  | { status: 'BLOCKED'; missing: MissingConfig[] };                     // NUNCA vira ON_SALE

type MissingConfig =
  | 'PAYMENT_METHOD_NOT_SET'          // venda sem forma de pagamento
  | 'PAYMENT_METHOD_RECEIPT_RULE_UNSET' // forma sem requires_receipt configurado (tri-estado: NULL)
  | 'FINANCIAL_PROFILE_NOT_ACTIVE';   // sem perfil com vigência cobrindo a data-base

function resolveReleasePolicy(sale, agency, onDate): ReleasePolicy;
```

- `requires_receipt` precisa ser **tri-estado** no Full: `NULL` = não configurado, `false`/`true` = decisão explícita. (O `boolean DEFAULT false` do Lite não distingue "nunca decidiram" de "decidiram que não exige" — ver §1.5.)
- `BLOCKED` produz: geração/liberação de comissão **recusada com 409** e corpo `{ code: 'COMMISSION_RELEASE_POLICY_MISSING', missing: [...] }`, com texto para o usuário dizendo qual configuração falta ("Defina o perfil financeiro da agência", "Defina se a forma 'Cartão' exige recebimento"). Nada é gravado, nenhum valor é liberado, nada é pago por padrão.
- A política é **congelada** na comissão no momento do reconhecimento (`release_policy_snapshot`: `requiresReceipt`, `effect`, `profile_id`, `payment_method_id`, data); mudar a forma ou o perfil depois não altera comissões existentes.

### 1.4 O que isso significa para o que já existe

- **Fase 0 (já implementada) não decide política de liberação** e não grava `release_mode`. Entradas atuais do Full continuam pagáveis integralmente — isso é o comportamento **anterior à funcionalidade**, não uma política "ON_SALE" escolhida. Para evitar que seja confundido com política: quando COM-03 existir, entradas anteriores recebem marcador explícito e auditado `release_policy_snapshot = { status: 'LEGACY_PRE_FEATURE' }`, aplicável **só** a entradas geradas antes da ativação da funcionalidade para aquela agência. Entradas geradas depois da ativação exigem política `RESOLVED`.
- A **ativação da COM-03 por agência** é, ela mesma, um passo de configuração explícito (perfil + formas configuradas), não implícito.
- COM-03 continua **bloqueada** (não há código nem DDL a escrever).

### 1.5 Pendente de humano (única parte de F2 que o humano precisa fornecer)

1. O **perfil financeiro** de cada agência (`META_E_LIBERACAO` ou `SOMENTE_LIBERACAO`, vigência).
2. Confirmar, forma por forma, o `requires_receipt` (inclusive para migração de clientes Lite: um `false` herdado do default de migration 011 **não pode** ser tratado como decisão sem confirmação; para o Lite que roda hoje o `false` é o comportamento real em produção, e a confirmação é só registrar isso como decisão).

**Estado: Resolvido (contrato) + BLOQUEADO + decisão humana pendente (1 e 2).**

---

## 2. Quitação parcial, canais e a contradição dos payables

### 2.1 A contradição, nomeada

O contrato anterior dizia (a) "um payable vivo por entrada" (índice `payables_agency_commission_entry_live_key`, **já criado na Fase 0**) e (b) "novas settlements/payables para liberações futuras". Não podem valer juntas.

### 2.2 Resolução

Separar **obrigação**, **reserva** e **pagamento**:

| Conceito | Definição | Cardinalidade |
| --- | --- | --- |
| **Obrigação** (canal avulso) | o `payable` da comissão, com `amount = reconhecido` (valor integral, como já é em `createPayableFromCommissionEntry`) | **no máximo 1 vivo por entrada** (mantém o índice da Fase 0) |
| **Liberação futura** (COM-03) | não cria payable novo: aumenta o teto de **alocações** (pagamentos) do mesmo payable: `alocável = liberado − pago` (é exatamente o modelo do Lite: um payable por comissão, `008`, e `POST /payables/:id/pay` limitado a `liberado − já pago`) | n alocações |
| **Reserva** (canal folha) | uma *fatia* `commission_settlements(channel='PAYROLL', payroll_entry_id, amount)` | n fatias por entrada, uma por folha/competência |
| **Pagamento efetivo** | dinheiro realmente alocado a uma obrigação (payable avulso) ou folha quitada | derivado, nunca coluna editável |

Isso elimina a contradição: **o canal avulso mantém 1 payable**; **o canal folha usa fatias** (não são payables da comissão — o payable é o da folha, 1 por folha).

### 2.3 Canal fixo por entrada (F3 mantido)

O primeiro compromisso (payable avulso **ou** primeira fatia de folha) fixa `settlement_channel` da entrada (`'PAYABLE' | 'PAYROLL'`); depois disso o outro canal é recusado (409) enquanto existir compromisso ativo ou valor pago. Esta é a forma formal do "canal único" de F3.

### 2.4 Saldos (todos derivados sob lock, em reais)

```
R  = reconhecido(e) = entry.amount                         (status APPROVED|PAYABLE|PAID)
L  = liberado(e)    = política RESOLVED -> R ou R·min(recebido/total,1) ; LEGACY_PRE_FEATURE -> R ; BLOCKED -> 0
Rsv= reservado(e)   = canal PAYABLE: R (o payable existe)   | canal PAYROLL: Σ fatias ATIVAS
Pg = pago(e)        = canal PAYABLE: Σ alocações OUT do payable
                      canal PAYROLL: Σ amount das fatias cuja folha está com payable 100% PAID   (folha parcial NÃO quita comissão — F3)
Sn = saldo_nao_pago = R − Pg
disponível_para_reservar(e) = L − Rsv        (canal PAYROLL)       alocável(e) = L − Pg   (canal PAYABLE)
```

### 2.5 Status da entrada — regra de soma (substitui "o primeiro payable quitado marca PAID")

- `PAID` **se e somente se** `Pg ≥ R` (comparação em centavos, sem float).
- Canal avulso com `Pg < R`: permanece `PAYABLE`. Canal folha com `Pg < R`: permanece `APPROVED` (entrada reservada em fatias).
- **Reabertura:** se, após um evento de estorno de pagamento (PAR-EST — hoje inexistente no Full), `Pg < R`, a entrada volta a `PAYABLE`/`APPROVED`, `paid_at = NULL`; fatias cuja folha deixou de estar 100% paga contam 0 em `Pg`. Estorno de **recebimento** que faria `L < Pg` é **bloqueado** (409), nunca desfaz pagamento.
- **Observação sobre a Fase 0 já implementada:** `refreshPayableStatus` marca `PAID` quando *aquele* payable quita. Isso é **correto hoje** porque (i) o payable avulso tem `amount = R` e (ii) a folha reserva a entrada inteira (`payroll_entry_id` = reserva de R). Deixa de ser correto quando existirem fatias (COM-03): nesse ponto a regra deve passar a ser a soma acima e a coluna `payroll_entry_id` deve ser substituída pelo razão de fatias. Registrado como **pré-requisito de COM-03**, com teste de invariante (§2.7); nada a mudar agora.

### 2.6 DDL (ilustrativa, bloqueada até ADR)

```sql
-- NÃO EXECUTAR. Razão de fatias do canal folha; o canal avulso continua sendo 1 payable (índice da migration 100).
ALTER TABLE commission_entries
  ADD COLUMN settlement_channel TEXT CHECK (settlement_channel IN ('PAYABLE','PAYROLL')),
  ADD COLUMN release_policy_snapshot JSONB;           -- §1.3; NULL só antes da ativação

CREATE TABLE commission_payroll_slices (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL, commission_entry_id TEXT NOT NULL, payroll_entry_id TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','RELEASED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), released_at TIMESTAMPTZ,
  FOREIGN KEY (agency_id, commission_entry_id) REFERENCES commission_entries (agency_id, id),
  FOREIGN KEY (agency_id, payroll_entry_id)    REFERENCES payroll_entries (agency_id, id)
);
CREATE UNIQUE INDEX commission_payroll_slices_active_uidx
  ON commission_payroll_slices (agency_id, commission_entry_id, payroll_entry_id) WHERE state = 'ACTIVE';
-- A coluna commission_entries.payroll_entry_id da migration 100 passa a ser derivada/legada
-- (migração de dados: 1 fatia ACTIVE de valor R por entrada já reservada) -- decisão do ADR.
```

Por que fatia só para folha: no canal avulso a "fatia" é o próprio pagamento parcial do payable; criar fatias lá duplicaria o `payment_allocations`.

### 2.7 Testes necessários (**nenhum existe, nenhum executado**) — `commission-settlement.test.ts`

| ID | Caso | Esperado |
| --- | --- | --- |
| QP-01 | R=750, L=225 (COM-03), payable avulso, aloca 225 | `Pg=225 < R` ⇒ entrada continua `PAYABLE` |
| QP-02 | idem, depois L=750 e aloca 525 | `Pg=750` ⇒ `PAID` |
| QP-03 | canal folha, 2 fatias (225 e 525), só a 1ª folha 100% paga | `Pg=225` ⇒ entrada `APPROVED`, não `PAID` |
| QP-04 | 2ª folha paga | `PAID` |
| QP-05 | folha parcialmente paga | fatia conta 0 |
| QP-06 | primeiro compromisso avulso ⇒ reservar fatia de folha | 409 (canal fixo) |
| QP-07 | primeiro compromisso folha ⇒ criar payable avulso | 409 |
| QP-08 | estorno de pagamento (quando existir PAR-EST) leva `Pg<R` | volta a `PAYABLE`/`APPROVED`, `paid_at` nulo |
| QP-09 | estorno de recebimento que faria `L < Pg` | 409, nada revertido |
| QP-10 | duas alocações concorrentes que somadas excedem `L` | uma passa, outra 409 |
| QP-11 | invariante: `entry.status='PAID' ⇔ Pg ≥ R` em todos os caminhos | verdadeiro |
| QP-12 | índice: 2º payable vivo da mesma entrada | `23505` (já coberto pela Fase 0: `PRO-02`) |

**Estado: Resolvido (contrato), DDL bloqueada até ADR; sem decisão financeira nova (F3 cobre). Não testado.**

---

## 3. Ordem histórica — o que a origem (Lite) realmente permite reconstruir

### 3.1 Verificação nos arquivos da origem (somente leitura)

| Fonte | O que contém | Serve como ordem de confirmação? |
| --- | --- | --- |
| `sales` (`001_initial_schema.sql`) | `sale_date DATE`, `created_at`, `updated_at`; **não existe `confirmed_at`** (busca em `migrations-travel-lite` e `services/api-lite/src` sem resultado) | **Não.** `updated_at` é gravado na confirmação (`sales.ts:292`, `now()`), mas é **reescrito** pelas transições posteriores (`PARTIALLY_PAID/PAID/CANCELLED`, `refreshSaleStatus`, `:755`) — o instante da confirmação se perde. `sale_date` é data de negócio (editável só em `DRAFT`, `sales.ts:654`), não a ordem. |
| `seller_commissions.created_at` | gravado na transação da confirmação (`sales.ts:357-375`) | **Parcial.** É o horário de **início da transação** (`now()` do Postgres), não a ordem de commit/lock; confirmações simultâneas podem ter ordem de `created_at` diferente da ordem real de aquisição do lock. Existe uma linha por venda confirmada (inclusive `PENDING_RULE`, mantida se cancelada). |
| `rule_snapshot.accumulated_before` | gravado **só** em comissões de regra progressiva (`commission-engine.ts:209-214`) | **Sim, para essas comissões:** é a prova direta do acumulado usado. Não existe para regras não progressivas (não precisaram). |
| `audit_logs` `SALE_CONFIRMED` | `created_at` por evento (`sales.ts:384-389`) | **Não confiável:** `SALE_CONFIRMED` **não** está em `REQUIRED_AUDIT_EVENTS` (`audit-log.ts:65-77`), a gravação usa SAVEPOINT e falha em silêncio (`:132-139`); pode faltar. Também é tempo de transação. |
| `integration_outbox` `SALE_CONFIRMED` | `created_at`, status de envio (`001…:410-440`) | Mesma limitação (tempo de transação); retenção/limpeza não verificada. |
| Valores das vendas | imutáveis depois de confirmadas (edição só em `DRAFT`) | Os **valores** são reconstruíveis; a **ordem** não. |

### 3.2 Conclusão (sem suposição)

- **Não há ordenação autoritativa de confirmação reconstruível** a partir do esquema do Lite. Há ordens *aproximadas* (tempo de transação) e uma prova exata apenas onde existe `accumulated_before`.
- **Impossibilidade registrada:** não é possível provar, para um mês em andamento, qual venda foi contada antes de qual para regras não progressivas, nem reproduzir o acumulado histórico de forma verificável para além do que está em snapshots. **Não se afirma perda zero.**

### 3.3 O que NÃO precisa ser reconstruído (e por quê)

- A meta é **mensal** (mês civil): o acumulador zera todo mês. Meses **encerrados** não precisam de acumulado reconstruído: as comissões já calculadas (valor, snapshot, `accumulated_before`) são preservadas **verbatim** e nunca recalculadas.
- Só importa o **mês em andamento no corte**, por (vendedor, categoria, métrica).

### 3.4 Decisão de desenho: baseline de continuidade (não `seq` sintético)

- **Proibido:** gerar atribuições históricas com `seq`/`ordinal` inventado no Full e tratá-las como se refletissem a ordem do Lite.
- **Mecanismo:** `commission_accumulation_baselines (agency_id, employee_id, month, category_id?, metric, opening_amount, source='LITE_CUTOVER', computed_at, approved_by, approved_at, evidence_ref)`. O acumulador do Full passa a ser `opening_amount + Σ(atribuições nativas do Full do mês com ordem menor)`. As vendas históricas importadas do Lite ficam como atribuições `ordering_source='LITE_SNAPSHOT'`, `ordinal NULL`, **excluídas** da soma (o baseline as substitui).
- **Cálculo do `opening_amount`:** executar o **algoritmo do próprio Lite** no instante do corte (a soma de `monthlyAccumulatedBase` sobre os dados no corte) — que é exatamente o que o Lite usaria na próxima confirmação —, **congelar** o Lite (sem novas confirmações) antes de calcular, registrar evidência (consulta, totais, hash) e exigir **aprovação humana** do valor.
- **Corte recomendado:** na **virada do mês** (dia 1): o baseline do mês corrente é **0** e não há nada a reconstruir; é a única forma de continuidade sem aproximação.
- **Cross-check de qualidade:** para cada comissão progressiva do mês, `accumulated_before` do snapshot deve ser coerente com a soma das bases das vendas anteriores por `created_at` da comissão; divergências são **reportadas**, nunca corrigidas.

### 3.5 Estado

**Impossibilidade registrada + baseline definido. Decisão humana pendente:** (a) data de corte (recomendado: virada do mês); (b) aprovação do baseline se o corte cair no meio do mês. Enquanto não houver essas decisões, a migração de clientes com meta progressiva em andamento fica **bloqueada**.

---

## 4. Concorrência do acumulado — protocolo

### 4.1 Por que `IDENTITY` não basta

`GENERATED ALWAYS AS IDENTITY` entrega o número na hora do `INSERT`, antes do commit e antes de qualquer lock de negócio. Duas transações podem obter `seq 5` e `6` e confirmar em ordem inversa. Com a regra "soma as de `seq` menor", a de `seq 6` (que commitou primeiro) não vê a `5` (ainda não commitada) e a `5` não conta a `6` (maior): **ninguém conta ninguém** — a virada de faixa seria perdida. A ordem tem de ser a **ordem de aquisição do lock, mantido até o commit**.

### 4.2 Ordem de eventos (por atribuição/geração de comissão)

1. `BEGIN` (READ COMMITTED).
2. **Tomar o lock consultivo** `pg_advisory_xact_lock(hashtext('commission-accrual:{agency}:{employee}:{YYYY-MM}'))` — **antes** de qualquer leitura de acumulado e **antes do INSERT** da atribuição. O mês é o de `recognition_date`.
3. Revalidar sob o lock (a venda ainda `CONFIRMED/PAID`; não há atribuição duplicada).
4. Atribuir `ordinal = 1 + COALESCE(MAX(ordinal),0)` das atribuições do (agência, funcionário, mês) — **calculado sob o lock**, `UNIQUE (agency_id, employee_id, month, ordinal)` como rede de segurança. Como o lock só é solto no commit, `ordinal` cresce na ordem real de commit. (O `seq` identity pode existir para ordenação estável de exibição, **não** para regra.)
5. `INSERT` da atribuição.
6. Ler `accumulated_before = Σ` das atribuições `ACTIVE` do mesmo escopo/mês com `ordinal` menor (leitura posterior ao lock ⇒ enxerga tudo que já commitou).
7. Calcular e gravar a entrada (snapshot com `accumulated_before`, `ordinal`).
8. `COMMIT` solta o lock.

### 4.3 Cancelamento e travas cruzadas (sem deadlock)

- Cancelar a venda marca a atribuição `CANCELLED` com um `UPDATE` de linha (trava de linha), **sem** tomar o lock consultivo — não é um append, não cria perda de atualização: cálculos concorrentes enxergam o estado antes ou depois, e snapshots já gravados não mudam.
- Ordem total de travas: (1) lock consultivo de acúmulo → (2) `SELECT status FROM sales … FOR SHARE` (revalidação do passo 3) → (3) linhas de atribuição/entrada. O fluxo de cancelamento da venda toma (2) → (3) e **nunca** o (1) ⇒ sem ciclo.
- Janela residual: atribuição inserida por T1 enquanto T2 cancela a venda e commita antes do passo 3 de T1: o `FOR SHARE` do passo 3 bloqueia até T2 terminar e relê `CANCELLED` ⇒ T1 aborta com 409.

### 4.4 Datas retroativas e atribuições tardias

- A ordem é a ordem de **atribuição** (commit), **não** a data da venda. Uma venda de dia 3 atribuída no dia 20 entra **depois** das de dia 10 já atribuídas: ocupa o próximo `ordinal` do mês; vê o acumulado de todas as anteriores em ordem; **não altera** snapshots já gravados (sem recálculo implícito).
- `recognition_date` define o **mês** do acumulador. Atribuição tardia para um mês já passado cai no acumulador **daquele** mês (próximo `ordinal`), marcada `late=true` (`recognition_month < mês da atribuição`) e **auditada**. Isso pode fazer uma venda "tardia" cruzar uma faixa que, em ordem cronológica, caberia a outra — consequência aceita e documentada; reordenar exigiria ajustes retroativos (Fase 5, fora de escopo).
- Meses com folha já **aprovada** ou comissão já paga: política mínima sugerida — atribuição tardia permitida mas **auditada**; bloquear exige regra de fechamento de período que o Full não tem (§4.6).

### 4.5 Testes necessários (**nenhum existe, nenhum executado**) — `commission-accrual-concurrency.test.ts`

| ID | Caso | Esperado |
| --- | --- | --- |
| ACL-01 | 2 atribuições simultâneas que, somadas, cruzam a faixa | a que adquire o lock depois vê a outra; só uma recebe a taxa maior sobre a parte excedente; nenhuma perda de virada |
| ACL-02 | forçar inversão `identity` × commit (T1 pega seq menor mas só commita depois) | `ordinal` segue a ordem de lock/commit; resultado idêntico ao serial |
| ACL-03 | 20 atribuições concorrentes, mesmo funcionário/mês | `ordinal` 1..20 sem lacunas nem duplicatas; `accumulated_before` estritamente consistente com a soma serial |
| ACL-04 | atribuição de funcionários/meses diferentes | não serializam entre si |
| ACL-05 | cancelar venda enquanto é atribuída | sem deadlock; a atribuição não persiste `ACTIVE` para venda cancelada |
| ACL-06 | atribuição tardia (mês passado) | entra no acumulador do mês passado, `late=true`, auditada, snapshots anteriores intactos |
| ACL-07 | geração de comissão atrasada | `accumulated_before` por `ordinal`, não por ordem de geração |
| ACL-08 | duas atribuições da mesma venda/funcionário | uma falha por unicidade |
| ACL-09 | violação de `UNIQUE (…, ordinal)` por bug simulado | transação aborta; nada parcial |

### 4.6 Estado

**Resolvido (protocolo), NÃO TESTADO.** Decisão humana mínima: se atribuições tardias para meses com folha aprovada/pagamento devem ser **permitidas com auditoria** (padrão proposto) ou **bloqueadas** (exige conceito de fechamento de período que não existe).

---

## 5. O que continua dependendo de decisão humana

1. **Perfil financeiro** de cada agência e **confirmação do `requires_receipt`** de cada forma de pagamento (§1.5) — sem isso COM-03 permanece bloqueada.
2. **Data de corte** e **aprovação do baseline** de acumulado (§3.5) — sem isso, clientes com meta progressiva em andamento não migram.
3. **Atribuição tardia em mês já fechado por folha/pagamento**: permitir com auditoria ou bloquear (§4.6).
4. (Herdadas, inalteradas) F1 aceito para fases 3+; F3 aceito; F4 mantém o arredondamento atual do Full.

Dependem só de **ADR/Codex ou implementação** (não de humano de negócio): DDL do razão de fatias (§2.6), substituição de `payroll_entry_id` por fatias e regra de soma do `PAID` (§2.5), tabelas de baseline e `ordinal` (§3.4, §4.2).

## 6. Não verificado

- Nenhum teste novo foi escrito ou executado; todos os IDs `QP-*` e `ACL-*` são propostas.
- Não consultei banco algum (local ou remoto); os fatos sobre o Lite vêm de leitura de `001_initial_schema.sql`, `sales.ts`, `commission-engine.ts`, `finance.ts`, `audit-log.ts`.
- Retenção/limpeza de `audit_logs` e `integration_outbox` no Lite real **não foi verificada**.
- Não comparei o conteúdo real de `accumulated_before` com somas reais (sem dados e sem acesso).
- A compatibilidade entre o protocolo de lock e os fluxos reais de confirmação/cancelamento de venda do Full (sales.ts do Full) não foi exercitada.
- HOLD financeiro mantido: nenhuma implementação, migration ou DDL deve começar a partir deste documento sem ADR e aceite.
