# Relatório Onda D — Receita da agência (Frente 6) e vínculo com a comissão do funcionário (Frente 7) — 2026-10-24

Contrato: ADR-007 (aceito), seções 8 e 9 da especificação Gadotti, ADR-006 / `docs/05-api/sale-payment-schedules.md` (Onda C). **Full primeiro**, validado, depois Lite (DEC-007). Sem commit, push ou deploy. Migrations só como arquivos novos (Full 106, Lite 015), aplicadas apenas em bancos descartáveis. Demo (4010/55436), 55438, Supabase, Render, Vercel e Gadotti não foram tocados.

## 1. Escopo entregue

Separação das grandezas, sem dupla contagem: **valor vendido** (`sales`), **componentes** (`sale_items`), **receita da agência** (tabelas novas), **repasse ao fornecedor** (payables, intocado) e **comissão do funcionário** (intocada). Direito, disponibilidade e liquidação são estados distintos (`ENTITLED` → `AVAILABLE` → `RECEIVED`).

- **Módulo puro de cálculo** (`agency-revenue-calc.ts`, idêntico no Full e no Lite — um teste falha se divergirem): half-up decimal-safe **por item**, bases `LINE_TOTAL/NET_FARE/TAXES/FEES/TAXES_AND_FEES/MARGIN`, modos `PERCENTAGE/FIXED_PER_PASSENGER/FIXED_PER_SALE/FIXED_PER_ITEM/NONE`, `PENDING_RULE` para item sem regra, snapshot completo (memória de cálculo + `calc_version`).
- **Regras versionadas e append-only** por escopo (produto+fornecedor > produto > fornecedor+categoria > fornecedor > categoria > padrão da agência), não retroativas (`effective_from ≥ hoje`), no mesmo dia vence a versão maior.
- **Entradas** por item de venda com ciclo `FORECAST → ENTITLED → (AVAILABLE) → RECEIVED`/`CANCELLED`. Direito sincronizado na confirmação da venda e a cada baixa do cliente (idempotente, reversível enquanto não houver liquidação); `RECEIVED` só por ação explícita de administrador, com diferença `esperado − recebido` visível.
- **D1** `AGENCY_COLLECTS` por padrão; `SUPPLIER_COLLECTS` por regra (só com direito na confirmação). **D3** sem netting: o vínculo com a comissão é só análise (coluna opcional `commission_entries.agency_revenue_entry_id` / `seller_commissions.agency_revenue_entry_id`; tela e endpoint mostram receita e comissão lado a lado, sem abater). **D4** half-up por item. **D6** cancelar venda com receita já recebida do fornecedor → **409**; sem recebimento, a receita é cancelada junto.
- Auditoria obrigatória (`AGENCY_REVENUE_RULE_CREATED/REVISED/CALCULATED/ENTITLED/RECEIVED/CANCELLED`); falha de auditoria desfaz a operação.
- **Fora desta onda (Onda E):** lotes/janelas (D7) e `AVAILABLE` (o estado existe, nada o produz ainda).

## 2. Arquivos

**Full — novos:** `infrastructure/migrations/106_agency_revenue.sql`; `services/api/src/{agency-revenue-calc,agency-revenue}.ts`, `routes/agency-revenue.ts`; `apps/agency/src/pages/AgencyRevenuePage.tsx` (+ teste); testes `services/api/tests/agency-revenue-calc.test.ts`, `tests/integration/database/agency-revenue.integration.test.ts`.
**Full — editados (linhas pontuais, arquivos com alterações de outras frentes):** `services/api/src/{app,audit-log}.ts`; `sales.ts` (`cancelSale` chama `cancelRevenueForSale`; `confirmSale` chama `syncRevenueEntitlement`); `sale-payment-schedules.ts` (após a baixa); `apps/agency/src/{App.tsx,components/layout/Sidebar.tsx}` (rota/menu "Receita da agência"); `tests/integration/database/{002_prepare_local_roles.sql,database.integration.test.ts}` (tabelas/grants novos); `services/api/tests/sale-payment-schedules.test.ts` (reaplica o script de papéis depois das migrations, para os grants de tabelas criadas após a 105).
**Lite — novos:** `infrastructure/migrations-travel-lite/015_agency_revenue.sql`; `services/api-lite/src/{agency-revenue-calc,agency-revenue}.ts`, `routes/agency-revenue.ts`; `apps/travel-lite/src/pages/AgencyRevenuePage.tsx` (+ teste); `services/api-lite/tests/agency-revenue.test.ts`.
**Lite — editados:** `access.ts` (permissões `revenue.rules_manage/read_all/receive`), `audit-log.ts`, `app.ts`, `routes/sales.ts` (confirmar/cancelar), `sale-payment-schedules.ts`, `apps/travel-lite/src/{menu.ts,App.tsx}`.

## 3. Testes: quais falhavam antes

Escritos antes da implementação (falhavam por módulo/rota/tabela inexistente): `agency-revenue-calc.test.ts` (17), `agency-revenue.integration.test.ts` (13), `services/api-lite/tests/agency-revenue.test.ts`, testes de UI.
Casos numéricos do ADR cobertos nos dois produtos: R1 (7% de 1.000 = 70,00, **vinculado à quitação**: fica `FORECAST` até `settled_at`), R2 (fixo por passageiro 25 × 4 = 100; × 3 = 75), R3 (cruzeiro 10% só sobre `TAXES` = 120), R4 (aéreo A 5%, B 12%, C 30% = 505,00 com 3 snapshots de regra distintos), R5 (333,33 @7% = 23,33), R6 (18,50 @3% = 0,56 half-up), R7 (`PENDING_RULE` = 0,00 fora dos totais). Também: precedência de escopo, vigência/versões no mesmo dia, bases, MARGIN só com `AGENCY_COLLECTS`, `FIXED_PER_SALE` uma vez por regra, arredondamento por item, recálculo que não toca entradas já constituídas, receber só de `ENTITLED`, D6, supplier-collects, auditoria por transição, isolamento por agência/tenant e RLS, regras append-only (sem UPDATE/DELETE para o papel de runtime).

Regressões que **eu causei e corrigi**: os ganchos de confirmar/cancelar/baixa consultam as tabelas novas; fixtures com listas de migrations antigas quebrariam. Decisão: os ganchos são **no-op se a tabela `agency_revenue_entries` não existe** (sem a migration não pode haver receita a proteger) — isso evita editar fixtures de outras frentes. `sale-payment-schedules.test.ts` ganhou a reaplicação do script de papéis no fim.

## 4. Gates

| Gate | Resultado |
|---|---|
| `services/api` typecheck / build | OK |
| `services/api` lint dos arquivos novos | OK |
| `services/api` testes focados (cálculo; sales, sale-routes, sale-item-routes, sale-payment-schedules, sale-categories-http, comissões) | passando (17 + 199) |
| `test:db` (5 arquivos, contêiner próprio 55629) | **81 de 82 passando.** A falha única, `database.integration.test.ts › creates exactly the current migrated domain tables`, **não é da Onda D**: a migration 105 (Onda C) cria 6 tabelas (`payment_conditions` e relacionadas, `sale_payment_*`) que não estão nas listas esperadas desse teste nem no script de papéis. Tentei listá-las: a lista passa, mas o teste de contagem de grants então falha (525 vs 549), porque falta o grant no script — decisão que cabe à Onda C; **revertido**, não alterado por mim. As 3 tabelas da Onda D estão corretamente nas listas e nos grants (somente SELECT/INSERT nas regras; SELECT/INSERT/UPDATE nas entradas) |
| `apps/agency` lint / typecheck / suíte completa / build | OK (36 arquivos) |
| `services/api-lite` lint / typecheck / suíte completa (55600) / build | OK, 39 arquivos, 411 testes |
| `apps/travel-lite` lint / typecheck / suíte completa / build | OK, 21 arquivos, 189 testes |
| Suíte completa do Full API | **não rodada de forma isolada** (regra da coordenação) |

## 5. Revisão do Codex

**Não realizada.** O Codex respondeu com limite de uso (volta às 15:29; no momento da tentativa eram 11:42). Fiz uma autorrevisão dirigida e corrigi o que encontrei: (a) no Lite, a comparação receita × comissão expunha o total de comissões a quem tem `revenue.read_all` mas não `commissions.read_all` → agora é `null` sem essa permissão (com teste, usando um login SELLER); (b) `loadEntries`/`listRuleVersions` tipados (sem `any`). **Recomendo rodar a revisão do Codex quando o limite voltar**, com foco em: dupla contagem, D3/D4/D6, RLS/grants, ganchos de venda e paridade Full × Lite.

## 6. Decisões adotadas por padrão

- Permissões: no Full, regras/recebimento/cancelamento = ADMIN+, cálculo/leitura = MANAGER+ (o Full usa papéis, não `revenue.*`); no Lite, `revenue.rules_manage` (ADMIN), `revenue.read_all` (ADMIN, MANAGER), `revenue.receive` (ADMIN) via migration 015.
- Q1 (`SUPPLIER_COLLECTS`): direito na confirmação da venda — qualquer outro evento é recusado.
- Q4 (`MARGIN`): `MARGIN` = `line_margin` do item, só com `AGENCY_COLLECTS`; **não existe no Lite** (itens do Lite não guardam custo) e é recusada lá — Lite ⊆ Full.
- Q5: módulo puro **duplicado** (opção b), com teste de igualdade byte a byte e de resultados; o Lite não importa `packages/domain`.
- Q6: `ON_BALANCE_DEADLINE` exige a quitação (saldo atrasado sozinho não constitui direito).
- Q2: recebimento do fornecedor registrado na própria entrada (valor, data, referência), sem lançar em `payments` nesta onda.
- Passageiros: Full usa `travelers` do item (se houver) senão `sales.passenger_count`, senão 1; Lite usa `sales.passenger_count`, senão 1.
- Regra nova não retroativa; recálculo só atualiza entradas `FORECAST`/`PENDING_RULE`.
- `reason` de regra: 1–300 caracteres (banco); `reasonCode` da auditoria do Full limitado pelo sanitizador.

## 7. O que não foi verificado / pendências

- **Revisão do Codex** (acima).
- Suíte completa do Full API; falha pré-existente do `test:db` da migration 105.
- Nenhuma tela foi aberta em navegador; UI só em jsdom. A UI é mínima: consulta/cálculo por ID de venda e lista de regras; **o cadastro de regras é só por API** (sem formulário) e o recebimento/cancelamento de entradas também.
- Lotes/janelas, política de liquidação, relatórios de projeção (Ondas E/F) não implementados.
- `TravelProduct.commissionPercent` (campo órfão, Q3) não foi migrado nem removido.
- `confirmSale` do Full sincroniza o direito em transação separada, depois da confirmação: se essa segunda transação falhar, a venda fica confirmada e o direito só é constituído no próximo cálculo/baixa.
- Importações e migração Lite→Full não geram entradas de receita; nenhum conversor de regras do Lite para o Full.
- `getSaleRevenue` no Full mostra o total de comissões de funcionário a qualquer MANAGER+ (mesmo piso das rotas de comissão, mas sem `assertNotRestricted`).
- Migrations 106/015 aplicadas só em bancos descartáveis; nada em ambiente online.
