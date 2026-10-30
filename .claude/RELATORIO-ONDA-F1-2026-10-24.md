# Relatório Onda F1 — Frente 9 (relatórios e projeções) e DASH-01 (dashboard configurável) — 2026-10-24

Contratos: seção 11 da especificação Gadotti e Parte 3 do desenho SEC-01/BAK-01/DASH-01. **Full primeiro**, validado, depois Lite (DEC-007). Sem commit, push ou deploy. Migration nova: **109** (Full, `dashboard_layouts`); nenhuma no Lite. Demo (4010/55436), 55438, Supabase, Render, Vercel e Gadotti intocados.

## 1. Entregue

**Módulo puro de projeções** (`report-projections.ts`, idêntico no Full e no Lite; teste de igualdade byte a byte), em centavos:
- `projectReceivables`: saldo em aberto = valor − alocações (baixa parcial), por mês de vencimento, **atrasados separados**; vencimento = hoje não é atraso; pagos/cancelados ignorados.
- `projectRevenue`: **CONTRATADO** (ENTITLED/AVAILABLE), **PROJETADO** (FORECAST com data estimável = último vencimento do cliente nos eventos baseados em quitação), **INDEFINIDO** (FORECAST sem data); nunca soma PENDING_RULE/CANCELLED/RECEIVED.
- `supplierBalances`: esperado × recebido × diferença por fornecedor.
- `projectCommissions`: previsto × liberado × pago, independente da receita da agência.
Receitas, recebíveis, saldos e comissões **nunca são somados entre si** (UI sem "total geral").

**Full — endpoints** (`GET /reports/receivables-projection`, `/revenue-forecast`, `/supplier-balances`, `/commissions-projection`): filtros `saleFrom/saleTo/travelFrom/travelTo/origin/destination/categoryId/status` em todos e `supplierId/productId` só onde são honrados (nos demais → 400, nunca ignorados); LIKE literal (`%`/`_` escapados); parâmetros nomeados validados; limite de 5.000 linhas (1.000 em comissões) com erro, sem truncar; CSV pelo `report-csv.ts` existente (proteção de fórmula e tetos). Aplicam as **mesmas restrições da fonte**: recebíveis pela ponte `requireRoleOrAreaGrant` (REVOKE/restrição bloqueiam), comissões por `assertNotRestricted('employees','view')`.
**Full — DASH-01**: catálogo de 6 widgets em código (cada um reaproveita a função/relatório existente e declara `canView` com a mesma guarda da fonte), tabela `dashboard_layouts` (migration 109: RLS forçada, só `key/enabled`/ordem, versão), `GET /dashboard/widgets` (omite por completo o que o espectador não pode ver; widget que falha por limite não derruba os outros), `GET|PUT /settings/dashboard` (ADMIN; lista completa uma vez; campos extras/`filter`/`permission`/`agencyId` → 400; versão obsoleta ou corrida no primeiro save → 409; auditoria `DASHBOARD_CONFIGURED`).
**Full — UI**: `ProjectionsPage` (/financial/projections: 6 filtros, 4 relatórios separados, CSV por relatório, respostas antigas descartadas) e `DashboardSettingsPage` (/settings/dashboard: ordem, liga/desliga, conflito de versão visível).
**Lite**: `GET /reports/receivables-projection` (`reports.finance`), `/revenue-forecast` e `/supplier-balances` (`revenue.read_all`), mesmos filtros e regras, CSV; `ProjectionsPage` (/projecoes) com permissões, filtros, CSV e descarte de resposta antiga; menu "Projeções".

## 2. Arquivos
**Full novos:** `infrastructure/migrations/109_dashboard_layouts.sql`; `services/api/src/{report-projections,report-projections-service,dashboard-widgets}.ts`, `routes/{report-projections,dashboard-widgets}.ts`; `apps/agency/src/pages/{ProjectionsPage,DashboardSettingsPage}.tsx`; testes `services/api/tests/report-projections.test.ts`, `tests/integration/database/{report-projections,dashboard-widgets}.integration.test.ts`, `apps/agency/src/pages/ProjectionsAndDashboard.test.tsx`.
**Full editados (pontuais):** `app.ts`, `audit-log.ts` (`DASHBOARD_CONFIGURED`), `apps/agency/src/{App.tsx,components/layout/Sidebar.tsx}`, `tests/integration/database/{002_prepare_local_roles.sql,database.integration.test.ts}` (tabela/grants novos).
**Lite novos:** `services/api-lite/src/{report-projections,report-projections-service}.ts`, `routes/report-projections.ts`, `tests/report-projections.test.ts`; `apps/travel-lite/src/pages/ProjectionsPage.tsx` + teste. **Lite editados:** `app.ts`, `apps/travel-lite/src/{menu.ts,App.tsx}`, `App.test.tsx` (menu).

## 3. Testes (escritos antes) — casos numéricos
- Projeção por vencimento + saldo após baixa parcial: 500 com 200 pagos vencido (−5 dias) e 500 a vencer → atrasado 300, a vencer 500; com filtro `destination=gramado` o total cai de 1.600 para 800.
- Receita: venda confirmada com regra 10% → CONTRATADO 100,00; venda pendente → INDEFINIDO 40,00; item sem regra → PENDING_RULE fora de tudo (total 140,00); recebimento de 90 → saldo do fornecedor esperado 100 / recebido 90 / diferença 10; FORECAST baseado em quitação é projetado no último vencimento do cliente.
- Comissão prevista × liberada × paga (unitário: 1.000/300/100 etc.). Banco: zeros sem dados.
- Segurança: 401/403, filtros inválidos 400, `agencyId` na query 400, LIKE `%` literal, isolamento por agência/tenant e RLS, REVOKE/restrição bloqueando projeções e widgets, widget oculto sem vazar chave/título/dado, o agente só enxerga o painel comercial mesmo com tudo habilitado, corrida de dois primeiros saves = 200 + 409.

## 4. Gates
| Gate | Resultado |
|---|---|
| `test:db` completo (7 arquivos, contêiner próprio 55634, derrubado) | **100/100 ✔** |
| `services/api` typecheck / build / testes novos | OK / OK / 26 ✔ (cálculo + projeções) |
| `apps/agency` lint / typecheck / suíte completa / build | OK (39 arquivos, 258 testes) |
| `services/api-lite` lint / typecheck / suíte completa (55600) / build | OK, 43 arquivos, 449 testes |
| `apps/travel-lite` lint / typecheck / suíte completa / build | OK, 22 arquivos, 193 testes |
| Suíte completa do Full API | não rodada de forma isolada (regra da coordenação) |

## 5. Revisão do Codex (somente leitura, `gpt-6.1-sol`) — 1 rodada, 10 achados
Corrigidos: (1) widget financeiro ignorava `assertNotRestricted('financial','view')` → corrigido, com teste; (2) projeções contornavam REVOKE/restrições → recebíveis pela ponte `requireRoleOrAreaGrant`, comissões por `assertNotRestricted`, widgets com a mesma guarda, testes de REVOKE e de restrição; (5) primeira gravação concorrente do layout dava 500 → agora 409 (teste com `Promise.all`); (7) filtros aceitos e ignorados → agora recusados (400) onde não se aplicam; (8) N+1 em comissões → teto de 1.000 linhas e widget degrada para "indisponível" sem derrubar o dashboard; (9) respostas antigas sobrescrevendo filtros novos → descartadas nas duas UIs, valores antigos limpos em erro; (10) teste Lite agora cria um item `PENDING_RULE` real e prova a exclusão; testes de restrição/REVOKE/concorrência adicionados.
**Não corrigidos (registrados):** (3) a projeção usa a **data do direito** (ou o último vencimento do cliente) como data de recebimento: a política de lotes/janelas/deslocamento (`payout_day_offset`, caso 2 da especificação, 235,00 em 10/11) **depende da Onda E (lotes), ainda não implementada** — o relatório não promete essa data; (4) a `DashboardPage` existente **continua com painéis fixos** e não consome `/dashboard/widgets` (trocar a página principal é decisão de produto e a página tem alterações de outras frentes); o editor e a API já funcionam; (6) o PUT do dashboard do **Lite** segue sem versão (exige migration 017 e mudança da UI existente); (7 parcial) filtros de vendedor, forma de pagamento, estado do direito e lote da especificação não foram implementados; (10 parcial) o teste de comissão com dados reais e o de CSV com fórmula na coluna de fornecedor (a coluna é id, não nome) não foram feitos.

## 6. Decisões adotadas por padrão
- Projeção de receita sem lotes: CONTRATADO agrupa pela data do direito; PROJETADO pelo último vencimento do cliente; sem data → INDEFINIDO.
- Receitas/comissões/recebíveis em relatórios separados, sem total combinado.
- Filtros por-item (`supplierId`, `productId`) só nos relatórios de receita; os demais os recusam.
- Dashboard: fonte de verdade = catálogo em código; layout só `key/enabled`; widget sem permissão é omitido; `liteKey` registrado nos dois widgets com equivalente (`commercial_overview`→`sales_summary`, `financial_overview`→`cash_flow`).
- Lite: sem `commissions-projection` (a liberação de comissão do Lite é por outro caminho; o Full tem o N+1 conhecido) e sem widget novo (DEC-007: só o que o Full tem — o Lite mantém o dashboard existente).
- Teto de 5.000 linhas (1.000 em comissões) com erro claro.

## 7. O que não foi verificado / pendências
- Terceira rodada do Codex (as correções foram confirmadas por testes e gates, não por nova revisão).
- Suíte completa do Full API; nenhuma tela aberta em navegador real (jsdom).
- Lotes/janelas e a data de pagamento prevista (Onda E); filtros por vendedor, forma de pagamento, estado do direito e lote.
- `DashboardPage` do Full não usa os widgets configuráveis; versão otimista do PUT do dashboard Lite; `commissions-projection` no Lite.
- Teste de comissão com dados reais no banco do Full.
- Migrations só em bancos descartáveis; nada online.
