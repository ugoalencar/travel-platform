# Finalização do Full — 2026-10-25

## Fase A — D4, D4B e D5

### D4 — Um motor por obrigação

- Serializados os caminhos legado, atribuição versionada e geração versionada com o mesmo advisory lock por agência/venda/funcionário.
- O caminho legado retorna conflito se já houver atribuição versionada ativa ou se a venda estiver na data de corte ou depois dela. A atribuição versionada recusa comissão legada ativa para o mesmo par.
- `PENDING_RULE` permanece resolvível na entrada existente. A listagem distingue vigência `EFFECTIVE`, `SCHEDULED` e `SUPERSEDED`; a interface exibe essas situações.
- Migration nova `112_commission_tier_total_cutoff.sql`: configuração da data de corte por agência com RLS forçada e grants de runtime; amplia a constraint já criada na 107 para aceitar `MARGINAL` e `TOTAL`. Não foi executada.
- Teste de integração escrito para bloquear o motor legado após a data de corte.

### D4B — Condições de pagamento

- API lista condições ativas/inativas, cria, revisa por nova versão e desativa com auditoria, preservando registros e snapshots de vendas existentes.
- Criada a tela de cadastro e configuração, adicionada à navegação. Corrigido o payload do formulário para não enviar `version`, calculada no servidor.
- Teste de componente cobre a criação de uma condição sem versão controlada pelo cliente; teste de banco cobre revisão imutável, inativação e listagem.

### D5 — Metas, perfil e faixas

- A acumulação lê o perfil financeiro efetivo na data de reconhecimento. `META_E_LIBERACAO` usa alocações reais de pagamentos recebidos no mês e pondera a base da atribuição pela proporção recebida; outros perfis mantêm a base de venda confirmada.
- `TOTAL` foi adicionado como escolha explícita, separado de `MARGINAL`; o cálculo aplica a taxa da faixa alcançada ao acumulado inteiro. Fronteiras de faixa usam comparação inclusiva.
- Decisão registrada: sem perfil financeiro vigente, preservar o comportamento anterior de acumular a venda confirmada (`SOMENTE_LIBERACAO`).
- Teste de banco escrito para recebimento parcial e acumulação; não executado nesta rodada.

### Arquivos principais

- `services/api/src/employee-commissions.ts`, `services/api/src/commission-rule-versions.ts`, `services/api/src/commission-calculation.ts`, `services/api/src/sale-payment-schedules.ts` e rotas relacionadas.
- `apps/agency/src/pages/CommissionRulesPage.tsx`, nova `apps/agency/src/pages/PaymentConditionsPage.tsx`, `apps/agency/src/lib/api.ts`, `apps/agency/src/App.tsx` e `apps/agency/src/components/layout/Sidebar.tsx`.
- `packages/domain/types.ts`, `services/api/src/audit-log.ts`, `services/api/src/route-inventory.ts`, migration 112 e testes novos/alterados em `services/api/tests/` e `apps/agency/src/pages/`.

### Verificações locais executadas

- API: `tsc -p services/api/tsconfig.json --noEmit` — passou.
- Agência: `tsc -p apps/agency/tsconfig.json --noEmit` — passou.
- ESLint nos arquivos da Fase A — passou sem erros; permanece um aviso `react-refresh/only-export-components` em `CommissionRulesPage.tsx:44`.
- `services/api/tests/commission-calculation.test.ts` — 12 testes passaram.
- `apps/agency/src/pages/CommissionRulesPage.test.tsx` e `PaymentConditionsPage.test.tsx` — 7 testes passaram.
- `bun scripts/validate-migrations.cjs` — encontrou e validou a cadeia de 112 arquivos.
- `git diff --check` nos arquivos da Fase A — sem erros de whitespace.

### Pendente para o Claude no banco descartável

- Aplicar a migration 112 somente no banco de teste autorizado e rodar os testes de integração escritos/alterados: `services/api/tests/employee-commission-rules.test.ts`, `commission-accrual-http.test.ts`, `sale-payment-schedules.test.ts` e `commission-rule-versions-db.test.ts`.
- Depois, executar os gates finais do prompt, inclusive `test:db` e build. Nenhuma migration, banco, Supabase, Render, Vercel ou ambiente online foi acessado por esta execução.

## Fase B — D6 e D7

### D6 — Liberação, canais e estorno

- A política de liberação é capturada quando a comissão é criada, no motor versionado e nos caminhos legados. Para entradas antigas sem snapshot, a primeira leitura resolve a política e a grava na obrigação, inclusive quando a configuração está bloqueada.
- O cálculo de recebido ignora pagamentos de entrada vinculados a `sale_payment_reversals`. Saldos, parcelas, recebíveis, projeções, portal do cliente e totais financeiros consultados foram ajustados para não contar o crédito estornado.
- Criada a migration aditiva `113_sale_payment_reversals.sql`, com FKs tenant-scoped, unicidade por recebimento original, snapshot das alocações, motivo, trigger append-only, RLS forçada e grants condicionais para os dois roles runtime.
- Implementada `POST /sales/:id/payments/:paymentId/reverse` para gerente+, com motivo obrigatório, auditoria, idempotência por recebimento original, lançamento de saída, recomposição do saldo/parcelas/receita e bloqueio `COMMISSION_PAID_EXCEEDS_RELEASED` quando o valor já pago excederia o novo valor liberado.
- O painel de pagamento exibe o histórico e permite estorno para gerente/admin/owner, exigindo motivo. O teste de componente cobre o fluxo e seus controles.
- Testes de banco foram escritos em `services/api/tests/commission-release-http.test.ts` para estorno idempotente, bloqueio por comissão paga acima do liberado e congelamento da política. Não foram executados nesta rodada.

### D7 — Comissões e receita na interface

- `PayrollPage` agora permite atribuir venda a funcionário com categoria e data de reconhecimento opcionais, gerar a comissão versionada no fluxo de atribuição, resolver `PENDING_RULE` e acessar regras. Exibe reconhecido, liberado, pago e saldo alocável por obrigação; informa que a folha só inclui comissões integralmente liberadas.
- `AgencyRevenuePage` ganhou consulta de entradas entre vendas, limitada a 500 registros, com filtros por venda, status, fornecedor e categoria. A consulta é tenant-scoped no servidor e abre a venda para usar as ações existentes de recebimento, cancelamento e reativação. As regras são versionadas; revisões criam nova versão.
- Criado teste de serviço para filtros tenant-scoped e piso de papel da listagem. Testes de componente cobrem os filtros, consulta por venda e fluxo de estorno.
- A listagem geral não expõe campos de comissão. A análise por venda continua omitindo comissão/diferença para usuários com restrição de pessoal.

### Arquivos e migration

- Migration nova: `infrastructure/migrations/113_sale_payment_reversals.sql` (não aplicada).
- API: `services/api/src/commission-release-service.ts`, `sale-payment-schedules.ts`, `agency-revenue.ts`, rotas, `route-inventory.ts`, `errors.ts`, `audit-log.ts` e consultas financeiras relacionadas.
- Full UI: `apps/agency/src/pages/PayrollPage.tsx`, `AgencyRevenuePage.tsx`, painel de pagamento e testes associados; cliente em `apps/agency/src/lib/api.ts` e `paymentSchedule.ts`.
- Gates de schema: `tests/integration/database/database.integration.test.ts` e `002_prepare_local_roles.sql` incluem a nova tabela append-only.

### Verificações locais executadas

- Typecheck da API e agência — passaram.
- ESLint dos arquivos Full alterados — passou; ao incluir `financial.ts`, foram reportados seis avisos `no-explicit-any` já existentes.
- `services/api/tests/agency-revenue-restriction.test.ts` — 10 testes passaram.
- `apps/agency/src/pages/AgencyRevenuePage.test.tsx` e `SalePaymentPanel.test.tsx` — 21 testes passaram.
- `bun scripts/validate-migrations.cjs` — validou a cadeia de 113 arquivos.
- `git diff --check` nos arquivos tocados — sem erro de whitespace; houve aviso de conversão LF/CRLF em `route-inventory.ts`.
- Nenhum teste que acessa PostgreSQL foi executado; nenhuma migration foi aplicada.

### Pendente para o Claude no banco descartável

- Aplicar as migrations 112 e 113 somente no banco descartável autorizado `travel-full-teste-20261025` (porta 55644) e executar os testes de integração da Fase A, mais `services/api/tests/commission-release-http.test.ts` e os testes HTTP afetados de condições/pagamentos.
- Rodar `test:db` e os gates finais do prompt após as migrations. Não usar apresentação, Lite, Supabase, Render, Vercel, Gadotti ou outro ambiente online.
