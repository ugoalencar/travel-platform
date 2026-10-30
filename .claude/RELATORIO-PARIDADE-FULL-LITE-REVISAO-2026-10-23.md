# Contrato revisado de paridade Full / Lite — Comissões (COM-01..03)

Data: 2026-10-23. Autor: Claude. Rodada **documental**; resposta à
`.claude/REVISAO-CODEX-PARIDADE-FULL-LITE-2026-10-23.md` (lida por inteiro).
Substitui, para efeito de revisão, as seções 5–13 de
`RELATORIO-PARIDADE-FULL-LITE-2026-10-23.md` (não editado). Branch
`wip/organizacao-2026-10-20`; checkout sujo preservado.

> **HOLD de implementação.** Nada foi implementado, migrado ou executado.
> Toda SQL/TypeScript abaixo é **ilustrativa** (nomes e números de migration e
> `calc_version` são propostas, não reservas). Gadotti permanece no Lite;
> bancos separados; migração não autorizada.

---

## 1. Resposta aos achados do Codex

| Achado | Aceito? | Resposta (resumo) | Onde |
| --- | --- | --- | --- |
| P1 Acumulador de comissões ≠ acumulador de vendas | **Sim** | Retiro a soma de `commission_entries`. A unidade de acumulação passa a ser a **venda atribuída** (`sale_commission_attributions`), independente de existir comissão gerada, ordenada pela sequência de atribuição, com métrica/categoria/mês canônicos e deduplicação (venda, funcionário). Progressiva só para unidade-venda. | §4.2 |
| P1 Revisões no mesmo dia | **Sim** | Abandono “fechar na véspera”. Revisões viram **versões imutáveis** (identidade e `version_number` preservados, como no Lite); a vigência é uma **projeção derivada** com origem rastreável, inclusive versões supersedidas sem intervalo. Snapshots nunca são reapontados. | §4.1 |
| P1 Perda de categorias e pendências | **Sim** | Categorias viram **catálogo próprio** (`commission_categories`) usado por regras e atribuições; `PENDING_RULE` ganha **destino equivalente** (status + linha sem valor). Se o produto não adotar os dois destinos, a migração fica **IMPEDIDA** (nunca “bem-sucedida por omissão”). | §4.3, §5 |
| P1 Índice com cast enum→text | **Sim** | Sem `COALESCE`/cast. Unicidade por **seis índices parciais** sobre colunas puras (padrão já usado na 080) numa tabela de escopos; sobreposição de janelas validada na aplicação sob lock. DDL **não provada** — exige banco descartável autorizado. | §4.1 |
| P1 Folha: liquidação por comissão e por canal | **Sim** | Novo contrato de **saldo liquidável** com razão de liquidações por canal (`commission_settlements`), reserva/liberação atômica, revalidação na aprovação, na criação da obrigação e **na alocação do pagamento**. Legado em conflito é **detectado e reportado**, não “resolvido”. | §3.3 |
| Riscos atuais do Full | **Sim** | Fase 0 caracteriza R1–R11 antes de qualquer recurso novo (testes nomeados). | §3 |
| Perfil financeiro global | **Sim** | Instrução humana segue **vigente**; COM-03 fica parametrizado por uma função de política e **bloqueado** até confirmação verificável. Não propago “descartado”. | §4.5, §8 |
| Marginal não pode ser a única regra final | **Sim** | Duas trilhas: **P (paridade com Lite atual)** e **E (evolução desejada: total / excedente selecionável)**, com enums reservados e sem implementar E. | §4.4 |
| 22 perguntas | **Sim** | Reduzidas a **7 escolhas comerciais/financeiras**; o resto é decisão técnica registrada e sujeita à revisão. | §8 |
| Estorno é candidato de paridade | **Sim** | Tratado como item próprio (PAR-EST), não como “guarda de fluxo futuro”. | §4.6 |

---

## 2. Releituras e exame adicional

- `docs/AI_CONTEXT.md`: Full é a base; migrations imutáveis e aditivas; `services/api` importa
  `packages/domain` por **caminho relativo direto ao .ts** (sem build). O texto do contexto cita
  “migrations 001..037”, mas o repositório vai até `099` — desatualizado, não afeta o contrato.
  `services/api-lite` **não** importa `packages/domain` hoje (espelha o contexto em
  `tenant-context.ts`); o `tsconfig` de `api-lite` tem `rootDir: ../..` mas `include` só de `src/tests`.
  **Consumir um módulo compartilhado no Lite exige mudar esse `include` — não verificado se compila**;
  portanto o Lite só adota o módulo depois do Full (como já dito) e sob teste de build.
- `QUALITY-GATES.md`: gates `lint → typecheck → test → test:db → build` (+ `secrets:scan`,
  `migrations:validate` antes de PR); `test:db` usa Postgres **descartável**; CI em PostgreSQL 15.
  **Nenhum gate foi executado nesta rodada.**
- `apps/agency/src/pages/PayrollPage.tsx` (lida inteira), achados novos:
  1. A tela gera comissão **só por plano global** (`generateCommission`), e **desabilita** o botão sem plano;
     a geração por produto (`/commissions/generate-by-product`) existe em `lib/api.ts:3200`, mas não localizei
     chamada em `PayrollPage`; uso em outras páginas **não verificado**.
  2. Para uma comissão `APPROVED` exibe “Gerar Conta a Pagar”; para folha `APPROVED` sem payable exibe
     “Gerar conta a pagar”. **As duas ações coexistem para a mesma comissão** — o risco de pagamento duplo
     é alcançável pela UI.
  3. A coluna “Comissões” da folha mostra `commissionsTotal` (snapshot da geração); nenhuma coluna mostra
     liberado/pago/saldo, canal, nem alerta de entrada já reservada pela folha.
  4. Não há teste de UI de `PayrollPage` (busca em `apps/agency/src` por “payroll”/“folha” em testes: sem
     resultado em `App.test.tsx`; testes de API que citam folha: `financial.test.ts`,
     `financial-http.test.ts`, `partners.test.ts` — **não lidos**; cobertura da dupla via não verificada).
  5. `monthLabel` formata em UTC; competência é `YYYY-MM-01` (consistente com o API).
- Lido adicionalmente: `payroll.ts` (`approvePayrollEntry`, `payPayrollEntry`), migration 080 (linhas
  195–232, índices parciais), `routes/commission-rules.ts` do Lite (`assertNotRetroactive`).

Achados novos de leitura (além de R1–R10 da rodada anterior):

| # | Achado | Evidência |
| - | --- | --- |
| R11 | `createEmployeeCommissionRule` fecha a regra aberta anterior com `valid_until = COALESCE(novo valid_from, hoje) − 1 dia`. Se o novo `valid_from` for ≤ ao `valid_from` da anterior, o fechamento viola `employee_commission_rules_validity_check` (`valid_from ≤ valid_until`) → erro de banco (por leitura; **não testado**). É a versão Full do problema do “mesmo dia”. | `employee-commission-rules.ts:189-196`; migration 080 |
| R12 | Full `sales` **não tem vendedor/funcionário** (tem `user_id` criador e `broker_id`); a atribuição à comissão só existe na geração (`employeeId` informado). Não há “vendas do vendedor no mês” no Full. | migration 001 `sales`; `employee-commissions.ts` |
| R13 | Folha gerada/aprovada é um **snapshot**: comissão aprovada depois não entra; comissão cancelada depois continua no `net_amount` e no payable já criado. `generatePayrollEntry` só atualiza enquanto `OPEN`. | `payroll.ts:257-330, 303-309` |

---

## 3. Fase 0 — caracterizar riscos do Full e definir proteções (antes de progressividade/liberação)

Objetivo: congelar o comportamento atual em testes (marcados como risco), depois inverter cada teste
quando a proteção entrar. **Nenhuma política financeira muda sem decisão (§8).** Nada aqui foi executado.

### 3.1 Caracterização (testes primeiro; arquivo novo `services/api/tests/commission-characterization.test.ts`)

| ID | Risco | Asserção do comportamento atual (a documentar) | Tipo |
| --- | --- | --- | --- |
| CH-01 | R3 arredondamento | AIR `sale_value` 18,50 com regra 3% → entrada `amount = 0.55` (Lite daria 0,56). Só caracteriza; **não altera** política. | DB |
| CH-02 | R1 payable duplicável | Duas chamadas concorrentes a `createPayableFromCommissionEntry` sobre a mesma entrada `APPROVED` → hoje possível 2 payables vivos (`it.fails`/asserção de risco). | DB |
| CH-03 | R2 `PAID` | Quitar o payable da comissão via `allocatePayment` deixa `commission_entries.status = 'PAYABLE'`. | DB |
| CH-04 | R8 canal duplo | Entrada `APPROVED` no mês M: criar payable próprio **e** gerar/aprovar/pagar folha de M → duas obrigações sobre o mesmo valor. | DB |
| CH-05 | R7 | Cancelar venda com entrada `PAYABLE`: entrada permanece `PAYABLE` e o payable continua `OPEN` e quitável. | DB |
| CH-06 | R4 | Venda criada às 23:30 (UTC−3) de 10/10 (02:30Z de 11/10) seleciona a regra vigente em **11/10**. | DB |
| CH-07 | R6 | Dois itens AIR da mesma venda, mesmo funcionário: o segundo é rejeitado por duplicidade (venda, funcionário, produto). | DB |
| CH-08 | R11 | Criar regra aberta com `valid_from` = `valid_from` da anterior → falha de CHECK. | DB |
| CH-09 | R13 | Folha `APPROVED`; depois uma comissão do mês é cancelada: `net_amount` e payable permanecem; comissão aprovada depois não entra. | DB |
| CH-10 | R5 | (Leitura apenas) `findApplicableRule` usa outra transação; coberto pelo teste HIER-09 após refatorar. | — |
| CH-11 | UI | `PayrollPage` mostra “Gerar Conta a Pagar” para entrada já somada em folha do mesmo mês. | UI (`apps/agency/src/pages/PayrollPage.test.tsx`, novo) |

### 3.2 Proteções de baixo risco (podem entrar na Fase 0, sem mudar valores)

| ID | Proteção | Efeito | Observação |
| --- | --- | --- | --- |
| PRO-01 | `SELECT … FOR UPDATE` na entrada em `createPayableFromCommissionEntry` e `approveCommissionEntry` | fecha corrida | sem mudança de regra |
| PRO-02 | Índice único parcial `payables (agency_id, commission_entry_id) WHERE commission_entry_id IS NOT NULL AND status <> 'CANCELLED'` | um payable vivo por entrada | migration com `DO $$` que **aborta se existirem duplicatas vivas** (padrão da 099); nada é apagado. Se abortar, o relatório de duplicatas é entregue ao humano. |
| PRO-03 | Sincronizar `PAID` da entrada em `refreshPayableStatus` quando o payable com `commission_entry_id` quita | corrige CH-03 | mudança de *status*, não de valor |
| PRO-04 | Relatório **somente leitura** de conflitos legados (entrada com payable próprio e incluída em folha) | inventário para decisão humana | não corrige nada |

### 3.3 Contrato de liquidação por canal (resposta ao P1 da folha)

**Saldo liquidável por entrada** (todas as quantias em reais, `NUMERIC(14,2)`):

```
reconhecido(e)  = e.amount                      (entrada não cancelada)
liberado(e)     = ON_SALE/legado → reconhecido   |  ON_RECEIPT → liberado por recebimento (COM-03)
comprometido(e) = Σ settlements ATIVAS de e (qualquer canal)
disponível(e)   = liberado(e) − comprometido(e)  (≥ 0)
```

Razão `commission_settlements` (aditiva; ilustrativa):

```sql
CREATE TABLE commission_settlements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  commission_entry_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('PAYABLE','PAYROLL')),
  payable_id TEXT,                 -- canal PAYABLE
  payroll_entry_id TEXT,           -- canal PAYROLL
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','RELEASED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  CHECK ((channel = 'PAYABLE') = (payable_id IS NOT NULL)),
  CHECK ((channel = 'PAYROLL') = (payroll_entry_id IS NOT NULL)),
  FOREIGN KEY (agency_id, commission_entry_id) REFERENCES commission_entries (agency_id, id)
);
-- unicidade por canal (colunas puras, sem cast):
CREATE UNIQUE INDEX commission_settlements_payable_uidx ON commission_settlements (agency_id, commission_entry_id, payable_id) WHERE state = 'ACTIVE' AND payable_id IS NOT NULL;
CREATE UNIQUE INDEX commission_settlements_payroll_uidx ON commission_settlements (agency_id, commission_entry_id, payroll_entry_id) WHERE state = 'ACTIVE' AND payroll_entry_id IS NOT NULL;
-- RLS FORCE + políticas por agency_id = current_agency_id(); sem DELETE; mudança de estado só ACTIVE -> RELEASED.
```

Operações (todas sob `pg_advisory_xact_lock` por **entrada** — chave `commission-settle:{agency}:{entry}` —
tomado antes de qualquer `FOR UPDATE`, ordem única):

| Operação | Regra |
| --- | --- |
| Criar payable da comissão | lê `disponível(e)`; exige `payable.amount = disponível` (ou parte, se a decisão 4 permitir); cria settlement `PAYABLE`; 409 se `disponível = 0`. |
| Gerar folha (enquanto `OPEN`) | libera as settlements `PAYROLL` anteriores dessa folha e **reserva de novo** `disponível` de cada entrada elegível (`APPROVED`, competência); `commissionsTotal = Σ reservado`. Regenerar não duplica. |
| Aprovar folha | revalida: toda settlement ativa continua válida (entrada não cancelada, `liberado ≥ comprometido`); senão 409 listando as entradas. |
| Criar obrigação da folha (`payPayrollEntry`) | idem revalidação; `payable.amount` nunca excede salário + Σ reservado (+ demais componentes). |
| **Alocar pagamento** (`allocatePayment`) em payable de comissão ou de folha | revalida no momento da quitação (leitura sob o lock): entrada cancelada ou `liberado < comprometido` → 409, **nada gravado**. Pagamento parcial de folha: a comissão só é considerada paga quando a folha quita (conservador; `comprometido` permanece). |
| Quitar payable/folha | entrada → `PAID` (PRO-03); settlement permanece `ACTIVE` (histórico). |
| Cancelar entrada / venda | se existe settlement `ACTIVE` em payable/folha não quitado → política da decisão 6; padrão proposto: **409** (nada some). Folha `OPEN` pode ser regenerada e libera a reserva. |

Por que fecha o P1: a mesma comissão não pode estar em dois canais (índice + `disponível`), a folha
deixa de ser snapshot cego (revalidação em aprovar/criar/alocar), parcelas liberadas depois entram em
competências futuras como **novas** settlements (competência = mês da liberação; ver §4.5), e o
legado fora do razão não é tocado — apenas listado (PRO-04). **Não** declaro exclusividade global
resolvida para o legado; declaro-a só para operações novas após a Fase 0.

Interface (`services/api/src/commission-settlement.ts`, novo):

```ts
export interface CommissionLiquidable { reconhecido: number; liberado: number; comprometido: number; disponivel: number }
export function commissionSettleLockKey(agencyId: string, entryId: string): string;
export function loadCommissionLiquidable(client: TenantTransactionClient, agencyId: string, entryId: string): Promise<CommissionLiquidable>;
export function reserveCommission(client, agencyId, entryId, ch: { channel: 'PAYABLE'|'PAYROLL'; payableId?: string; payrollEntryId?: string }, amount: number): Promise<void>;
export function releaseCommissionReservations(client, agencyId, payrollEntryId: string): Promise<void>;
export function assertSettlementsStillValid(client, agencyId, target: { payableId?: string; payrollEntryId?: string }): Promise<void>; // 409
```

Arquivos a tocar na Fase 0: `commissions.ts`, `payroll.ts`, `financial.ts` (`allocatePayment`,
`refreshPayableStatus`), `commission-settlement.ts` (novo), migration(s), `routes/commissions.ts`,
`PayrollPage.tsx` (§4.7) e testes §7.

---

## 4. Contrato revisado dos módulos

### 4.0 Trilhas

- **Trilha P (paridade com o Lite atual):** faixas **marginais**, excedente **por cálculo**, mês civil,
  liberação por recebimento proporcional. Verificada no código Lite.
- **Trilha E (evolução desejada pelo usuário):** total por padrão, excedente selecionável, progressão “total”.
  Enums reservados (`tier_mode`, `excess_basis`) **sem implementação** até decisão 3. Nenhum agente deve
  tratar marginal como regra final única nem “total” como equivalente.

### 4.1 COM-01 — Escopos e versões imutáveis (substitui o desenho anterior)

Modelo (espelha a lineage do Lite, sem perda): `employee_commission_rule_scopes` (identidade) +
`employee_commission_rule_versions` (append-only). A tabela legada `employee_commission_rules` **continua
existindo e funcionando** (compat. e testes atuais); é lida como camada de fallback (§Resolução).

```sql
CREATE TABLE employee_commission_rule_scopes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  employee_id TEXT,                         -- NULL = padrão da agência
  product_type employee_commission_product_type,  -- NULL = não restringe por produto
  category_id TEXT,                         -- NULL = não restringe por categoria (catálogo §4.3)
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  legacy_ref TEXT,                          -- id de origem (pareamento; sem significado de negócio)
  CHECK (product_type IS NULL OR category_id IS NULL)   -- uma dimensão por escopo
);
-- Unicidade: seis índices parciais, só colunas puras (sem COALESCE, sem cast), apenas ACTIVE:
--   (agency_id, employee_id, product_type)  WHERE employee_id IS NOT NULL AND product_type IS NOT NULL AND category_id IS NULL
--   (agency_id, employee_id, category_id)   WHERE employee_id IS NOT NULL AND category_id IS NOT NULL AND product_type IS NULL
--   (agency_id, employee_id)                WHERE employee_id IS NOT NULL AND product_type IS NULL AND category_id IS NULL
--   (agency_id, product_type)               WHERE employee_id IS NULL AND product_type IS NOT NULL AND category_id IS NULL
--   (agency_id, category_id)                WHERE employee_id IS NULL AND category_id IS NOT NULL AND product_type IS NULL
--   (agency_id)                             WHERE employee_id IS NULL AND product_type IS NULL AND category_id IS NULL
-- (todos com AND status = 'ACTIVE'). NULLS NOT DISTINCT não é usado: depende da versão do servidor (CI = PG15; produção não verificada).

CREATE TABLE employee_commission_rule_versions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL, scope_id TEXT NOT NULL,
  version_number INT NOT NULL CHECK (version_number >= 1),
  effective_from DATE NOT NULL,
  revised_at TIMESTAMPTZ NOT NULL DEFAULT now(), revised_by TEXT, reason TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('PERCENTAGE','FIXED','NONE')),
  calculation_basis employee_commission_basis,           -- bases atuais do Full
  calculation_metric TEXT CHECK (calculation_metric IN ('GROSS','MARGIN')),
  value NUMERIC(14,4) CHECK (value IS NULL OR value >= 0),
  apply_on TEXT NOT NULL DEFAULT 'TOTAL' CHECK (apply_on IN ('TOTAL','EXCESS')),
  excess_threshold NUMERIC(14,2),
  progressive BOOLEAN NOT NULL DEFAULT false,
  tier_mode TEXT NOT NULL DEFAULT 'MARGINAL' CHECK (tier_mode IN ('MARGINAL')),   -- 'CUMULATIVE_TOTAL' reservado (trilha E)
  UNIQUE (agency_id, scope_id, version_number), UNIQUE (agency_id, id)
  -- CHECKs espelhando Lite 009/010 (NONE/PERCENTAGE/FIXED, EXCESS ⇔ limiar, progressive ⇒ PERCENTAGE ∧ TOTAL)
);
-- employee_commission_rule_tiers(agency_id, version_id, tier_number, from_amount, to_amount, rate) append-only.
```

**Vigência como projeção (resolve o P1 do mesmo dia).** Nada é “fechado na véspera”. Duas versões com o
mesmo `effective_from` coexistem; a de maior `version_number` vence (igual ao Lite,
`commission-engine.ts:92-93`). Projeção derivada `commission_rule_effective_windows` (view/função, não
coluna): para cada versão, `effective_until = (próximo effective_from distinto) − 1 dia` ou `NULL`; versão
**supersedida no mesmo dia** recebe `is_effective = false` e `effective_until = NULL` com
`superseded_by_version_id` apontando a vencedora — **sem intervalo invertido, sem descarte, sem
reatribuição**. Entradas guardam `rule_version_id` (id imutável da versão que as calculou).

**Resolução** (`resolveCommissionRule(client, …)` no **mesmo** `client` da transação — resolve R5): para
cada nível, nesta ordem — (1) funcionário+produto, (2) funcionário+categoria, (3) funcionário, (4) agência+produto,
(5) agência+categoria, (6) agência. Dentro do nível, a versão efetiva em `D` é a de maior
`effective_from ≤ D` (empate: maior `version_number`); modo `NONE` significa “sem regra explícita” → o
resultado é `PENDING_RULE` (não herda). A tabela legada `employee_commission_rules` atua no nível (1) **somente
quando não existe escopo ativo no mesmo nível**; criar escopo num nível onde há regra legada aberta exige a
“adoção” explícita (a legada é encerrada com `valid_until = effective_from − 1` **se** isso não inverter a
janela; senão 409 — mesmo critério do R11). Produto antes de categoria é regra técnica de desempate,
coberta por teste (HIER-02); regras migradas do Lite usam só categoria.

Sem retroatividade nesta fase: `effective_from` ≥ hoje (data da agência) — igual ao Lite
(`assertNotRetroactive`); revisão não reabre entradas existentes. Auditoria obrigatória (criar/revisar).

### 4.2 COM-02 — Atribuição, acumulador e cálculo

**Unidade de acumulação = venda atribuída.** Tabela `sale_commission_attributions` (ilustrativa):

```sql
CREATE TABLE sale_commission_attributions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL, sale_id TEXT NOT NULL, employee_id TEXT NOT NULL,
  category_id TEXT,                        -- catálogo §4.3
  recognition_date DATE NOT NULL,          -- fuso da agência; gravada, nunca recalculada
  gross_amount NUMERIC(14,2) NOT NULL,     -- snapshot de sales.total na atribuição
  margin_amount NUMERIC(14,2),             -- snapshot de getSaleMargin na atribuição (NULL = indisponível)
  seq BIGINT GENERATED ALWAYS AS IDENTITY, -- ordem de atribuição (≙ ordem de confirmação no Lite)
  state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','CANCELLED')),
  UNIQUE (agency_id, sale_id, employee_id)
);
```

Contrato canônico:

| Item | Definição |
| --- | --- |
| Evento elegível | atribuição `ACTIVE` de venda com `SaleStatus ∈ {CONFIRMED, PAID}`; venda `CANCELLED/REFUNDED/PENDING` não conta. Independe de existir `commission_entries`. |
| Vendedor | `employee_id` da atribuição (decisão 1: quem atribui). |
| Período | mês civil de `recognition_date`. |
| Categoria | `category_id` da atribuição; regra com categoria soma só atribuições dessa categoria; sem categoria soma todas. |
| Métrica | a da **versão da regra em uso** (`GROSS`→`gross_amount`, `MARGIN`→`margin_amount`); trocar GROSS→MARGIN **recalcula o acumulado de tudo no novo critério** (igual ao Lite, que lê `version.calculation_base`); nunca mistura métricas. |
| Ordem | `accumulated_before = Σ` das atribuições elegíveis do mês/escopo com `seq` **menor** que a da venda em cálculo. Geração atrasada não muda a ordem. |
| Deduplicação | (venda, funcionário) único; uma venda com vários produtos conta **uma vez**. |
| Unidades | progressiva e excedente nesta versão só para regras de **unidade-venda** (`calculation_basis = PACKAGE_TOTAL`, entrada com `product_type = PACKAGE`). Bases por item/passageiro/bilhete: **inalteradas e fora da progressão** (preserva Full). |
| Entradas legadas | ignoradas pelo acumulador (não têm atribuição); migradas do Lite recebem atribuição pareada. |

Cálculo: módulo puro compartilhado (§ da rodada anterior, 5.0) inalterado em substância; entradas gravam
`calculation_snapshot`, `calc_version` (proposto; não reservado), `recognition_date`, `rule_version_id`,
`accumulated_before`, fatias. Concorrência: lock consultivo `commission-accrual:{agency}:{employee}:{YYYY-MM}`
antes das leituras, igual ao Lite. Arredondamento: **Fase 0 não altera** (CH-01 só caracteriza); adotar
`roundMoney` do Lite é a decisão 5, aplicável apenas a cálculos **novos**.

### 4.3 Categorias e pendências sem perda

- **Categorias:** catálogo Full `commission_categories (agency_id, id, name, active, sort_order, legacy_ref)`;
  usado por escopos de regra e por atribuições. Sem esse catálogo, a migração de qualquer cliente Lite com
  categorias **é impedida** (status “IMPEDIDA — sem destino para categorias”).
- **Pendências (`PENDING_RULE`):** novo status de `commission_entries` (a coluna é `TEXT` + CHECK, não enum:
  `ALTER … DROP/ADD CONSTRAINT` em migration nova). Linha pendente: `amount = 0`, sem `rule_version_id`, snapshot
  `{rule_type:'UNDEFINED'}`; CHECK de linhagem ampliado com terceira alternativa (“pendente”). Folha, DRE
  e liberação **só** leem `APPROVED/PAYABLE/PAID` → pendência não vaza para valores. Resolução = override
  manual (permissão + auditoria), exatamente o fluxo Lite (§12.4 da spec). A rota manual atual continua
  retornando erro quando não há regra (compat.); pendência é criada por geração automática/importação.
- Se o produto decidir não adotar categorias/pendências no Full, o relatório de migração lista cada cliente
  como **IMPEDIDO**; nunca “concluído”.

### 4.4 Excedente e progressão — paridade vs evolução

Trilha P (implementável): `EXCESS` por cálculo (`max(base−limiar,0)×taxa`); progressão marginal.
Trilha E (bloqueada): `excess_basis ∈ {PER_CALCULATION (P), MONTH_ACCUMULATED}` e `tier_mode ∈ {MARGINAL (P),
CUMULATIVE_TOTAL}`; “total” exige ajustes append-only (Fase 5 da spec), **não** especificados. Os enums existem
no esquema para evitar migração destrutiva, mas só os valores P são aceitos pela API.

### 4.5 COM-03 — Liberação por recebimento (parametrizada)

Função única `resolveReleasePolicy(sale, agency): 'ON_SALE' | 'ON_RECEIPT'`. A **fonte** do dado
(forma de pagamento da venda vs perfil financeiro global) é a decisão 2; **a instrução humana sobre o perfil
global segue válida** e relato de outro agente não a revoga. Enquanto a decisão não existir,
`resolveReleasePolicy` retorna `ON_SALE` (comportamento atual) e COM-03 não é implementada. O liberado,
o limite de pagamento e o estorno usam o contrato de §3.3 (`liberado(e)`); parcelas liberadas depois geram
**novas** settlements (competência = mês da liberação), sem tocar nas anteriores.

### 4.6 Estorno (item próprio PAR-EST)

Full não tem estorno de recebimento/pagamento nos arquivos examinados; Lite tem (`reversePayment`, uma vez, espelho
no razão, guarda de cobertura). Registrado como **candidato adicional de paridade** a priorizar (decisão 7).
Até existir: nenhuma funcionalidade de COM-03 depende dele para ser segura, porque o liberado só cresce
sem estorno; **com** estorno, a guarda `assertSettlementsStillValid` é obrigatória no mesmo PR.

### 4.7 UI (`PayrollPage.tsx` e correlatas)

- Lista de comissões: colunas **Liberado / Comprometido / Pago / Saldo** e **canal** (“Conta a pagar” ou
  “Folha de MM/AAAA”).
- Ocultar “Gerar Conta a Pagar” quando a entrada está reservada pela folha; na folha, mostrar o detalhamento
  de comissões reservadas e bloquear “Aprovar/Gerar conta” com mensagem do 409 de revalidação.
- Traduzir os novos 409 (`errorTranslation.ts`). Teste `PayrollPage.test.tsx` (novo) cobre CH-11 e a inversão.

---

## 5. Matriz sem perda Lite → Full

Sem cópia de dados. “Destino” é conceitual; o executor da migração é outro projeto.

| Lite | Destino Full proposto | Perda? | Condição / bloqueio |
| --- | --- | --- | --- |
| `tenants.id` | `agencies.id` (registro de pareamento) | não | pareamento explícito; nunca por nome |
| `sellers` | `employees` (+`users`) | não, se pareados | vendedor sem funcionário → **IMPEDIDO** até criar/parear |
| `sale_categories` | `commission_categories` (+`legacy_ref`) | **não** | exige adotar o catálogo (decisão 1); senão IMPEDIDO |
| `commission_rules` (escopo) | `employee_commission_rule_scopes` | não | `seller_id`/`category_id` nulos → padrão/sem categoria |
| `commission_rule_versions` | `employee_commission_rule_versions` **1:1** | não | mesmo `version_number` e `effective_from`; duas versões do mesmo dia preservadas; `revised_at/by/reason` verbatim |
| `commission_rule_tiers` | `employee_commission_rule_tiers` | não | verbatim (taxas em pontos percentuais) |
| modo `NONE` | versão `mode='NONE'` | não | — |
| `calculation_base GROSS/MARGIN` | `PACKAGE_TOTAL` + `calculation_metric` | não | — |
| `FIXED` | `FIXED_PER_SALE` | não | — |
| vendas confirmadas (acumulador) | `sale_commission_attributions` | não | uma atribuição por (venda, vendedor), com `seq` na ordem de confirmação de origem, `gross/margin` **do snapshot de origem** |
| `seller_commissions` calculada | `commission_entries` (`product_type='PACKAGE'`) | não | `commission_amount`, `rule_snapshot` e `calc_version` de origem **verbatim**; **nunca recalcular**; `rule_version_id` pareado à versão de origem |
| `seller_commissions` `PENDING_RULE` | `commission_entries` `PENDING_RULE` | **não** | exige o status novo (§4.3); senão IMPEDIDO |
| `PENDING/APPROVED/PAID/CANCELLED` | idem | não | — |
| `release_mode` | `release_mode` | não | depende da decisão 2 |
| `payables.commission_id` | `payables.commission_entry_id` + settlement `PAYABLE` | não | histórico pago preservado |
| margem da venda gravada | snapshot da atribuição | não | não usar `getSaleMargin` retroativo |
| payments/allocations/receivables de comissão | pareamento financeiro (runbook) | não | fora desta rodada |

Evidências mínimas do runbook: totais por vendedor/mês e por status; contagem de versões **por data**
(inclusive mesmas datas); pendências; liberado × pago × comprometido por entrada; amostra de snapshots
idênticos. Nunca concluir por contagem de linhas; nunca apagar a origem.

---

## 6. Casos numéricos ↔ teste exato (**nenhum executado**)

Convenções: “PURO” = sem banco (`packages/domain/tests/commission-calculation.test.ts`, novo);
“DB” = exige Postgres descartável autorizado (não executado, conforme QUALITY-GATES). Valores
recalculados com a mesma fórmula do Lite em `node` (sem tocar no repositório).

| Caso | Entrada → esperado | Teste exato | Tipo |
| --- | --- | --- | --- |
| N1 fixo | 150,00 → 150,00 | `commission-calculation.test.ts` › `CALC-01 fixed` | PURO |
| N2a % bruto | 10.000 @5% → 500,00 | `CALC-02 percent gross` | PURO |
| N2b % margem | margem 2.000 @10% → 200,00 | `CALC-03 percent margin` | PURO |
| N3a excedente | 12.000, limiar 10.000 @5% → 100,00 | `CALC-04 excess above threshold` | PURO |
| N3b abaixo | 9.000 → 0,00 (não pendente) | `CALC-05 excess below threshold is zero` | PURO |
| N4 | acum 10.000, 20.000 → 600,00 | `CALC-06 progressive inside tier` | PURO |
| N5 | acum 45.000, 20.000 → 750,00 (150+600) | `CALC-07 progressive crosses one tier` | PURO |
| N6 | acum 45.000, 70.000 → 2.900,00 (150+2.000+750) | `CALC-08 progressive crosses two tiers` | PURO |
| N8 | 2 fatias de 0,15 @3% → 0,00 (soma das fatias arredondadas) | `CALC-09 sum of rounded slices` | PURO |
| N7 | 18,50 @3% → Lite 0,56; **Full atual 0,55** | `CALC-10 roundMoney half away` (PURO) + `commission-characterization.test.ts` › `CH-01` (DB) | PURO+DB |
| N9 | virada de mês → acumulado 0 | `commission-accrual.test.ts` › `ACC-06 month boundary` | DB |
| N23 | 3 bilhetes × 40,00 → 120,00 | `CALC-12 fixed per unit` | PURO |
| N21/N22 | AIR 4.000 @5% = 200; 2.000+2.000+1.800 @5% = 290 | `employee-commission-rules.test.ts` (existente, linhas 265 e 238) | DB (regressão) |
| Revisão mesmo dia | v1 e v2 em 2026-11-01; comissões apontando a ambas | `commission-rule-versions.test.ts` › `HIER-03 same-day revisions keep both identities`; `HIER-04 effective window projection` | DB |
| Herança | funcionário sem AIR → vence “funcionário”; depois “agência+produto”… | `HIER-01 precedence six levels`, `HIER-02 product before category` | DB |
| `NONE`/pendência | versão `NONE` → entrada `PENDING_RULE`, amount 0, fora de folha/DRE | `HIER-05 none yields pending`, `commission-pending.test.ts` › `PEND-01 excluded from payroll and DRE` | DB |
| Vigência | A até 09/10, B desde 10/10; venda 10/10 → B | `HIER-06 effective_from boundary` | DB |
| Acum.: venda sem comissão | venda atribuída e confirmada sem entrada → conta | `ACC-01 sale without entry counts` | DB |
| Acum.: multi-produto | 2 produtos na mesma venda → conta 1 vez | `ACC-02 multi-product sale counted once` | DB |
| Acum.: geração atrasada | atribuições A(seq1), B(seq2); entrada de A gerada depois → acumulado de A = 0 | `ACC-03 delayed generation keeps attribution order` | DB |
| Acum.: troca de métrica | GROSS→MARGIN no mês → acumulado recalculado só na nova métrica | `ACC-04 metric switch` | DB |
| Acum.: categoria | regra com categoria soma só ela | `ACC-05 category scoped` | DB |
| Acum.: cancelada | venda cancelada sai do acumulado; entradas posteriores não mudam | `ACC-07 cancelled sale excluded, no retro recalculation` | DB |
| Acum.: concorrência | 2 atribuições simultâneas → acumulados distintos coerentes | `ACC-08 concurrent confirmations` | DB |
| Folha: canal único | entrada reservada pela folha → payable avulso 409; e vice-versa | `commission-settlement.test.ts` › `SET-01 exclusive channel` | DB |
| Folha: regenerar | regenerar folha `OPEN` libera/reserva sem duplicar | `SET-02 regenerate releases reservation` | DB |
| Folha: revalidação | comissão cancelada entre gerar e pagar → alocação 409, nada gravado | `SET-03 allocation revalidates` | DB |
| Folha: parcial | pagamento parcial da folha não marca comissão `PAID` | `SET-04 partial payroll payment` | DB |
| Folha: legado | relatório lista conflitos sem alterá-los | `SET-05 legacy conflict report is read-only` | DB |
| Corrida payable | 2 `create-payable` simultâneos → 1 payable | `PRO-01/02` em `commission-payable-uniqueness.test.ts` | DB |
| `PAID` | quitar payable → entrada `PAID` | `PRO-03 entry becomes PAID` | DB |
| DDL | seis índices parciais aceitos e únicos por escopo; sem cast | `commission-ddl.test.ts` › `DDL-01..06` | DB (**banco descartável autorizado**) |
| Liberação N10–N20 (do relatório anterior) | liberado 225,00 etc. | `commission-release.test.ts` › `REL-01..11` | DB — **bloqueado pela decisão 2** |
| UI | botão duplicado oculto; colunas liberado/pago | `PayrollPage.test.tsx` › `UI-01`, `UI-02` | UI |

**Não executado nesta rodada:** todos os testes acima (nenhum existe ainda, exceto os citados como
existentes, que também não foram rodados); `lint`, `typecheck`, `test`, `test:db`, `build`; qualquer SQL/DDL;
qualquer consulta a banco (local ou remoto); schemas aplicados e dados remotos **não verificados**.

---

## 7. Plano e ordem

| Fase | Entrega | Gate de saída |
| --- | --- | --- |
| 0a | Caracterização CH-01..11 (testes vermelhos/“risco documentado”) | contrato aprovado; banco descartável autorizado |
| 0b | PRO-01..04 + `commission-settlement.ts` + `PayrollPage` | CH invertidos passando; relatório PRO-04 entregue ao humano; `test:db` limpo |
| 1 | Módulo puro de cálculo + CALC-01..12 | regressão dos testes existentes de comissão |
| 2 | COM-01: escopos/versões/projeção/resolução (HIER, DDL) | prova de DDL em PG15 descartável |
| 3 | Categorias + atribuições + acumulador (ACC) + COM-02 (trilha P) | decisão 1 e 5 |
| 4 | Pendências (PEND) | — |
| 5 | COM-03 (REL) | decisões 2 e 4; PAR-EST (decisão 7) |
| 6 | Recorte Lite consome o módulo | Full validado; `include` do `tsconfig` do Lite verificado |

Cada fase: teste falhando antes quando há mudança de comportamento; `lint`, `typecheck`, `test`,
`test:db`, `build`; Full antes do Lite; revisão Codex; ADR obrigatória antes da Fase 2 (modelo de escopos/versões,
atribuição, razão de liquidações, módulo compartilhado).

---

## 8. Decisões humanas indispensáveis (7)

Decisões **técnicas** assumidas nesta proposta (sujeitas à revisão do Codex, **não** devolvidas ao usuário):
escopos+versões imutáveis, projeção de vigência, seis índices parciais, produto antes de categoria, sem
`btree_gist`/`NULLS NOT DISTINCT`, sequência de atribuição como ordem, `calc_version` e numeração de migrations
como propostas, permissões via RBAC atual, auditoria obrigatória, sem retroatividade, Lite adota o módulo só depois.

| # | Escolha comercial/financeira | Por que não é técnica | Recomendação (não decisão) |
| - | --- | --- | --- |
| 1 | **Quem é o vendedor de uma venda no Full e as categorias de venda para comissão passam a existir no Full?** (hoje a venda não tem vendedor nem categoria) | Define como a meta mensal é medida e se clientes Lite com categorias podem migrar | Atribuição explícita funcionário↔venda + catálogo de categorias; sem isso, migração com categorias/pendências fica IMPEDIDA |
| 2 | **Onde vive “exige recebimento”**: forma de pagamento da venda ou perfil financeiro global (a instrução humana do perfil global segue vigente)? | Muda quando a comissão é paga; contradição documental não verificada | Confirmar a instrução vigente antes de COM-03 |
| 3 | **Regra final para novas regras**: progressão marginal (paridade) ou “total”; excedente por venda ou sobre o acumulado do mês | É política de remuneração; “total” altera valores e exige ajustes | Entregar trilha P agora; decidir E separadamente |
| 4 | **Canal de pagamento da comissão** (conta a pagar avulsa × folha) e tratamento dos **conflitos legados** já existentes + pagamento parcial de folha | Dinheiro real já pago/prometido em dois canais | Canal único por comissão; legado só reportado; parcial da folha não quita comissão |
| 5 | **Arredondamento**: manter o atual do Full ou adotar o do Lite para cálculos **novos** (18,50×3%: 0,55 × 0,56) | Altera centavos pagos a pessoas | Manter até decidir; nunca reprocessar histórico |
| 6 | **Venda cancelada com comissão em conta a pagar, na folha ou paga**: bloquear, ajustar ou perder | Define quem arca com o dinheiro | Bloquear (409) e tratar por ajuste futuro |
| 7 | **Priorizar estorno de recebimento/pagamento no Full** (paridade com o Lite; hoje inexistente nos arquivos lidos) | Capacidade nova e financeira | Item próprio (PAR-EST), antes de COM-03 em produção |

---

## 9. Limites e estado final

- **HOLD**: sem código, schema, migration executada, banco (local/remoto), deploy, `.env`, instalação,
  commit/push, prisma ou dados da Gadotti. Escrito apenas este arquivo; o relatório anterior e a revisão
  do Codex não foram editados.
- Não verificado: schema realmente aplicado, versão do PostgreSQL em produção, existência de estorno fora
  dos arquivos lidos, uso de `generate-by-product` por páginas, cobertura de folha em `financial*.test.ts`,
  compilação do Lite consumindo `packages/domain`, R11 (por leitura), todos os testes propostos.
- Antes da Fase 0b: provar DDL (PRO-02 e §4.1) em PostgreSQL 15 descartável, **com autorização**.
- Este documento é contrato proposto, não implementação concluída, não migração e não aprovação.
