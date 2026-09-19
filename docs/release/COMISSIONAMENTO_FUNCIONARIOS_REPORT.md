# Relatório — Comissionamento por Funcionário e Produto

## HEAD

- **HEAD inicial**: `1dd1877` (docs(release): atualizar relatório — fechamento da META 01)
- **HEAD final**: ver commit desta entrega (mensagem `feat(agency): comissionamento por funcionário e produto`)

## Migrations

- `infrastructure/migrations/080_employee_commission_rules.sql` (forward-only):
  - Cria enums `employee_commission_product_type`, `employee_commission_calculation_type`, `employee_commission_basis`.
  - Cria tabela `employee_commission_rules` (RLS forçado, política completa, índice único parcial de precedência).
  - Estende `commission_entries` (`commission_plan_id` passa a ser anulável; novas colunas `commission_rule_id`, `product_type`, `source_item_id`, `source_item_type`, `quantity`; `commission_entries_lineage_check`).
  - Substitui o índice de deduplicação único por dois índices parciais (legado / novo caminho por produto).
  - Adiciona `excursion_customers.sale_value` (gap de precificação por passageiro identificado na auditoria).
  - Validada por reset completo de um Postgres descartável e reaplicação sequencial de **todas** as migrations 001→080, sem erros.

## Backend

- `services/api/src/employee-commission-rules.ts` (CRUD + resolução de regra vigente com precedência determinística).
- `services/api/src/employee-commissions.ts` (motor de cálculo: resolução de base real por tipo de produto, geração de comissão com snapshot, relatório por funcionário, `listMyCommissionEntries`, `cancelCommissionsForSale`).
- `services/api/src/commissions.ts` — mapeamento estendido para as novas colunas.
- `services/api/src/sales.ts` — `cancelSale()` agora cancela comissões `PENDING/APPROVED` da venda cancelada (gap real encontrado na auditoria, corrigido).
- `services/api/src/routes/commissions.ts` — novas rotas: `GET/POST /employee-commission-rules`, `GET/PATCH /employee-commission-rules/:id[/status]`, `POST /commissions/generate-by-product`, `GET /commissions/mine`, `GET /commissions/report`.
- `packages/domain/types.ts` — novos enums e interface `EmployeeCommissionRule`.

## Frontend

- `apps/agency/src/pages/EmployeeDetailPage.tsx` (novo): abas Perfil / Comissões / Histórico, integrado à navegação existente de Funcionários (Direction A: cards de resumo, tabela de regras, formulário compacto, sem formulário gigante).
- `apps/agency/src/pages/EmployeesPage.tsx` — link "Ver" para o detalhe do funcionário.
- `apps/agency/src/App.tsx` — rota `employees/:id`.
- `apps/agency/src/lib/api.ts` — client para todos os novos endpoints.

## Testes

- `services/api/tests/employee-commission-rules.test.ts` (novo): **19/19 passando**, cobrindo os 15 cenários pedidos (taxas diferentes por funcionário, mesmo produto/regras diferentes, excursão per-passenger, aéreo percentual, valor fixo por ticket, pacote percentual, vigência, alteração de regra não altera histórico, não duplicação, isolamento de tenant, AGENT não altera própria regra, cálculo backend-autoritativo, regra ausente, conflito/precedência, reload/persistência) mais os testes HTTP de permissão e o teste de cascata de cancelamento.
- `services/api/tests/sale-routes.test.ts` — corrigido para usar todas as migrations (não mais lista curada), regressão real encontrada e corrigida (ver "Gaps e decisões" abaixo).
- `tests/integration/database/002_prepare_local_roles.sql` e `database.integration.test.ts` — atualizados para a nova tabela.

### Gates finais (monorepo completo)

| Gate | Resultado |
|---|---|
| `npm run lint` | 0 erros (13 warnings pré-existentes, não relacionados) |
| `npm run typecheck` | limpo nos 7 pacotes |
| `npm run test` | **91/91 arquivos, 1552/1552 testes** |
| `npm run test:security` | **5/5 arquivos, 58/58 testes** |
| `npm run test:db` | **1/1 arquivo, 9/9 testes** |
| `npm run build` | 7/7 pacotes, sucesso |

## QA real (navegador, ambiente staging)

Fluxo completo validado via Playwright contra `https://agency.localhost`:

1. Login como owner da agência de staging.
2. Funcionários → criação de funcionário real ("Joao QA Comissao").
3. Abertura do detalhe do funcionário → aba Comissões (vazia).
4. "Adicionar comissão" → regra `PACKAGE / PACKAGE_TOTAL / 4%` criada com sucesso.
5. Geração real de comissão via API para uma venda de R$5000 → resultado **R$200** (4% × 5000), exatamente correto.
6. Aba Histórico confirmando o lançamento com o valor correto.

Screenshots capturados: `c01_employees.png` → `c07_historico.png` (scratchpad da sessão).

## CI

- Push realizado para `main`.
- CI real acompanhada via `gh run watch` — ver run id e status abaixo (preenchido após push desta entrega).

## Gaps remanescentes (documentados, não bloqueantes)

- `HOTEL` e `TRANSFER` não têm tabela estruturada de precificação por venda; geração de comissão para esses produtos depende de valor-base informado manualmente pelo gestor (o cálculo final continua sempre autoritativo no backend).
- Não há gatilho automático de geração de comissão a partir de evento de venda — geração continua manual, seguindo o precedente já existente de `/commissions/generate`.
- Split entre múltiplos vendedores não implementado (fora de escopo, por instrução explícita).
- Cadeia futura Fornecedor→Agência→Vendedor (visão de Marketplace) não implementada, por instrução explícita do usuário.

## Status final

**COMISSIONAMENTO POR FUNCIONÁRIO E PRODUTO — PRONTO PARA REVISÃO**
