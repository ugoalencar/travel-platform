# Relatório de paridade Full / Lite — Comissões (COM-01, COM-02, COM-03)

Data: 2026-10-23. Autor: Claude (rodada **somente documental**).
Branch inspecionada: `wip/organizacao-2026-10-20` (checkout sujo com ~110 entradas de
`git status`; nada foi alterado, revertido ou formatado por esta rodada).
Entrada: `.claude/NEXT-PROMPT-PARIDADE-FULL-LITE-2026-10-23.md`.
Saída única desta rodada: este arquivo.

> **Estado: HOLD de implementação.** Este relatório é um contrato proposto para
> revisão do Codex. Ele **não** significa que COM-01/02/03 estejam implementadas,
> aprovadas ou validadas. Gadotti permanece no Lite; bancos seguem separados;
> nenhuma migração de cliente está autorizada. Nenhum dado da Gadotti foi usado.

---

## 1. Resumo executivo

1. O Full **não tem um motor de comissão equivalente** ao do Lite, mas tem dois
   domínios próprios que devem ser **evoluídos, não substituídos**:
   `commission_plans` (plano global por funcionário; `TIERED_TARGET`/`PRODUCT`/
   `DESTINATION` são só esquema) e `employee_commission_rules` (funcionário ×
   tipo de produto, com bases por passageiro/bilhete, vigência e snapshot em
   `commission_entries`). A folha (`payroll.ts`) e o DRE leem `commission_entries`.
2. Proposta mínima: **estender `employee_commission_rules`** (não criar um segundo
   motor) com (a) hierarquia de escopo e revisões rastreáveis (COM-01),
   (b) excedente + faixas marginais mensais (COM-02), e **estender
   `commission_entries`** com snapshot JSON, data de reconhecimento e modo de
   liberação (COM-02/03). O cálculo puro deve virar **um módulo compartilhado**
   (`packages/domain`), validado primeiro no Full; o Lite só passa a consumi-lo depois.
3. **Três bloqueios de produto** impedem copiar o Lite “como está” (§12): o Full não
   tem *forma de pagamento* na venda (base da regra de liberação), não tem *estorno
   de recebimento/pagamento* nos arquivos lidos, e a folha do Full **já embute o
   valor integral da comissão no líquido** — sem tratamento, uma comissão
   `ON_RECEIPT` seria paga pela folha **ignorando a liberação**.
4. Foram encontrados **riscos no Full atual** (independentes desta evolução):
   `createPayableFromCommissionEntry` sem trava nem índice único (payable duplicável
   sob concorrência), entrada de comissão que **não vai para `PAID`** quando o payable
   é quitado (não encontrado código que faça isso), arredondamento divergente do Lite
   (`18,50 × 3%` → Full `0,55`; Lite `0,56`), data de reconhecimento por
   `toISOString().slice(0,10)` (UTC), dedupe por `product_type` que impede dois itens
   aéreos da mesma venda para o mesmo funcionário (§11).
5. 22 decisões humanas pendentes (§12), das quais 7 são bloqueantes (⛔) e D14 (perfil financeiro global) exige confirmação explícita. **Não** foi
   inventado o descarte do perfil financeiro global nem a equivalência entre
   progressão marginal e “total”.

---

## 2. Método e limites

Lido (somente leitura): `AGENTS.md`, `docs/00-product/FULL-LITE-ALIGNMENT-PLAN.md`,
`docs/travel-lite/FULL-LITE-PARITY-AUDIT-2026-10-23.md`,
`docs/travel-lite/COMMISSION-ENGINE-SPEC.md` (inclusive §12),
`.claude/COORDENACAO-LITE-FINANCEIRO-2026-10-22.md` (decisões do usuário),
`services/api-lite/src/{commission-engine,finance,money}.ts`,
`routes/{sales,cash-flow,commission-rules}.ts` (trechos de comissão),
`services/api/src/{commission-plans,commissions,employee-commission-rules,employee-commissions,payroll}.ts`,
`financial.ts` (pagamento/alocação/status/DRE), `routes/commissions.ts` (mapa de rotas),
`packages/domain/types.ts` (enums de comissão), migrations Lite 008–011 e Full
042/043/044/080/099, testes `services/api/tests/employee-commission-rules.test.ts`
e nomes de testes Lite de comissão, telas `CommissionPlansPage.tsx` e
`EmployeeDetailPage.tsx` (por busca de termos).

**Não lido / não verificado:** `docs/AI_CONTEXT.md` e `QUALITY-GATES.md` não foram
relidos integralmente nesta sessão (regras do `AGENTS.md` aplicadas); `PayrollPage.tsx`
e testes de UI não foram abertos; schema real/aplicado dos bancos não foi consultado;
`services/api/src/routes/commissions.ts` foi lido só como mapa de rotas e permissões
**não** foram auditadas rota a rota; a página de folha e o estado do índice de dedupe
após a migration 080 (a 080 afirma alargá-lo; o teste `:443` o cobre) não foram
conferidos linha a linha. **Nenhum teste foi executado**, nenhuma fixture que recria
banco, nenhum `.env`, nenhum acesso online, nenhum prisma/migration.

---

## 3. Comportamento atual VERIFICADO

### 3.1 Lite (código lido)

| Tema | Comportamento | Onde |
| --- | --- | --- |
| Escopos | `commission_rules` por vendedor/categoria; `seller_id`/`category_id` nulos = padrão da agência/todas. Um escopo ATIVO por combinação (`ux_commission_rules_active_scope`). | migration 009; `commission-engine.ts:79` |
| Precedência | vendedor+categoria > vendedor > padrão+categoria > padrão. Dentro do escopo vale a versão de maior `effective_from ≤ sale_date` (empate: maior `version_number`). | `commission-engine.ts:85-100` |
| Revisão | `appendRuleVersion` insere versão nova (append-only; só SELECT/INSERT na tabela de versões) com `reason`, `revised_by`, `revised_at`; trava a regra `FOR UPDATE`. Sem retroatividade (Fase 5 não existe). | `commission-engine.ts:306`; migration 009 |
| Modos | `PERCENTAGE` (bruto/margem), `FIXED`, `NONE` (= “sem regra explícita” → `PENDING_RULE`, nunca R$ 0). | `calculateCommission:159` |
| Excedente | `apply_on='EXCESS'`: `max(base − limiar, 0) × taxa`, **por venda** (não sobre o acumulado). | `:220-228` |
| Progressiva | só `PERCENTAGE`+`TOTAL`. Acumulado do vendedor no **mês civil** (vendas `CONFIRMED/PARTIALLY_PAID/PAID`, excluindo a própria; restrito à categoria da regra se houver) é **fatiado marginalmente**; cada fatia arredondada; total = soma das fatias. Trava `pg_advisory_xact_lock` por tenant+vendedor+mês. | `:135-152`, `:245-285` |
| Snapshot | `rule_snapshot` JSON (`calc_version`, ids/versão/vigência, taxa, fatias, `accumulated_before`, `overridden`...). Regra futura não recalcula. | `calculateCommission`; `sales.ts:343-382` |
| Arredondamento | `roundMoney`: meio-centavo para longe de zero, com `toPrecision(15)` contra ruído de ponto flutuante. | `money.ts` |
| Liberação | `payment_methods.requires_receipt` → `seller_commissions.release_mode` (`ON_RECEIPT`/`ON_SALE`) **congelado** na confirmação. `liberado = roundMoney(comissão × min(recebido/total,1))`, recebíveis não cancelados. | `sales.ts:326-332`; `finance.ts:390-417` |
| Pagamento | `POST /payables/:id/pay` limita a `liberado − já pago`; 409 se nada liberado; 400 se exceder; `PAID` só na quitação total. | `cash-flow.ts:421-535` |
| Estorno | Estorno de **recebimento** é bloqueado (409) se deixaria a comissão `ON_RECEIPT` paga acima do liberado; estorno de **pagamento** reabre a comissão (`PAID → APPROVED`). Pagamento só estornável uma vez. | `finance.ts:200-217, 228-307` |
| Cancelar venda | Bloqueia se há recebimento, comissão paga ou payable parcialmente pago; senão cancela comissão e payable em aberto. | `sales.ts:730-774` |
| Concorrência | Lock consultivo `commission-release:{tenant}:{sale}` tomado **antes** de travas de linha, nos dois caminhos (pagar comissão / estornar recebimento). | `finance.ts:370-376` |
| Idempotência | uma comissão ativa por venda+vendedor; um payable por comissão (migration 008). | spec §1/§12 |

### 3.2 Full (código lido)

| Tema | Comportamento | Onde |
| --- | --- | --- |
| Plano global | `commission_plans`: `PERCENT_SALE`, `PERCENT_MARGIN` (margem via `getSaleMargin`), `FIXED`; `PRODUCT/DESTINATION/TIERED_TARGET` rejeitados no cálculo (“não suportado”); UI marca `supported:false`. Funcionário tem 1 plano padrão. | `commissions.ts:210-245`; `CommissionPlansPage.tsx:25-31` |
| Regra funcionário×produto | `employee_commission_rules`: `PERCENTAGE`/`FIXED`; bases `PRODUCT_TOTAL`, `PACKAGE_TOTAL`, `PER_PASSENGER`, `PER_TICKET`, `FIXED_PER_PASSENGER/TICKET/SALE`; `valid_from/valid_until`; `ACTIVE/INACTIVE`. Índice único de regra **aberta** ativa por funcionário+produto; criar nova regra aberta **fecha** a anterior (`valid_until = véspera`). Histórico preservado. | migration 080; `employee-commission-rules.ts:166-220` |
| Seleção | por funcionário+produto na data de reconhecimento (`sales.created_at` → `toISOString().slice(0,10)`): ativa, janela contém a data, mais recente por `valid_from DESC NULLS LAST, created_at DESC`. Sem regra → `ValidationError` (falha fechada, **não** grava registro pendente). | `employee-commission-rules.ts:252-272`; `employee-commissions.ts:299-308` |
| Base real | lida no servidor de `air_services`, `land_services`, `excursion_customers`/`excursions`, `insurance_policies`, `sales.total`; HOTEL/TRANSFER exigem `manualBaseAmount`. | `employee-commissions.ts:102-240` |
| Cálculo | `Math.round(base×taxa/100×100)/100`; fixo por unidade só para `FIXED_PER_PASSENGER/TICKET`. **Sem faixas, sem excedente, sem acumulado.** | `:312-323` |
| Snapshot | colunas em `commission_entries`: `commission_rule_id`, `product_type`, `source_item_id/type`, `quantity`, `calculation_base`, `rate`, `amount`. **Sem JSON de memória de cálculo, sem versão do algoritmo, sem data de reconhecimento.** | migration 080; `:329-351` |
| Idempotência | no máximo 1 entrada não cancelada por (venda, funcionário, **product_type**). | `:285-297`; teste `:411,:443` |
| Ciclo | `PENDING → APPROVED → PAYABLE → PAID`, `CANCELLED`. `approve` sem `FOR UPDATE`. `create-payable` cria **um payable** `EMPLOYEE` sem `sale_id` (evita dupla contagem na margem) e marca `PAYABLE`. | `commissions.ts:267-371` |
| Quitação | pagamento = `payments` + `payment_allocations`; `refreshPayableStatus` atualiza o payable e, se houver `payroll_entry_id`, a folha. **Não foi encontrado** código que leve `commission_entries` a `PAID` ao quitar o payable (só 3 `UPDATE commission_entries` em `src`: aprovar, `PAYABLE`, cancelar). | `financial.ts:2861-2897`; busca em `services/**/src` |
| Cancelar venda | `cancelCommissionsForSale` cancela só `PENDING/APPROVED`; `PAYABLE/PAID` ficam intactos (decisão conservadora declarada); o payable aberto continua pagável. | `employee-commissions.ts:497-509` |
| Folha | `generatePayrollEntry` soma `commission_entries` `APPROVED/PAYABLE/PAID` cujo `created_at` é do mês da competência e **inclui o total no líquido**; `payPayrollEntry` cria um payable do líquido (migration 099: 1 payable vivo por folha). DRE gerencial trata para não contar comissão duas vezes. | `payroll.ts:257-301`; `financial.ts:1555-1661` |
| Recebimento | `receivables` (com `sale_id`) + alocações; `refreshReceivableStatus` deriva `paid_amount` das alocações. **Não há catálogo de formas de pagamento na venda** (só `payments.method` texto livre) e **não foi encontrada rotina de estorno** de recebimento/pagamento em `services/api/src`. | `financial.ts:2834-2859`; grep migrations/src |
| Arredondamento | `Math.round(x*100)/100` (em `financial.ts`, `commissions.ts`, `employee-commissions.ts`). | `financial.ts:2971` |

---

## 4. Matriz por capacidade

Legenda de lacuna: **P** = presente e equivalente; **Par** = presente em parte; **A** = ausente nos caminhos lidos.

| # | Capacidade | Código Lite | Equivalente Full | Lacuna | Proposta mínima (futura) |
| - | --- | --- | --- | --- | --- |
| C1 | Regra base (% bruto/margem, fixo) | `calculateCommission` | `generateEmployeeCommission`, `generateCommission` | **Par**: margem só no plano global; regra funcionário×produto não tem base “margem” | `calculation_metric` (`GROSS`/`MARGIN`); `MARGIN` só com base `PACKAGE_TOTAL` (margem é por venda: `getSaleMargin`) |
| C2 | Escopo hierárquico (vendedor+categoria → vendedor → padrão+categoria → padrão) | `findApplicableVersion` | funcionário+produto apenas | **A** (padrão da agência e “todos os produtos”) | `employee_id` e `product_type` anuláveis; precedência P1–P4 (§5.1) |
| C3 | Revisões append-only com motivo/autor/vigência | `appendRuleVersion` | fechar regra anterior + nova linha (histórico preservado) | **Par**: sem `reason`, sem vínculo antecessor, `valid_from` pode ser nulo | `reason`, `supersedes_rule_id`, `valid_from` obrigatório em linhas novas; rota de revisão |
| C4 | “Sem regra explícita” (`NONE` → pendente) | modo `NONE`/`PENDING_RULE` | erro de validação, sem registro | **Par** (comportamento diferente: erro ≠ pendência) | `blocks_inheritance` (impede herança); manter erro na geração manual (compat.) — decisão D6 |
| C5 | Excedente (`EXCESS`) | `apply_on`, `excess_threshold` | — | **A** | colunas espelho + CHECKs da 009 |
| C6 | Progressiva por faixas, marginal, mês civil | `sliceAcrossTiers`, `monthlyAccumulatedBase` | `TIERED_TARGET` só esquema | **A** | `employee_commission_rule_tiers` + `progressive` + acumulador por funcionário/mês/escopo |
| C7 | Snapshot completo + `calc_version` | `rule_snapshot` | colunas escalares apenas | **Par** | `calculation_snapshot JSONB`, `calc_version`, `recognition_date` em `commission_entries` |
| C8 | Arredondamento único | `roundMoney` | `Math.round` espalhado | **Par/diverge** | módulo compartilhado `roundMoney`; **mudança de valores marginais** → D7 |
| C9 | Modo de liberação congelado | `release_mode` | — | **A** | `commission_entries.release_mode` + origem da regra (D3) |
| C10 | Limite de pagamento = liberado − pago | `cash-flow.ts` | `allocatePayment` sem limite por liberação | **A** | guarda em `allocatePayment` para payable com `commission_entry_id` |
| C11 | Proteção de estorno de recebimento | `assertCommissionsStillCovered` | sem estorno nos arquivos lidos | **A** | função de guarda reutilizável; chamada quando existir estorno (D5) |
| C12 | Serialização por venda | `lockCommissionRelease` | — | **A** | mesmo padrão de lock consultivo, ordem única |
| C13 | Cancelamento de venda × payable | `sales.ts:730-774` | só `PENDING/APPROVED` | **Par** | cancelar payable aberto sem alocação; bloquear com alocação — D12 |
| C14 | `PAID` na quitação | `cash-flow.ts:516-536` | não encontrado | **A** | atualizar a entrada em `refreshPayableStatus` |
| C15 | Bases por produto/passageiro/bilhete | — (Lite só venda) | **Full tem** | Full **mais completo** | **preservar** integralmente (§7) |
| C16 | Folha | — (sem folha no Lite) | `payroll.ts` | Full **mais completo** | **preservar**; ajuste só p/ `ON_RECEIPT` (§7.2) |
| C17 | Revisão retroativa/ajustes (Fase 5), bônus/teto (D7 da spec) | **não implementado no Lite** | — | **Fora de escopo** (não é paridade) | não especificar aqui |

Separação pedida: **defaults/revisões** = C2–C4; **cálculo** = C1, C5–C8; **liberação de pagamento** = C9–C14.

---

## 5. Contratos propostos

Numeração de migrations abaixo é **ilustrativa** (última existente lida: `099_payroll_payable_unique.sql`);
confirmar a sequência real e o runner (`097_schema_migrations`) na implementação. Todas aditivas;
migrations aplicadas são imutáveis. **ADR necessária** antes do código (§13).

### 5.0 Módulo de cálculo compartilhado (base de COM-01..03)

Arquivo novo: `packages/domain/commission-calculation.ts` (puro, sem I/O, sem dependência de
`pg`). Origem lógica: `commission-engine.ts` do Lite; o Lite **não é alterado** até o Full estar
validado (regra Full-first). `roundMoney` do Lite (`money.ts`) é a referência.

```ts
export const COMMISSION_CALC_VERSION = 2; // Lite hoje = 1; versões não se misturam

export type CommissionMetric = 'GROSS' | 'MARGIN';
export type CommissionMode = 'PERCENTAGE' | 'FIXED';
export type CommissionApplyOn = 'TOTAL' | 'EXCESS';

export interface CommissionTier {
  tierNumber: number;          // 1..n, contíguo
  fromAmount: number;          // 1ª faixa = 0
  toAmount: number | null;     // última = null
  ratePoints: number;          // pontos percentuais (3 -> 4 = +1 p.p.)
}

export interface CommissionRuleSnapshot {  // fotografia imutável de uma regra
  ruleId: string;
  mode: CommissionMode;
  metric: CommissionMetric | null;         // null quando FIXED
  value: number;                           // taxa (p.p.) ou valor fixo unitário
  applyOn: CommissionApplyOn;
  excessThreshold: number | null;
  progressive: boolean;
  tierMode: 'MARGINAL';                    // 'CUMULATIVE_TOTAL' reservado (D2)
  tiers: CommissionTier[];
  validFrom: string | null;
  fixedMultiplier: 'PER_SALE' | 'PER_UNIT'; // Full: FIXED_PER_PASSENGER/TICKET
}

export interface CommissionCalcInput {
  rule: CommissionRuleSnapshot;
  baseAmount: number;          // já resolvido no servidor (item, venda ou margem)
  quantity: number;            // passageiros/bilhetes; 1 quando não aplicável
  accumulatedBefore: number;   // só progressiva; 0 caso contrário
}

export interface CommissionCalcResult {
  amount: number;              // arredondado (soma de fatias arredondadas na progressiva)
  baseAmount: number;
  ratePoints: number | null;
  fixedAmount: number | null;
  snapshot: Record<string, unknown>; // inclui calc_version, ruleId, slices, accumulated_before
}

export function roundMoney(value: number): number;               // idêntico ao Lite
export function calculateCommission(input: CommissionCalcInput): CommissionCalcResult;
export function sliceAcrossTiers(tiers: CommissionTier[], accumulated: number, base: number): TierSlice[];
```

Compatibilidade: `roundMoney` compartilhado **muda o resultado** de casos de meio-centavo no
Full (§8, N6) → só entra com decisão D7; até lá o módulo expõe `roundMoneyLegacyFull` apenas
para caracterização em teste, não para uso produtivo.

### 5.1 COM-01 — Herança de regras e revisões

**Reuso:** tabela `employee_commission_rules` (migration 080), `findApplicableRule`,
`createEmployeeCommissionRule` (fecha regra aberta anterior), rotas
`/employee-commission-rules*`, UI em `EmployeeDetailPage.tsx`. **Não** substituir
`commission_plans`.

Migration proposta `100_commission_rule_hierarchy.sql`:

```sql
ALTER TABLE employee_commission_rules
  ALTER COLUMN employee_id DROP NOT NULL,        -- NULL = padrão da agência
  ALTER COLUMN product_type DROP NOT NULL,       -- NULL = todos os produtos
  ADD COLUMN calculation_metric TEXT NOT NULL DEFAULT 'GROSS'
    CHECK (calculation_metric IN ('GROSS','MARGIN')),
  ADD COLUMN reason TEXT,
  ADD COLUMN supersedes_rule_id TEXT,            -- FK composta (agency_id, id)
  ADD COLUMN blocks_inheritance BOOLEAN NOT NULL DEFAULT false;
-- FK composta (agency_id, supersedes_rule_id) -> (agency_id, id)
-- CHECK: MARGIN somente com calculation_basis = 'PACKAGE_TOTAL'
-- CHECK: product_type IS NULL -> basis IN ('PRODUCT_TOTAL','PACKAGE_TOTAL','FIXED_PER_SALE')  (D5)
-- CHECK: valid_from NOT NULL para linhas novas (NOT VALID para não tocar legado)
-- Índice único de regra aberta ativa: recriar com COALESCE(employee_id,''), COALESCE(product_type::text,'')
```

Interfaces (arquivo `services/api/src/employee-commission-rules.ts`):

```ts
export type CommissionRuleScope = 'EMPLOYEE_PRODUCT' | 'EMPLOYEE_ALL' | 'AGENCY_PRODUCT' | 'AGENCY_ALL';

export interface ResolveRuleInput {
  employeeId: string;
  productType: EmployeeCommissionProductType;
  recognitionDate: string;      // 'YYYY-MM-DD', fuso da agência (D8)
}
export interface ResolvedRule {
  rule: EmployeeCommissionRule;
  scope: CommissionRuleScope;
  blocksInheritance: boolean;
}
// Executa NO MESMO client da transação do chamador (hoje findApplicableRule abre outra transação)
export function resolveCommissionRule(
  client: TenantTransactionClient, agencyId: string, input: ResolveRuleInput
): Promise<ResolvedRule | null>;

export interface ReviseRuleInput {
  effectiveFrom: string;        // obrigatório
  reason: string;               // obrigatório, não vazio
  changes: Partial<Pick<EmployeeCommissionRuleInput,
    'calculationType'|'calculationBasis'|'percentageRate'|'fixedAmount'|'calculationMetric'|'blocksInheritance'>>;
}
export function reviseEmployeeCommissionRule(
  database: DatabaseRuntime, ruleId: string, input: ReviseRuleInput, userId: string
): Promise<EmployeeCommissionRule>;
```

Rotas (arquivo `services/api/src/routes/commissions.ts`): `POST /employee-commission-rules/:id/revisions`
(novo); `POST /employee-commission-rules` continua aceito (compat.), agora também sem
`employeeId`/`productType` para criar padrão da agência (**permissão mais restrita**: dono/admin; servidor
decide `agencyId`, nunca o cliente). `GET` ganha filtro por escopo.

Regras:
- **Seleção (determinística):** para cada nível P1→P4 (funcionário+produto; funcionário+todos;
  agência+produto; agência+todos), candidatas = `status='ACTIVE'`, `valid_from ≤ D` (nulo = desde sempre),
  `valid_until ≥ D` (nulo = aberta). Primeira camada com candidata vence. Dentro da camada:
  `valid_from DESC NULLS LAST, created_at DESC, id DESC`. Se a vencedora tem `blocks_inheritance`
  → resultado “sem regra” (não herda).
- **Sem regra:** geração manual (`/commissions/generate-by-product`) **continua** retornando erro de
  validação (compat.). Não criar status `PENDING_RULE` no Full sem D6.
- **Revisão:** uma transação, trava `FOR UPDATE` na regra e advisory lock do escopo; insere a nova
  linha (`supersedes_rule_id`), fecha a anterior com `valid_until = effective_from − 1 dia` **apenas
  se** `effective_from` > `valid_from` da anterior (senão 409 — evita janela invertida);
  nenhuma linha antiga é editada nos campos de cálculo. Revisão com `effective_from` ≤ hoje que
  alcançaria comissões existentes **não recalcula nada** (§6.7).
- **Sem sobreposição:** validação aplicativa sob lock consultivo do escopo + índice único da regra
  aberta. Exclusion constraint (`btree_gist`) só se a extensão já existir/for aprovada (D9).
- **Auditoria:** reutilizar `recordAuditEvent` do Full; novos tipos de evento
  `COMMISSION_RULE_CREATED/REVISED` (confirmar enum de auditoria do Full na implementação).

Arquivos a tocar: `infrastructure/migrations/100_*.sql`, `employee-commission-rules.ts`,
`employee-commissions.ts` (passa a usar `resolveCommissionRule` no mesmo `client`),
`routes/commissions.ts`, `packages/domain/types.ts` (campos novos), `apps/agency/src/lib/api.ts`,
`apps/agency/src/pages/EmployeeDetailPage.tsx` (revisão + exibir escopo), e página/aba de “Padrão da
agência” (nova ou em `CommissionPlansPage.tsx`). Testes: §9.

### 5.2 COM-02 — Excedente e faixas progressivas

Migration `101_commission_tiers_and_snapshots.sql`:

```sql
ALTER TABLE employee_commission_rules
  ADD COLUMN apply_on TEXT NOT NULL DEFAULT 'TOTAL' CHECK (apply_on IN ('TOTAL','EXCESS')),
  ADD COLUMN excess_threshold NUMERIC(14,2) CHECK (excess_threshold IS NULL OR excess_threshold >= 0),
  ADD COLUMN progressive BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN tier_mode TEXT NOT NULL DEFAULT 'MARGINAL' CHECK (tier_mode IN ('MARGINAL'));
-- CHECK ((apply_on='EXCESS') = (excess_threshold IS NOT NULL))
-- CHECK (NOT progressive OR (calculation_type='PERCENTAGE' AND apply_on='TOTAL'))
-- CHECK (calculation_type <> 'FIXED' OR apply_on = 'TOTAL')

CREATE TABLE employee_commission_rule_tiers (          -- append-only
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL, rule_id TEXT NOT NULL,
  tier_number INT NOT NULL CHECK (tier_number >= 1),
  from_amount NUMERIC(14,2) NOT NULL CHECK (from_amount >= 0),
  to_amount NUMERIC(14,2), rate NUMERIC(7,4) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  UNIQUE (agency_id, rule_id, tier_number), CHECK (to_amount IS NULL OR to_amount > from_amount),
  FOREIGN KEY (agency_id, rule_id) REFERENCES employee_commission_rules (agency_id, id)
);
-- RLS FORCE + policies SELECT/INSERT apenas (sem UPDATE/DELETE), padrão agency_id = current_agency_id()

ALTER TABLE commission_entries
  ADD COLUMN calculation_snapshot JSONB,                -- NULL em entradas legadas
  ADD COLUMN calc_version INT,
  ADD COLUMN recognition_date DATE;                     -- NULL legado => usar created_at
```

Regras de cálculo (contrato; **espelha o Lite verificado**, não a evolução desejada):
1. `FIXED`: `amount = roundMoney(fixed × (usesQuantity ? quantity : 1))` (já é o Full hoje).
2. `PERCENTAGE` + `TOTAL` + não progressiva: `roundMoney(base × taxa / 100)`.
3. `PERCENTAGE` + `EXCESS`: `roundMoney(max(base − limiar, 0) × taxa / 100)` — **por cálculo (por base)**,
   igual ao Lite; excesso sobre o acumulado mensal **não** é paridade (D3).
4. Progressiva marginal: `end = acumulado + base`; para cada faixa,
   `sobre = max(min(end, para) − max(acumulado, de), 0)`; comissão da fatia = `roundMoney(sobre × taxa/100)`;
   total = `roundMoney(soma das fatias arredondadas)`. Taxas em pontos percentuais.
5. Acumulador no Full: **soma de `calculation_base`** das entradas do mesmo funcionário, **mesmo escopo
   de regra** (`product_type` da regra, ou todos se nulo), mesmo mês civil de `recognition_date`, status ≠
   `CANCELLED`, excluindo a própria. Entradas `PENDING/APPROVED/PAYABLE/PAID` contam.
   **Diferença estrutural:** no Lite o acumulador soma vendas inteiras; no Full soma bases de itens.
   Equivalem apenas quando a regra é `PACKAGE_TOTAL` (base = `sales.total`) — registrar no teste.
6. A progressão só se aplica a bases em dinheiro (`PRODUCT_TOTAL`, `PACKAGE_TOTAL`); proibida com
   `PER_PASSENGER`/`PER_TICKET` na v1 (D4).

Interface do gerador (assinatura mantida, comportamento ampliado):

```ts
// employee-commissions.ts
export async function generateEmployeeCommission(
  database: DatabaseRuntime, input: GenerateEmployeeCommissionInput  // inalterado (compat.)
): Promise<CommissionEntry>;                                         // CommissionEntry ganha campos opcionais:
// calculationSnapshot?: Record<string, unknown>; calcVersion?: number; recognitionDate?: string; releaseMode?: 'ON_SALE'|'ON_RECEIPT';
```

Arquivos: migration 101, `commission-calculation.ts` (novo), `employee-commissions.ts`,
`employee-commission-rules.ts` (CRUD de faixas na criação/revisão, validação de contiguidade: 1ª de
0, `to` = `from` da seguinte, última aberta), `types.ts`, `routes/commissions.ts`,
`api.ts`, `EmployeeDetailPage.tsx`, `CommissionPlansPage.tsx` (parar de anunciar `TIERED_TARGET`
como “apenas esquema” **somente** se o plano global passar a ser servido pelo mesmo motor — D1).

### 5.3 COM-03 — Liberação por recebimento

**Pré-requisitos bloqueantes (D3, D5):** origem de “exige recebimento” e estorno de recebimento.

Migration `102_commission_release.sql` (condicionada a D3):

```sql
ALTER TABLE commission_entries
  ADD COLUMN release_mode TEXT NOT NULL DEFAULT 'ON_SALE' CHECK (release_mode IN ('ON_SALE','ON_RECEIPT'));
CREATE UNIQUE INDEX payables_agency_commission_entry_live_key
  ON payables (agency_id, commission_entry_id)
  WHERE commission_entry_id IS NOT NULL AND status <> 'CANCELLED';
-- Precedido de DO $$ ... RAISE EXCEPTION se já houver duplicatas vivas (padrão da 099); nada é apagado.
-- Origem de requires_receipt: ver D3 (catálogo de formas de pagamento + sales.payment_method_id, ou outra).
```

Funções (arquivo novo `services/api/src/commission-release.ts`, reutilizado por `financial.ts`):

```ts
export interface CommissionEntryRelease {
  releaseMode: 'ON_SALE' | 'ON_RECEIPT';
  amount: number;       // commission_entries.amount (reconhecido, imutável)
  released: number;     // ON_SALE: amount; ON_RECEIPT: roundMoney(amount * min(received/total, 1))
  paid: number;         // soma de payment_allocations nos payables vivos da entrada
  payable: number;      // max(roundMoney(released - paid), 0)
}
export function commissionReleaseLockKey(agencyId: string, saleId: string): string; // 'commission-release:{agency}:{sale}'
export function lockCommissionRelease(client, agencyId, saleId): Promise<void>;
export function loadCommissionEntryRelease(client, agencyId, entryId): Promise<CommissionEntryRelease>;
export function assertCommissionEntriesStillCovered(client, agencyId, saleId): Promise<void>; // 409 se pago > liberado
```

- `received` = Σ alocações (`payment_allocations.receivable_id`) dos recebíveis **não cancelados** da
  venda; `total` = Σ `receivables.amount` não cancelados (mesma definição do Lite).
- **Guarda em `allocatePayment`** (`financial.ts:2093`): para alocação OUT em payable com
  `commission_entry_id` e `release_mode='ON_RECEIPT'`: lock consultivo da venda **antes** de qualquer
  `FOR UPDATE` (a venda é descoberta por leitura prévia dos `payableId`s, como o Lite faz no estorno);
  `payable == 0` → `ConflictError` (409); `amount > payable` → `ValidationError`
  ("excede a comissão liberada"). `ON_SALE`: sem limite além da capacidade do payable.
- **`PAID` da entrada:** em `refreshPayableStatus`, quando `commission_entry_id` ≠ nulo e o payable quita,
  `UPDATE commission_entries SET status='PAID', paid_at=COALESCE(paid_at, now())`. (Hoje não existe — §11.)
- `createPayableFromCommissionEntry`: `SELECT ... FOR UPDATE` na entrada + índice único acima.
- **Estorno de recebimento:** o Full não tem a rotina nos arquivos lidos → esta especificação só fixa a
  **guarda** (`assertCommissionEntriesStillCovered`) a ser chamada por qualquer futuro estorno; a própria
  funcionalidade de estorno é uma lacuna de paridade a inventariar (D5).
- **Folha:** ver §7.2. Nenhuma mudança para entradas `ON_SALE`/legadas.
- **Congelamento:** `release_mode` é gravado na geração e nunca muda; trocar a forma de pagamento depois
  não altera comissões existentes (igual ao Lite).

Arquivos: migration 102, `commission-release.ts` (novo), `financial.ts` (`allocatePayment`,
`refreshPayableStatus`), `commissions.ts` (`createPayableFromCommissionEntry`),
`employee-commissions.ts` (grava `release_mode`; `cancelCommissionsForSale`), `payroll.ts` (§7.2),
`routes/commissions.ts` e `routes/financial.ts` (campos de resposta `released`, `payable`),
`apps/agency` (extrato mostra liberado/pago/saldo; mensagem de 409).

---

## 6. Regras transversais

### 6.1 Seleção e vigência
Data-base = `recognition_date` gravada na geração (D8: evento e fuso). Hoje o Full usa
`sales.created_at` convertido em UTC, o que pode atribuir a venda ao dia seguinte. Janela de regra é
**inclusiva** nas duas pontas (`valid_from ≤ D ≤ valid_until`), como no Full atual; o Lite usa só
`effective_from` (a próxima versão “encerra” a anterior). O pareamento (§10) converte uma
convenção na outra sem perda.

### 6.2 Acumulado
Mês civil de `recognition_date`. Ordem = **ordem de geração** (a comissão já gerada nunca muda); gerar
fora da ordem cronológica das vendas pode alterar a faixa de uma entrada posterior — comportamento
espelhado do Lite (“vendas confirmadas antes desta”) mas **mais exposto no Full**, pois a geração é
manual. Cancelar uma entrada **não** recalcula as posteriores (sem recálculo implícito).

### 6.3 Estorno e cancelamento
- Venda cancelada: entradas `PENDING/APPROVED` → `CANCELLED` (hoje). Proposta (D12): `PAYABLE` sem
  alocações → cancelar payable e entrada; `PAYABLE` com alocações e `PAID` → **409** no cancelamento
  da venda (igual ao Lite). Isso **muda** o Full atual, que permite cancelar — exige decisão.
- Cancelar entrada não apaga pagamentos; saldo pago a maior vira ajuste (Fase 5, fora de escopo).
- Redução do liberado por estorno de recebimento nunca desfaz pagamento: bloqueia (C11).

### 6.4 Arredondamento
Um único `roundMoney`; **uma vez por componente**; progressiva = soma de fatias já arredondadas
(memória reconcilia). Valores nunca em `float` acumulado entre entradas; persistir em `NUMERIC(14,2)`.

### 6.5 Concorrência
Ordem total de travas: (1) advisory de acúmulo `commission-accrual:{agency}:{employee}:{YYYY-MM}:{scope}`
na geração progressiva; (2) advisory `commission-release:{agency}:{sale}` em pagamento de comissão e em
estorno de recebimento; (3) `FOR UPDATE` em regra/entrada/payable/pagamento. Advisory antes de
linhas, sempre. `hashtext` pode colidir (apenas serializa a mais). Gerações simultâneas do mesmo
escopo/mês serializam; do mesmo (venda, funcionário, produto) são barradas pelo índice único.

### 6.6 Idempotência
Geração: chave natural (venda, funcionário, produto) + índice único; **decisão D10** se a chave
precisa incluir `source_item_id` (hoje dois itens aéreos da mesma venda para o mesmo funcionário
colidem). Revisão: reexecutar a mesma revisão (mesmo `supersedes_rule_id` + `effective_from`) não duplica
(índice único composto). Payable: um vivo por entrada (índice proposto). Pagamento: alocação limitada a
`payable` calculado sob lock.

### 6.7 Snapshots e “sem recálculo histórico”
`calculation_snapshot` guarda regra completa (mode/valor/limiar/faixas/versão), `accumulated_before`,
fatias, `calc_version`, `recognition_date`, `release_mode`. Revisão de regra, mudança de faixa ou de
algoritmo **não toca** entradas existentes. Qualquer correção retroativa é “Fase 5” (prévia,
reautenticação, ajustes append-only) — **não especificada nem autorizada aqui**.

---

## 7. Integração com produto/passageiro/bilhete e folha

### 7.1 Produto / passageiro / bilhete (preservar)
- Bases `PER_PASSENGER`, `PER_TICKET`, `FIXED_PER_PASSENGER/TICKET/SALE` e HOTEL/TRANSFER manuais
  permanecem **inalteradas**. Excedente/progressão **não** se combinam com bases por quantidade na v1
  (D4); regras por quantidade seguem exatamente o fluxo atual.
- Cada entrada continua sendo por (venda, funcionário, produto); o acumulador soma bases por escopo;
  excursão com valor por passageiro continua usando `sale_value` real de `excursion_customers`.
- `commission_plans` (global) segue funcionando como hoje; unificar plano global e regras é D1.

### 7.2 Folha (preservar)
- Entradas legadas e `ON_SALE`: **zero mudança** (competência por `created_at`, `APPROVED/PAYABLE/PAID`,
  líquido idêntico).
- Risco existente (verificar com teste de caracterização): uma entrada pode ter payable próprio **e**
  entrar no líquido da folha → dois caminhos de pagamento para o mesmo valor. Propor, sob D11, marcar a
  entrada com o canal (`payroll_entry_id` único por entrada **ou** payable próprio, exclusivos).
- Entradas `ON_RECEIPT`: para não pagar comissão não liberada pela folha, a soma da folha deve usar
  `released` (não `amount`) para essas entradas, descontando o já pago por payable próprio. Muda valores
  de folha apenas para o recurso novo; exige D11.

---

## 8. Casos numéricos esperados

Expectativas “Lite verificado” foram **calculadas com a lógica do Lite** (conferidas em `node`
com a mesma fórmula, sem tocar no repo). “Full alvo” = resultado esperado do contrato acima.
Todas as taxas em pontos percentuais.

| ID | Cenário | Entrada | Resultado esperado |
| --- | --- | --- | --- |
| N1 | Fixo | `FIXED` 150,00 | 150,00 |
| N2a | % bruto | bruto 10.000, 5% | 500,00 |
| N2b | % margem | margem 2.000, 10% | 200,00 |
| N3a | Excedente | base 12.000, limiar 10.000, 5% | 100,00 |
| N3b | Excedente abaixo do limiar | base 9.000, limiar 10.000, 5% | 0,00 (comissão calculada zero; não é `PENDING_RULE`) |
| N4 | Progressiva sem cruzar | faixas 0–50k@3%, 50k–100k@4%, 100k+@5%; acumulado 10.000, base 20.000 | 20.000×3% = 600,00 |
| N5 | Cruza 1 faixa | idem; acumulado 45.000, base 20.000 | 5.000×3% + 15.000×4% = 150 + 600 = **750,00** |
| N6 | Cruza 2 faixas | idem; acumulado 45.000, base 70.000 | 150 + 50.000×4% (2.000) + 15.000×5% (750) = **2.900,00** |
| N7 | Meio-centavo (diverge) | base 18,50 × 3% (= 0,555) | Lite `0,56`; **Full atual `0,55`** (`Math.round(x*100)/100`); Full alvo `0,56` **se D7 aprovar** |
| N8 | Fatias arredondadas | duas fatias de 0,15 a 3% | cada fatia 0,0045→`0,00`; total `0,00` (a soma sem arredondar daria `0,01` — registrar que vale a soma das fatias) |
| N9 | Mês virou | mesma regra, acumulado do mês anterior ignorado | acumulado = 0 no mês novo |
| N10 | Liberação ON_SALE | comissão 750,00 | liberado 750,00 desde a geração |
| N11 | Recebimento parcial | `ON_RECEIPT`, comissão 750,00, recebíveis 10×1.000, recebido 3.000 | liberado **225,00**; pago 200 → ainda pagável 25,00 |
| N12 | Proporção não exata | idem, recebido 3.333,33/10.000 | 750 × 0,333333 = **250,00** (arredondado) |
| N13 | Excede liberado | liberado 225,00, pago 200,00, tentativa de 50,00 | rejeita (`ValidationError`; nada gravado) |
| N14 | Nada liberado | recebido 0, tentativa de pagar | 409 |
| N15 | Estorno de recebimento seguro | recebido 3.000→2.000, pago 100,00, liberado cai a 150,00 | permitido (pago ≤ liberado) |
| N16 | Estorno que sobrepaga | recebido 3.000→2.000, pago 225,00, liberado 150,00 | **409** bloqueado; nada revertido |
| N17 | Comissão paga | payable quitado integralmente | entrada `PAID` (Lite já; Full alvo) |
| N18 | Estorno de pagamento | pagamento da comissão estornado | entrada `PAID → APPROVED` (Lite já; Full: depende de D5) |
| N19 | Venda cancelada, comissão `PAYABLE` sem alocação | — | payable cancelado, entrada cancelada (Full alvo, D12) |
| N20 | Venda cancelada com alocação | — | 409 (Full alvo, D12) |
| N21 | Produto (Full, preservado) | AIR 4.000 @5% PRODUCT_TOTAL | 200,00 |
| N22 | Passageiros (Full, preservado) | 2.000+2.000+1.800 @5% PER_PASSENGER | 290,00 (teste existente) |
| N23 | Fixo por bilhete (Full, preservado) | 3 bilhetes × 40,00 | 120,00 |
| N24 | Herança | funcionário sem regra de AIR; há regra “todos os produtos” do funcionário e padrão da agência | vence funcionário+todos; padrão ignorado |
| N25 | `blocks_inheritance` | regra do funcionário+produto marcada como “sem comissão” | não herda o padrão; geração manual falha com erro claro |
| N26 | Vigência | regra A até 2026-10-09, B desde 2026-10-10; venda em 10/10 | B |

Observação: N10–N20 usam o contrato do Lite como oráculo; no Full dependem de D3/D5.

---

## 9. Plano de testes Vitest (nada executado nesta rodada)

Padrões do repositório: Full usa `services/api/tests/*.test.ts` com banco real (hoje
`employee-commission-rules.test.ts`, `financial.test.ts`); testes **puros** não recriam banco e
podem rodar isolados. Regra: **não** executar suites que resetam banco compartilhado em paralelo;
integração só com autorização e ambiente descartável.

| Etapa | Arquivo (novo ou alterado) | Tipo | Conteúdo |
| --- | --- | --- | --- |
| E0 | `packages/domain/tests/commission-calculation.test.ts` | puro | N1–N9, N7/N8 (caracterização `roundMoney`), fatias, contiguidade de faixas, taxa em p.p.; sem DB |
| E0b | `services/api/tests/commission-characterization.test.ts` | puro/DB mínima | fixa o comportamento **atual** do Full (arredondamento, dedupe por produto, janela inclusiva) antes de mudar qualquer coisa — falha antes/passa depois quando aplicável |
| E1 | `services/api/tests/commission-rule-hierarchy.test.ts` | DB | N24–N26; P1–P4; `blocks_inheritance`; revisão fecha anterior; revisão com `effective_from` inválido → 409; reexecução idempotente; `AGENT` 403; outra agência 404/RLS; auditoria |
| E1b | `services/api/tests/employee-commission-rules.test.ts` | DB (existente) | regressão: todos os testes atuais passam sem alteração (compat.) |
| E2 | `services/api/tests/commission-progressive.test.ts` | DB | N4–N6, N9; acumulador por escopo e mês; entrada cancelada não conta; geração fora de ordem (comportamento documentado); duas gerações concorrentes do mesmo funcionário/mês produzem acumulados distintos e consistentes (advisory) |
| E2b | idem | DB | snapshot completo gravado e **imutável** após revisão posterior; legado (`calculation_snapshot` nulo) continua listável e somado pela folha |
| E3 | `services/api/tests/commission-release.test.ts` | DB | N10–N17; congelamento do `release_mode`; limite em `allocatePayment`; `PAID` da entrada; recebível cancelado ignorado |
| E3b | `services/api/tests/commission-release-concurrency.test.ts` | DB | pagamento de comissão × (futuro) estorno de recebimento em paralelo: sem deadlock, sem sobrepagamento (modelo: `commission-concurrency.test.ts` do Lite) |
| E3c | `services/api/tests/commission-payable-uniqueness.test.ts` | DB | duas chamadas simultâneas de `create-payable` → um payable vivo; migration aborta com duplicata prévia |
| E4 | `services/api/tests/payroll-commission-integration.test.ts` | DB | folha legado inalterada; `ON_RECEIPT` entra pelo liberado; entrada não paga por dois canais (D11); competência |
| E5 | `apps/agency/src/pages/*.test.tsx` / `App.test.tsx` | UI (Vitest+RTL) | revisão de regra com motivo; edição de faixas (contíguas); extrato com liberado/pago; erro 409 traduzido |
| E6 | `tests/security/*` (se aplicável) | segurança | RLS nas tabelas novas; tenant não aceito do corpo |

Ordem de execução por etapa: escrever teste que **falha** (quando há mudança de comportamento),
implementar, passar `lint`/`typecheck`/testes relevantes/`build` (QUALITY-GATES). Gates de DB só com
ambiente descartável isolado e autorização explícita (AGENTS.md).

**Explicitamente não testado nesta rodada:** tudo acima. Também não foram executados os testes puros
do Lite citados na vistoria (9 aprovados, segundo o relatório de auditoria — evidência de terceiros).

---

## 10. Pareamento conceitual Lite → Full (para migração futura; nenhum dado copiado)

Contrato conceitual, a validar com o runbook `docs/travel-lite/MIGRACAO-LITE-PARA-FULL.md`.
`tenant_id` (UUID) e `agency_id` (TEXT) **não** são equivalentes por renomeação; é necessário um
registro de pareamento por entidade (origem, destino, chave natural, hash/versão).

| Lite | Full | Observação |
| --- | --- | --- |
| `tenants` | `agencies` | pareamento explícito; nunca por nome |
| `sellers` | `employees` (+ `users`) | Lite vendedor pode não ter `employee`; exige decisão humana por vendedor |
| `sale_categories` | `EmployeeCommissionProductType` (enum fixo) ou “todos” | **muitos-para-um e com perda**; exige tabela de-para aprovada (D13) |
| `commission_rules` (escopo) | escopo de `employee_commission_rules` (P1–P4) | `seller_id` nulo → padrão da agência |
| `commission_rule_versions` | **uma linha** `employee_commission_rules` por versão | `valid_from = effective_from`; `valid_until` = véspera da próxima versão; `reason`, `revised_by`→`created_by_user_id`, `revised_at`→`created_at` preservados; `supersedes_rule_id` encadeado |
| `mode`/`calculation_base`/`value` | `calculation_type`/`calculation_basis`+`calculation_metric`/`percentage_rate`\|`fixed_amount` | `GROSS`→`PACKAGE_TOTAL`+`GROSS`; `MARGIN`→`PACKAGE_TOTAL`+`MARGIN`; `FIXED`→`FIXED_PER_SALE`; `NONE`→`blocks_inheritance` |
| `commission_rule_tiers` | `employee_commission_rule_tiers` | cópia verbatim (taxas em p.p.) |
| `seller_commissions` | `commission_entries` | `commission_amount` e `rule_snapshot` **verbatim** em `calculation_snapshot` com `source:'LITE'` e `calc_version` de origem (1); **nunca recalcular** |
| `PENDING_RULE` | sem equivalente (Full não tem o status) | decisão D6 (criar status ou não migrar a pendência) |
| `release_mode` | `release_mode` | igual |
| `payables.commission_id` | `payables.commission_entry_id` | um vivo por entrada |
| margem da venda (`margin_amount` gravado) | derivada (`getSaleMargin`) | para histórico, usar o valor **do snapshot**, não recomputar |

Evidências mínimas (runbook): por vendedor/mês, soma de bases e de comissões por status; contagens;
liberado × pago por entrada `ON_RECEIPT`; conciliação de payables; amostra de snapshots idênticos.
**Nunca** marcar completa por contagem de linhas nem apagar origem. O executor de migração é outro projeto.

---

## 11. Achados de risco no Full atual (não causados por esta proposta)

| # | Achado | Evidência | Gravidade |
| - | --- | --- | --- |
| R1 | `createPayableFromCommissionEntry` lê a entrada sem `FOR UPDATE` e não há índice único em `payables.commission_entry_id`; duas chamadas simultâneas podem criar dois payables | `commissions.ts:312-366`; migrations 043/099 | alta |
| R2 | Entrada não vai a `PAID` ao quitar o payable (não encontrado código); fica `PAYABLE` | só 3 `UPDATE commission_entries` em `services/**/src` | média (confirmar com teste) |
| R3 | Arredondamento `Math.round(x*100)/100` diverge do Lite (N7) | `employee-commissions.ts:316`, `financial.ts:2971` | média |
| R4 | Data de reconhecimento via `toISOString().slice(0,10)` (UTC) | `employee-commission-rules.ts:267` | média |
| R5 | `findApplicableRule(database, …)` abre **outra** transação dentro da transação de geração; leitura de regra não fica na mesma fotografia | `employee-commissions.ts:303` | média |
| R6 | Dedupe por (venda, funcionário, `product_type`) impede dois itens do mesmo tipo na mesma venda para o mesmo funcionário | `employee-commissions.ts:285-297` | média (pode ser intencional) |
| R7 | Cancelar venda deixa payable de entrada `PAYABLE` pagável | `employee-commissions.ts:497-509` | alta |
| R8 | Folha embute o total de comissões no líquido e entrada pode ter payable próprio → risco de pagamento duplo | `payroll.ts:274-301`; `commissions.ts:347-362` | alta (confirmar) |
| R9 | Folha filtra por `commission_entries.created_at`, não pela data de reconhecimento | `payroll.ts:278-279` | baixa |
| R10 | Não foi encontrada rotina de estorno de recebimento/pagamento no Full (existe no Lite) — 10ª discrepância fora da lista de nove | grep `services/api/src` | média (confirmar busca mais ampla) |

---

## 12. Decisões humanas pendentes

Bloqueantes marcadas com ⛔. Recomendação = proposta minha, **não** decisão tomada.

| ID | Decisão | Opções / Recomendação | Bloqueia |
| --- | --- | --- | --- |
| D1 ⛔ | Unificar `commission_plans` (global) com `employee_commission_rules`, ou manter coexistindo? | Manter coexistindo na v1; só `employee_commission_rules` ganha COM-01..03. `TIERED_TARGET` permanece “esquema” até decisão. | COM-01 UI |
| D2 ⛔ | Progressão: **marginal** (como o Lite) vs **total** (faixa atingida vale para o acumulado, com ajuste da diferença) | Paridade = marginal. “Total” **não** é equivalente e depende de ajustes (Fase 5). Contrato reserva `tierMode`. Decidir se “total” é desejado. | COM-02 |
| D3 ⛔ | Onde mora “exige recebimento” no Full, que **não tem forma de pagamento na venda**? (a) catálogo + `sales.payment_method_id`; (b) por regra/funcionário; (c) por agência | A decisão do usuário (2026-10-22) diz “da forma de pagamento” → (a), que toca o módulo de vendas (escopo maior). | COM-03 |
| D4 | Excedente/progressão com bases por quantidade (`PER_PASSENGER/TICKET`) | Proibir na v1 | COM-02 |
| D5 ⛔ | Full terá estorno de recebimento/pagamento (paridade com Lite)? Quem implementa? | Tratar como item de paridade próprio; COM-03 só entrega a guarda. | COM-03 |
| D6 | “Sem regra explícita”/`PENDING_RULE` no Full: erro (atual) ou registro pendente? | Manter erro na geração manual; `blocks_inheritance` só para impedir herança | COM-01 |
| D7 ⛔ | Adotar `roundMoney` do Lite no Full (muda centavos em casos como N7) | Sim, mas só com caracterização e aviso; não retroativo | COM-02 |
| D8 ⛔ | Evento e fuso do reconhecimento no Full (hoje `sales.created_at` UTC; Full gera manualmente) | Gravar `recognition_date` no fuso da agência; avaliar gatilho automático | COM-01/02 |
| D9 | Exclusion constraint (`btree_gist`) para sobreposição de vigência | Validar na aplicação + índice parcial; extensão só se aprovada | COM-01 |
| D10 | Chave de idempotência incluir `source_item_id`? | Sim para itens distintos; mudar índice é migration | COM-02 |
| D11 ⛔ | Canal de pagamento da comissão: payable próprio **ou** folha (exclusivos)? Folha usa `released` para `ON_RECEIPT`? | Exclusivos; folha legado inalterada | COM-03 |
| D12 | Cancelar venda com entrada `PAYABLE/PAID`: bloquear (como Lite) ou manter “intactas”? | Bloquear com alocação; cancelar payable sem alocação | COM-03 |
| D13 | De-para `sale_categories`→produto | Tabela aprovada pelo cliente/produto | migração |
| D14 | **Perfil financeiro global** (spec §4: `META_E_LIBERACAO`/`SOMENTE_LIBERACAO`): a spec §12.3 o declara descartado por decisão do usuário, mas a confirmação humana **não foi verificada** e a instrução anterior pede o perfil | **Não** propagar como descartado; obter confirmação explícita. Este relatório não depende dele. | COM-03 |
| D15 | Excedente: por cálculo (Lite) ou sobre o acumulado/meta (spec §3.3)? | Paridade = por cálculo; evolução é outra decisão | COM-02 |
| D16 | Vendedor do Lite ↔ funcionário do Full: criar `employee` para vendedores sem vínculo? | Decisão por cliente | migração |
| D17 | Permissão de regra padrão da agência e revisão no Full | Dono/admin; RBAC existente, sem GRANT individual (depende de SEC-01) | COM-01 |
| D18 | Auditoria obrigatória (rollback se falhar) como no Lite? | Sim para criar/revisar regra | COM-01 |
| D19 | `calc_version` do Full começa em 2? | Sim; histórico Lite = 1 | COM-02 |
| D20 | Retroatividade/ajustes (Fase 5), bônus/teto: fora desta paridade? | Confirmar que ficam fora | todos |
| D21 | ADR única (“motor de comissões compartilhado”) ou uma por fase | Uma, com anexos por fase | todos |
| D22 | Quando o Lite passa a consumir `packages/domain/commission-calculation.ts` | Só após Full validado e aprovado | pós-COM-03 |

---

## 13. Fases, arquivos e gates

| Fase | Entrega | Pré-requisito | Migration |
| --- | --- | --- | --- |
| 0 | ADR + resposta às decisões ⛔ | este relatório + consolidação Codex | — |
| 1 | `commission-calculation.ts` + testes puros + caracterização do Full (E0/E0b); correção R1 (índice+`FOR UPDATE`) se aprovada | D7 | 102 parcial |
| 2 | COM-01 (hierarquia/revisões) | D1, D6, D8, D17 | 100 |
| 3 | COM-02 (excedente/faixas/snapshot) | D2, D4, D7, D15 | 101 |
| 4 | COM-03 (liberação) | D3, D5, D11, D12 | 102 |
| 5 | UI Full + extrato | fases 2–4 | — |
| 6 | Validar Full → só então recorte Lite (consumir módulo) | D22 | — |

Gate de encerramento de cada fase: o do plano de alinhamento (contrato aprovado; teste vermelho→verde;
Full validado antes do Lite; lint/typecheck/test/build; RLS/concorrência só em ambiente descartável
autorizado; UI desktop/mobile se visual; matriz atualizada; revisão Codex). **ADR obrigatória**
(mudança arquitetural: módulo compartilhado + extensão de domínio) e **migrations obrigatórias**
(100–102, ilustrativas).

---

## 14. Bloqueios e estado final

- **HOLD de implementação.** Nada foi implementado, testado ou executado. Nenhum arquivo de código,
  schema, migration, lockfile, coordenador ou outro relatório foi editado.
- Bloqueios para iniciar código: decisões ⛔ D1, D2, D3, D5, D7, D8, D11 (e D14 — confirmação do perfil
  financeiro) e criação da ADR.
- IMP-01 (importação de vendas) **não** foi iniciada; este relatório não a especifica.
- Gadotti permanece no Lite; bancos separados; migração **não** autorizada; sem deploy/acesso online/`.env`.
- Verificar antes de implementar: estado real do índice de dedupe pós-080, permissões das rotas de
  comissão do Full, schema aplicado, `PayrollPage.tsx`, e se existe estorno de pagamentos fora dos
  arquivos lidos (R10).
