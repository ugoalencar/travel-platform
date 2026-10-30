# Resposta à revisão do Codex — correção dos cinco P1 (paridade de comissões Full / Lite)

Data: 2026-10-23. Autor: Claude. Rodada **documental**. Entrada:
`.claude/NEXT-PROMPT-PARIDADE-CORRECOES-2026-10-23.md`, `.claude/REVISAO-CODEX-PARIDADE-FULL-LITE-2026-10-23.md`,
`RELATORIO-PARIDADE-FULL-LITE-2026-10-23.md` e `RELATORIO-PARIDADE-FULL-LITE-REVISAO-2026-10-23.md`
(nenhum sobrescrito). Este arquivo **consolida e fecha** os P1; onde houver divergência com os anteriores,
**vale este**. `AGENTS.md`, `docs/AI_CONTEXT.md` e `QUALITY-GATES.md` foram relidos na rodada anterior desta
sessão (sem mudança de conteúdo conhecida desde então; não reabertos agora).

> **HOLD de implementação.** Nada foi executado: sem teste, DDL, banco (local/remoto), `.env`, dados reais,
> migração, deploy, commit/push. SQL e TypeScript são **ilustrativos e não aprovados**; números de migration
> e `calc_version` são propostas. Gadotti permanece no Lite; bancos separados.

---

## 0. Classificação: problema técnico solucionável × escolha financeira

| P1 | Natureza | Estado |
| --- | --- | --- |
| 1 Acumulador | **Técnico** (contrato canônico) + 1 pré-requisito de produto (atribuição de venda) | resolvido em §1 |
| 2 Revisões no mesmo dia | **Técnico** | resolvido em §2 |
| 3 Categorias e `PENDING_RULE` | **Técnico** (destinos existem); adotá-los é decisão de produto F1 | resolvido em §3 |
| 4 Índice enum→text | **Técnico** | resolvido em §4 (DDL revisada, não executada) |
| 5 Folha × avulso | **Técnico** (razão, travas, revalidação); política de legado/parcial é **financeira** (F3) | resolvido em §5 |

Escolhas **financeiras/comerciais** que só o humano pode confirmar (4, §8): F1 atribuição de venda/categorias,
F2 fonte de “exige recebimento” (perfil global × forma de pagamento), F3 canal único + legado + folha parcial,
F4 arredondamento. Todo o resto é decisão técnica registrada e sujeita à revisão do Codex.

---

## 1. P1 — Acumulador canônico (não somar `commission_entries`)

**Aceito.** Evidência do Lite: `monthlyAccumulatedBase` soma **vendas** do vendedor
(`services/api-lite/src/commission-engine.ts:245-262`): `sales` com status `CONFIRMED/PARTIALLY_PAID/PAID`,
`date_trunc('month', sale_date)` igual ao da venda, `id <> $3`, categoria da regra quando houver, coluna
`margin_amount` ou `gross_amount` conforme `version.calculation_base`; chamado sob
`pg_advisory_xact_lock(hashtext(tenant:seller:YYYY-MM))` (`:277-282`). Nenhuma dependência de existir comissão.

**Por que o Full não tem o insumo hoje (fato, não suposição):** `sales` do Full tem `user_id` (criador),
`broker_id`, `total`, `status` (`infrastructure/migrations/001_initial_schema.sql:267-281`) — **sem
vendedor/funcionário nem categoria**; a atribuição só existe no momento da geração
(`employee-commissions.ts:252-355`, parâmetro `employeeId`). `employees.user_id` existe
(`employee-commissions.ts:370-373`), mas é o usuário do funcionário, não o vendedor da venda.

**Contrato canônico (unidade = venda atribuída).**

```sql
-- ILUSTRATIVO, NÃO EXECUTADO
CREATE TABLE sale_commission_attributions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  category_id TEXT,                          -- commission_categories (§3)
  recognition_date DATE NOT NULL,            -- fuso da agência; gravada, nunca recalculada
  gross_amount NUMERIC(14,2) NOT NULL,       -- snapshot de sales.total na atribuição
  margin_amount NUMERIC(14,2),               -- snapshot de getSaleMargin; NULL = indisponível
  seq BIGINT GENERATED ALWAYS AS IDENTITY,   -- ordem de atribuição (≙ ordem de confirmação)
  state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','CANCELLED')),
  source TEXT NOT NULL DEFAULT 'FULL' CHECK (source IN ('FULL','LITE_PAIRING')),
  UNIQUE (agency_id, sale_id, employee_id),
  FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id),
  FOREIGN KEY (agency_id, employee_id) REFERENCES employees (agency_id, id)
);
```

| Dimensão | Regra |
| --- | --- |
| Evento elegível | atribuição `ACTIVE` cuja venda tem `SaleStatus ∈ {CONFIRMED, PAID}` (`packages/domain/types.ts:517-523`). Independe de entrada de comissão. `PENDING/CANCELLED/REFUNDED` não contam. |
| Vendedor | `employee_id` da atribuição. |
| Período | mês civil de `recognition_date`. |
| Categoria | regra com categoria soma só atribuições dessa categoria; regra sem categoria soma todas (igual ao Lite `:258`). |
| Métrica | a da **versão em uso**: `GROSS`→`gross_amount`, `MARGIN`→`margin_amount`. Trocar de GROSS para MARGIN muda o acumulado inteiro para a nova métrica (igual ao Lite `:251`); **nunca mistura** métricas. `margin_amount IS NULL` com regra `MARGIN` → erro explícito (falha fechada), nunca 0. |
| Ordem | `accumulated_before = Σ` das atribuições elegíveis do mês/escopo com `seq` **menor**. Geração atrasada da comissão não muda a ordem. |
| Deduplicação | `UNIQUE (agency_id, sale_id, employee_id)`; venda com vários produtos conta **uma vez**. |
| Unidade da progressão | só regras de unidade-venda (`calculation_basis = PACKAGE_TOTAL`, entrada `product_type='PACKAGE'`). Bases por item/passageiro/bilhete (`PRODUCT_TOTAL`, `PER_*`, `FIXED_PER_*`) ficam **fora** da progressão e do excedente nesta versão — comportamento atual preservado (`employee-commissions.ts:102-240, 312-323`). |
| Entradas legadas | não alimentam o acumulador (não têm atribuição). |
| Concorrência | `pg_advisory_xact_lock(hashtext('commission-accrual:{agency}:{employee}:{YYYY-MM}'))` antes de ler (espelha `:277-282`). |
| Sem recálculo | cancelar uma venda atribuída (`state→CANCELLED`) tira-a dos acumulados **futuros**; entradas já calculadas não mudam. |

**Pré-requisito de produto (F1):** alguém precisa criar a atribuição (ação na venda ou na geração de
comissão). Sem isso o Full não tem “vendas do vendedor” — não é detalhe técnico.

**Testes** (`services/api/tests/commission-accrual.test.ts`, novo, **não executado**; todos DB):

| ID | Caso | Esperado |
| --- | --- | --- |
| ACC-01 | venda atribuída e `CONFIRMED` **sem** entrada de comissão | conta no acumulado das seguintes |
| ACC-02 | venda com AIR + LAND (2 produtos) do mesmo funcionário | conta **uma** vez |
| ACC-03 | A (seq 1), B (seq 2); comissão de A gerada depois de B | `accumulated_before` de A = 0; de B = base de A |
| ACC-04 | regra GROSS→MARGIN no mês | acumulado recalculado só em `margin_amount`; sem soma mista |
| ACC-05 | regra com categoria X | ignora atribuições de Y |
| ACC-06 | virada de mês | acumulado do novo mês começa em 0 |
| ACC-07 | venda cancelada depois | sai de acumulados futuros; entradas anteriores intactas |
| ACC-08 | 2 atribuições simultâneas, mesmo funcionário/mês | acumulados distintos e coerentes (lock) |
| ACC-09 | `margin_amount IS NULL` com regra MARGIN | erro de validação, nada gravado |
| ACC-10 | entradas legadas (sem atribuição) no mês | ignoradas |

Numérico (mesmo oráculo do Lite): faixas 0–50k@3%, 50k–100k@4%, 100k+@5%; acum. 45.000 + base 20.000 =
**750,00**; acum. 45.000 + base 70.000 = **2.900,00** → `packages/domain/tests/commission-calculation.test.ts`
`CALC-07`/`CALC-08` (PURO).

---

## 2. P1 — Revisões no mesmo dia sem perda

**Aceito.** Evidência: o Lite permite `effective_from` **igual** ao da revisão mais recente (a validação só
rejeita data anterior: `routes/commission-rules.ts:188-201`, `if (latestDate && effectiveFrom < latestDate)`),
e desempata por `version_number` (`commission-engine.ts:92-93`: `ORDER BY cv.effective_from DESC, cv.version_number DESC`).
Fechar na véspera da próxima criaria `valid_until < valid_from`, violando
`employee_commission_rules_validity_check` (migration 080) — e é **o mesmo defeito latente do Full atual**
(`employee-commission-rules.ts:189-196`, `valid_until = COALESCE(novo valid_from, hoje) − 1 dia`) (**R11, por
leitura, não testado**).

**Solução:** versões **imutáveis** com identidade e `version_number` preservados; vigência **derivada** por projeção.
Nenhum `valid_until` é calculado nem armazenado para versões novas.

```sql
-- ILUSTRATIVO, NÃO EXECUTADO. Versão = linha append-only (sem UPDATE/DELETE para o runtime).
CREATE TABLE employee_commission_rule_versions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  version_number INT NOT NULL CHECK (version_number >= 1),
  effective_from DATE NOT NULL,
  revised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revised_by TEXT, reason TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('PERCENTAGE','FIXED','NONE')),
  calculation_basis employee_commission_basis,
  calculation_metric TEXT CHECK (calculation_metric IN ('GROSS','MARGIN')),
  value NUMERIC(14,4) CHECK (value IS NULL OR value >= 0),
  apply_on TEXT NOT NULL DEFAULT 'TOTAL' CHECK (apply_on IN ('TOTAL','EXCESS')),
  excess_threshold NUMERIC(14,2),
  progressive BOOLEAN NOT NULL DEFAULT false,
  tier_mode TEXT NOT NULL DEFAULT 'MARGINAL' CHECK (tier_mode IN ('MARGINAL')),
  legacy_ref TEXT,                                    -- id da versão de origem (pareamento)
  FOREIGN KEY (agency_id, scope_id) REFERENCES employee_commission_rule_scopes (agency_id, id),
  UNIQUE (agency_id, scope_id, version_number), UNIQUE (agency_id, id)
);

-- Projeção de vigência (função/view; NÃO coluna). Por escopo:
--   efetiva(v)  ⇔ v é a de maior version_number entre as versões com o MESMO effective_from
--   effective_until(v) = (menor effective_from > v.effective_from entre as efetivas) − 1 dia, ou NULL
--   versão não efetiva (supersedida no mesmo dia): is_effective=false, superseded_by_version_id = vencedora,
--   effective_until = NULL (sem intervalo; não participa de seleção, permanece consultável)
```

Seleção em `D` (idêntica ao Lite): maior `effective_from ≤ D`; empate → maior `version_number`.
Entradas gravam `rule_version_id` (id imutável) — **nunca reapontado**; snapshot JSON guarda
`scope_id`, `version_number`, `effective_from`. Comissões que apontam à v1 e à v2 do mesmo dia continuam
apontando cada qual para sua versão; a v1 supersedida segue visível como “supersedida em 01/11 por v2”.

Retroatividade: `effective_from ≥` hoje da agência, como o Lite (`assertNotRetroactive`,
`commission-rules.ts:183-200`); fora de escopo reabrir entradas.

**Testes** (`services/api/tests/commission-rule-versions.test.ts`, novo, DB, **não executado**):
HIER-03 (v1 e v2 em 2026-11-01; entrada em 31/10 → vigente anterior; em 01/11 → v2; entrada antiga permanece
na v1) · HIER-04 (projeção: v1 `is_effective=false`, `superseded_by=v2`, sem intervalo invertido) · HIER-05
(idempotência: reexecutar a mesma revisão não cria versão) · HIER-06 (fronteira A até 09/10, B desde 10/10)
· **PAR-REV-01** (pareamento: 3 versões Lite — 2 no mesmo dia — viram 3 linhas, mesmos `version_number`/datas,
seleção devolve a mesma versão que o Lite para cada data testada).

---

## 3. P1 — Categorias distintas e `PENDING_RULE` sem perda

**Aceito.** Evidência: Lite — categoria é dimensão de regra e de venda (`commission-engine.ts:85-99`,
`routes/sales.ts:334-341`); `PENDING_RULE` é registro real (`sales.ts:343-355`) e o override só ocorre em
`PENDING/PENDING_RULE` (spec §12.4). Full — `product_type` é enum fixo de 7 valores
(`packages/domain/types.ts:772-780`); `commission_entries.status` é `TEXT` + CHECK
(`043_commissions_payroll.sql:73-74`, **não enum**, então ampliar é `DROP/ADD CONSTRAINT` em migration nova).

**Categorias — representação sem perda:**

```sql
-- ILUSTRATIVO, NÃO EXECUTADO
CREATE TABLE commission_categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  legacy_ref TEXT,                       -- id da categoria Lite; 1 categoria Lite = 1 categoria Full
  UNIQUE (agency_id, id)
);
CREATE UNIQUE INDEX commission_categories_legacy_ref_uidx
  ON commission_categories (agency_id, legacy_ref) WHERE legacy_ref IS NOT NULL;
```

Regra: **uma categoria Lite ⇒ uma categoria Full** (nunca mapear duas para o mesmo destino nem para um
`product_type`). Escopos de regra usam `category_id` (não `product_type`) — `CHECK (product_type IS NULL OR
category_id IS NULL)`. Duas categorias com regras distintas, portanto, nunca colidem.

**Pendências:**

```sql
-- ILUSTRATIVO, NÃO EXECUTADO
ALTER TABLE commission_entries DROP CONSTRAINT commission_entries_status_check;
ALTER TABLE commission_entries ADD CONSTRAINT commission_entries_status_check
  CHECK (status IN ('PENDING','APPROVED','PAYABLE','PAID','CANCELLED','PENDING_RULE'));
-- amount NOT NULL e >= 0 permanecem: pendência grava amount = 0.
-- Linhagem (080:184-189) ganha 3ª alternativa:
--   (status='PENDING_RULE' AND commission_rule_id IS NULL AND rule_version_id IS NULL AND commission_plan_id IS NULL)
-- Dedupe: os índices atuais usam status <> 'CANCELLED' → uma pendência bloqueia nova geração (comportamento desejado, igual ao Lite).
```

Isolamento: `payroll.ts:278` filtra `status IN ('APPROVED','PAYABLE','PAID')`; DRE (`financial.ts:1655-1661`) usa
“pelo menos aprovadas”; a liquidação (§5) exige `status ∈ {APPROVED,PAYABLE,PAID}` → `PENDING_RULE` com
`amount=0` **não vaza** para folha, DRE nem pagamento. Resolução: override manual com permissão + auditoria
(`PENDING_RULE → PENDING`, grava valor e snapshot `overridden`), exatamente o fluxo Lite. A rota manual atual
continua devolvendo erro sem regra (compat., `employee-commissions.ts:304-308`); pendência é criada por geração
automática e pelo pareamento.

**Se o produto não adotar categorias e pendência no Full (F1):** cada cliente Lite que as use fica
**IMPEDIDO** (“sem destino para categorias/pendências”). Proibido converter omissão em sucesso.

**Testes** (DB, **não executados**): `commission-pending.test.ts` — PEND-01 (excluída da folha e do DRE),
PEND-02 (override exige permissão e audita; vira `PENDING`), PEND-03 (bloqueia nova geração);
`commission-categories.test.ts` — CAT-01 (duas categorias, duas regras distintas, cada venda usa a sua),
CAT-02 (migração com categoria sem destino → status IMPEDIDO), **PAR-CAT-01** (N categorias Lite → N Full, `legacy_ref` único).

---

## 4. P1 — Unicidade sem cast enum→text (DDL revisada, não executada)

**Aceito.** `080_employee_commission_rules.sql:203-209` documenta que `COALESCE(product_type::text, …)`
(cast enum→text) não é aceito como expressão de índice; a 080 resolve com **índices parciais separados**
sobre a coluna crua (`:216-218`). Minha proposta anterior (`COALESCE(product_type::text,'')`) repetia o erro.

**Estratégia:** unicidade em tabela de **escopos**, por **seis índices parciais** que usam apenas colunas puras
e predicados `IS [NOT] NULL` + igualdade com literal de `status` (texto). Nenhum `COALESCE`, nenhum cast,
nenhuma função. Sem `NULLS NOT DISTINCT` (versão do servidor em produção **não verificada**; CI usa PG15).

```sql
-- ILUSTRATIVO, NÃO EXECUTADO, NÃO APROVADO. Provar em PostgreSQL descartável autorizado.
CREATE TABLE employee_commission_rule_scopes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  employee_id TEXT,                                   -- NULL = padrão da agência
  product_type employee_commission_product_type,      -- NULL = sem restrição de produto
  category_id TEXT,                                   -- NULL = sem restrição de categoria
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  legacy_ref TEXT,
  UNIQUE (agency_id, id),
  CONSTRAINT scopes_one_dimension_check CHECK (product_type IS NULL OR category_id IS NULL),
  FOREIGN KEY (agency_id, employee_id)  REFERENCES employees (agency_id, id),
  FOREIGN KEY (agency_id, category_id)  REFERENCES commission_categories (agency_id, id)
);
CREATE UNIQUE INDEX scopes_emp_product_uidx  ON employee_commission_rule_scopes (agency_id, employee_id, product_type)
  WHERE status = 'ACTIVE' AND employee_id IS NOT NULL AND product_type IS NOT NULL AND category_id IS NULL;
CREATE UNIQUE INDEX scopes_emp_category_uidx ON employee_commission_rule_scopes (agency_id, employee_id, category_id)
  WHERE status = 'ACTIVE' AND employee_id IS NOT NULL AND category_id IS NOT NULL AND product_type IS NULL;
CREATE UNIQUE INDEX scopes_emp_all_uidx      ON employee_commission_rule_scopes (agency_id, employee_id)
  WHERE status = 'ACTIVE' AND employee_id IS NOT NULL AND product_type IS NULL AND category_id IS NULL;
CREATE UNIQUE INDEX scopes_ag_product_uidx   ON employee_commission_rule_scopes (agency_id, product_type)
  WHERE status = 'ACTIVE' AND employee_id IS NULL AND product_type IS NOT NULL AND category_id IS NULL;
CREATE UNIQUE INDEX scopes_ag_category_uidx  ON employee_commission_rule_scopes (agency_id, category_id)
  WHERE status = 'ACTIVE' AND employee_id IS NULL AND category_id IS NOT NULL AND product_type IS NULL;
CREATE UNIQUE INDEX scopes_ag_all_uidx       ON employee_commission_rule_scopes (agency_id)
  WHERE status = 'ACTIVE' AND employee_id IS NULL AND product_type IS NULL AND category_id IS NULL;
```

Outros índices propostos, também sem cast (colunas `TEXT`/`NUMERIC`/`BOOLEAN`):

```sql
-- um payable vivo por entrada (Fase 0). Precedido de DO $$ que ABORTA se houver duplicata viva (padrão 099).
CREATE UNIQUE INDEX payables_agency_commission_entry_live_uidx
  ON payables (agency_id, commission_entry_id)
  WHERE commission_entry_id IS NOT NULL AND status <> 'CANCELLED';
```
> Atenção: `payables.status` é o enum `"FinancialObligationStatus"` (`financial.ts:2842`); comparar com o literal
> `'CANCELLED'` no predicado envolve a coluna enum. A 099 usa o mesmo padrão
> (`WHERE payroll_entry_id IS NOT NULL AND status <> 'CANCELLED'`, `099_payroll_payable_unique.sql`), então o
> predicado enum-vs-literal **já é aceito no repositório**; o que a 080 proíbe é **cast da coluna a text como
> expressão**. Ainda assim a prova em banco descartável é obrigatória (DDL-07).

Não coberto por índice (e por isso validado na aplicação sob lock): sobreposição de janelas — o modelo de
versões elimina o problema (não há janelas armazenadas), restando só a unicidade de `version_number` por escopo.

**Testes de DDL** (`services/api/tests/commission-ddl.test.ts`, novo, **precisa banco descartável autorizado; não executado**):
DDL-01..06 (cada um dos seis escopos rejeita duplicata ACTIVE, aceita ARCHIVED duplicado e aceita escopos
diferentes) · DDL-07 (índice de payable único; migração aborta com duplicata prévia e **não apaga** nada) ·
DDL-08 (`migrations:validate`/runner `097_schema_migrations` aceita a sequência) · DDL-09 (nenhuma expressão
com `::text` em índice — verificação por catálogo `pg_indexes`).

---

## 5. P1 — Pagamento único entre folha e avulso (liquidação por canal)

**Aceito.** Evidência dos caminhos atuais:
- Avulso: `createPayableFromCommissionEntry` lê a entrada **sem lock** e cria o payable
  (`commissions.ts:312-366`); não há índice único em `payables.commission_entry_id` (só FK, `043:85`).
- Folha: `generatePayrollEntry` soma `commission_entries` `APPROVED/PAYABLE/PAID` do mês por `created_at` e
  embute no líquido (`payroll.ts:274-301`); só atualiza enquanto `OPEN` (`:303-309`);
  `payPayrollEntry` cria payable com `net_amount` fixo (`payroll.ts:419-446`); 099 garante 1 payable por folha,
  **não** exclusividade comissão×folha.
- UI: `PayrollPage.tsx:344-348` (comissão `APPROVED` → “Gerar Conta a Pagar”) e `:430-434` (folha `APPROVED` →
  “Gerar conta a pagar”) coexistem para a mesma comissão.
- `refreshPayableStatus` atualiza a folha mas não a entrada (`financial.ts:2861-2897`).

**Contrato: saldo liquidável + razão de liquidações por canal + revalidação.**

```
reconhecido(e)  = e.amount                 (status ∈ APPROVED|PAYABLE|PAID; PENDING_RULE/PENDING/CANCELLED = 0)
liberado(e)     = ON_SALE ou legado → reconhecido ; ON_RECEIPT → fórmula COM-03 (bloqueada por F2)
comprometido(e) = Σ settlements ACTIVE de e        (qualquer canal)
disponível(e)   = max(liberado(e) − comprometido(e), 0)
```

```sql
-- ILUSTRATIVO, NÃO EXECUTADO. Razão append-only (estado só ACTIVE→RELEASED).
CREATE TABLE commission_settlements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  commission_entry_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('PAYABLE','PAYROLL')),
  payable_id TEXT, payroll_entry_id TEXT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','RELEASED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), released_at TIMESTAMPTZ,
  CHECK ((channel = 'PAYABLE') = (payable_id IS NOT NULL)),
  CHECK ((channel = 'PAYROLL') = (payroll_entry_id IS NOT NULL)),
  FOREIGN KEY (agency_id, commission_entry_id) REFERENCES commission_entries (agency_id, id)
);
CREATE UNIQUE INDEX settlements_payable_uidx ON commission_settlements (agency_id, commission_entry_id, payable_id)
  WHERE state = 'ACTIVE' AND payable_id IS NOT NULL;
CREATE UNIQUE INDEX settlements_payroll_uidx ON commission_settlements (agency_id, commission_entry_id, payroll_entry_id)
  WHERE state = 'ACTIVE' AND payroll_entry_id IS NOT NULL;
```

**Exclusividade** é garantida por `disponível`: a soma de reservas ativas de uma entrada nunca excede
`liberado`. Uma entrada de R$ 500 reservada integralmente por uma folha tem `disponível = 0` → o payable
avulso devolve 409, e vice-versa. Para pagamento parcial, o canal reserva só o valor pretendido
(`F3`: por padrão, **valor integral por canal**).

**Travas** (ordem única; chave = `pg_advisory_xact_lock(hashtext('commission-settle:{agency}:{entry}'))`,
sempre **antes** de `FOR UPDATE`, ordenando as entradas por id para evitar deadlock):

| Operação | Algoritmo |
| --- | --- |
| Criar payable de comissão | lock(entry) → `loadCommissionLiquidable` → exige `status=APPROVED`, `disponível ≥ amount do payable` (por padrão = `disponível`) → INSERT payable → INSERT settlement `PAYABLE` → `status=PAYABLE`. 409 se `disponível=0`. |
| Gerar folha (`OPEN`) | para cada entrada elegível (competência, status): lock; **libera** as settlements `PAYROLL` anteriores dessa folha; reserva `disponível`; `commissionsTotal = Σ reservado`. Regenerar não duplica. |
| Aprovar folha | `assertSettlementsStillValid`: toda settlement ACTIVE da folha ainda tem entrada não cancelada e `liberado ≥ comprometido`; senão 409 listando entradas. |
| `payPayrollEntry` | idem, e `payable.amount` não excede salário + Σ reservado + demais componentes. |
| **`allocatePayment`** (OUT) em payable de comissão ou de folha | sob lock das entradas ligadas: revalida; entrada cancelada ou `liberado < comprometido` → `ConflictError`, **nada gravado**. Isto fecha “valor desatualizado na quitação” (`financial.ts:2093-2159`). |
| Quitar | `refreshPayableStatus`: payable `PAID` ⇒ entradas das settlements `PAID` (+`paid_at`); folha continua como hoje. **Folha parcialmente paga não marca comissão `PAID`** (conservador). |
| Cancelar entrada/venda | se há settlement ACTIVE em payable/folha não quitado ou quitado → **409** (F3/F5); folha `OPEN` pode ser regenerada e libera a reserva. |

**Legado:** não é tocado. `PRO-04` entrega relatório **somente leitura** das entradas que hoje estão ao mesmo
tempo com payable próprio e somadas em folha — inventário para decisão humana (F3). Não declaro exclusividade
global resolvida: vale apenas para operações novas após a proteção. Nenhum caminho “inseguro para ON_SALE” é mantido:
o razão vale também para `ON_SALE` (liberado = reconhecido).

**Parcelas liberadas depois (COM-03):** cada aumento de `liberado(e)` cria **nova** settlement (novo payable ou
reserva na folha da competência em que a liberação ocorre). As anteriores não mudam.

**UI** (`PayrollPage.tsx`): ocultar “Gerar Conta a Pagar” quando `disponível = 0`/entrada reservada pela folha;
colunas Liberado/Comprometido/Pago/Saldo e canal; mensagem traduzida do 409 (`errorTranslation.ts`).

**Testes** (`services/api/tests/commission-settlement.test.ts`, DB, **não executado**; caracterização
`commission-characterization.test.ts` primeiro, vermelho antes da correção):

| ID | Caso | Esperado |
| --- | --- | --- |
| CH-02 | 2 `create-payable` simultâneos (hoje) | 2 payables (risco documentado) → após PRO-01/02: 1 |
| CH-03 | quitar payable da comissão (hoje) | entrada permanece `PAYABLE` → após PRO-03: `PAID` |
| CH-04 | payable avulso **e** folha no mesmo mês (hoje) | duas obrigações → após SET-01: segunda 409 |
| CH-09 | folha aprovada; comissão cancelada depois (hoje) | `net_amount`/payable intactos → após SET-03: alocação 409 |
| SET-01 | canal único: reserva da folha ⇒ avulso 409; avulso ⇒ folha não reserva | `disponível=0` |
| SET-02 | regenerar folha `OPEN` | libera e reserva de novo, sem duplicar |
| SET-03 | cancelar entrada entre gerar e pagar folha | alocação 409, nada gravado |
| SET-04 | pagamento parcial da folha | comissão não vira `PAID` |
| SET-05 | relatório de legado | lista conflitos, não altera dados |
| SET-06 | 2 pagamentos simultâneos sobre a mesma folha/comissão | um passa, outro 409; sem deadlock |
| SET-07 | competência futura (COM-03) | nova settlement, anterior intacta |
| UI-01/02 | `PayrollPage.test.tsx` (novo) | botão duplicado oculto; colunas exibidas |

Numérico: entrada de R$ 500,00 → avulso 500,00 ⇒ folha reserva 0,00 (`SET-01`); entrada ON_SALE 750,00
reservada na folha com salário 3.000 e desconto 100 ⇒ líquido 3.650,00 (`SET-02`/folha, regressão de
`payroll.ts:297-301`, que não muda).

---

## 6. Riscos atuais do Full — caracterizar e proteger (Fase 0, antes de recursos novos)

| Risco | Evidência | Caracterização | Proteção |
| --- | --- | --- | --- |
| R1 payable duplicável | `commissions.ts:312-366`; sem índice | CH-02 | PRO-01 (`FOR UPDATE`) + PRO-02 (índice §4) |
| R2 sem `PAID` | `financial.ts:2861-2897`; só 3 `UPDATE commission_entries` | CH-03 | PRO-03 |
| R3 arredondamento | `employee-commissions.ts:316`; 18,50×3% = 0,55 (Full) × 0,56 (Lite) — reproduzido em Node | CH-01 | **nenhuma** até F4 |
| R4 data em UTC | `employee-commission-rules.ts:267` | CH-06 | `recognition_date` gravada no fuso da agência (novas entradas) |
| R5 outra transação | `employee-commissions.ts:303` | — | `resolveCommissionRule` no mesmo `client`; HIER-07 |
| R6 dedupe por produto | `employee-commissions.ts:285-297` | CH-07 | manter (preserva Full); só estender se humano pedir |
| R7 cancelar venda | `employee-commissions.ts:497-509` | CH-05 | política F3/F5: bloquear (409) |
| R8 canal duplo | `payroll.ts:274`, `commissions.ts:347` | CH-04 | §5 |
| R11 janela invertida | `employee-commission-rules.ts:189-196` | CH-08 | versões imutáveis (§2); no legado, 409 em vez de erro de CHECK |
| R13 folha snapshot | `payroll.ts:257-330` | CH-09 | §5 (revalidação) |
| Estorno ausente | busca em `services/api/src` sem rotina | — | item próprio PAR-EST (não é “guarda de fluxo futuro”) |

---

## 7. Pareamento Lite → Full sem perda (conceitual; nenhum dado copiado)

Algoritmo de pareamento por cliente (executor é outro projeto; este é o contrato):

1. **Pré-checagem de destinos** — falha ⇒ cliente `IMPEDIDO` com motivo, nunca “parcial concluído”:
   categorias (catálogo Full existe?), `PENDING_RULE` (status existe?), atribuição de venda, vendedores sem
   funcionário pareado, política de liberação (F2).
2. **Escopos:** 1 `commission_rules` ⇒ 1 `employee_commission_rule_scopes` (`legacy_ref` = id de origem;
   `status` preservado, inclusive `ARCHIVED`).
3. **Versões:** 1 `commission_rule_versions` ⇒ 1 `employee_commission_rule_versions` com **mesmo `version_number`,
   `effective_from`, `revised_at`, `revised_by` (pareado), `reason`**, `mode` (inclusive `NONE`), valor, métrica,
   `apply_on`, limiar, `progressive`, faixas verbatim. **Revisões do mesmo dia permanecem como duas linhas.**
4. **Categorias:** N categorias Lite ⇒ N `commission_categories` (`legacy_ref` único); regras e atribuições
   referenciam a categoria pareada. Duas categorias com regras distintas nunca se fundem.
5. **Vendas elegíveis:** cada venda Lite confirmada do vendedor ⇒ 1 `sale_commission_attributions`
   (`source='LITE_PAIRING'`), `seq` na **ordem de confirmação de origem**, `gross/margin` **do dado de origem**.
6. **Comissões:** cada `seller_commissions` ⇒ 1 `commission_entries` (`product_type='PACKAGE'`, base `PACKAGE_TOTAL`)
   com `commission_amount`, `rule_snapshot` e `calc_version` de origem **verbatim**, `rule_version_id` da versão
   pareada (a de origem, mesmo no mesmo dia), `release_mode`. **Nunca recalcular.** `PENDING_RULE` ⇒ entrada
   `PENDING_RULE` (`amount=0`).
7. **Financeiro:** `payables.commission_id` ⇒ `commission_entry_id` + settlement `PAYABLE` com o valor já
   comprometido; pagos preservados; folha não existe no Lite ⇒ nenhuma settlement `PAYROLL`.
8. **Acumulado:** a reconciliação recomputa `accumulated_before` por entrada pelo contrato §1 e **compara** com
   o do snapshot de origem; divergência ⇒ relatório, **sem** reescrever histórico.

| Item Lite | Destino Full | Perda | Teste |
| --- | --- | --- | --- |
| 2 versões no mesmo dia | 2 linhas, ids/ordem preservados | **nenhuma** | PAR-REV-01 |
| categorias distintas | catálogo 1:1 | **nenhuma** | PAR-CAT-01 |
| `PENDING_RULE` | status equivalente | **nenhuma** | PAR-PEND-01 |
| acumulado | atribuições + `seq` | **nenhuma** | PAR-ACC-01 (mesmos acumulados) |
| payable de comissão | `commission_entry_id` + settlement | **nenhuma** | PAR-PAY-01 |
| qualquer destino ausente | — | **cliente IMPEDIDO** | PAR-BLOCK-01 |

Evidências do runbook: totais por vendedor/mês/status; versões por data (inclusive duplicadas); pendências;
liberado×pago×comprometido; amostra de snapshots idênticos. Contagem de linhas **nunca** basta.

---

## 8. Escolhas financeiras/comerciais a confirmar (4)

| # | Escolha | Por que o humano | Padrão proposto (não decidido) |
| - | --- | --- | --- |
| F1 | Full passa a ter **atribuição de venda a funcionário** e **catálogo de categorias** para comissão? | define como a meta é medida e se clientes Lite com categorias/pendências migram | sim; sem isso, esses clientes ficam IMPEDIDOS |
| F2 | “Exige recebimento” vem da **forma de pagamento** ou do **perfil financeiro global** (instrução humana do perfil segue vigente; relato de outro agente não a revoga) | altera quando se paga | COM-03 bloqueada; `resolveReleasePolicy` devolve `ON_SALE` até confirmação |
| F3 | **Canal único** por comissão; legado em conflito (relatório → ação); folha parcial; cancelamento de venda com comissão em conta/folha/paga | dinheiro prometido/pago | canal único; legado só reportado; folha parcial não quita comissão; cancelar ⇒ 409 |
| F4 | **Arredondamento** do Full (hoje 0,55) × Lite (0,56) para cálculos **novos** | centavos pagos a pessoas | manter o atual até decidir; nunca reprocessar histórico |

Tratados como **trilha de evolução** (não impostos): progressão “total” e excedente sobre acumulado do mês —
`tier_mode`/`excess_basis` reservados, só valores de paridade aceitos. Estorno no Full (PAR-EST) é item de
paridade próprio a priorizar; não é pergunta financeira nova.

---

## 9. Plano e arquivos

Fase 0a caracterização (`commission-characterization.test.ts`, `PayrollPage.test.tsx`) → 0b proteções
(`commissions.ts`, `payroll.ts`, `financial.ts`, `commission-settlement.ts` novo, `PayrollPage.tsx`,
migrations) → 1 módulo puro `packages/domain/commission-calculation.ts` + `CALC-01..12` → 2 escopos/versões
(`employee-commission-rules.ts`, `employee-commissions.ts`, `routes/commissions.ts`, `types.ts`, `api.ts`,
`EmployeeDetailPage.tsx`) → 3 categorias/atribuições/acumulador/COM-02 trilha P → 4 pendências → 5 COM-03
(após F2) → 6 Lite consome o módulo (exige ajustar `include` do `tsconfig` de `api-lite`; **não verificado
que compila**). ADR obrigatória antes da Fase 2. Gates de cada fase: `lint`, `typecheck`, `test`, `test:db`,
`build` (+ `secrets:scan`, `migrations:validate` antes de PR), Full antes do Lite, revisão Codex.

## 10. O que NÃO foi verificado nem executado

- **Nada foi executado**: nenhum teste (os propostos não existem), nenhum gate, nenhuma DDL, nenhuma
  consulta a banco (local ou remoto), nenhum `.env`, acesso online, migração, deploy, commit/push.
- Não verificado: schema realmente aplicado; versão do PostgreSQL em produção; se a DDL de §4 e §5 é aceita
  (inclusive predicados com o enum `FinancialObligationStatus`); R11 (por leitura); existência de estorno fora
  dos arquivos lidos; chamada de `generate-by-product` por páginas; testes de folha em `financial*.test.ts`;
  compilação do Lite consumindo `packages/domain`; permissões rota a rota de `routes/commissions.ts`;
  `docs/AI_CONTEXT.md`/`QUALITY-GATES.md`/`AGENTS.md` não foram reabertos nesta rodada (lidos antes na sessão).
- Gadotti permanece no Lite; bancos separados; migração não autorizada. IMP-01 não iniciada.
- **HOLD de implementação:** este documento é contrato proposto, não aprovação nem código.
