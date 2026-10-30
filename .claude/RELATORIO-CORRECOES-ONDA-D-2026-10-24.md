# Correções da revisão da Onda D — 2026-10-24

Estado: código e testes escritos; sem validação de execução. Nenhum comando Node/npm/Vitest/TypeScript, migration ou acesso a banco foi executado nesta sessão. Sem dependências novas e sem commit.

## Decisões implementadas

1. Migration Full 106: grants SELECT/INSERT para escopos e versões; SELECT/INSERT/UPDATE para entradas. Papéis travel_app_runtime e travel_app_runtime_local, quando existentes. RLS e regras append-only preservadas.
2. Quitação: reconhecimento aceita settled_at ou status PAID. Full markSalePaid sincroniza dentro da transação, inclusive na chamada idempotente. Lite refreshSaleStatus atualiza settled_at, limpa-o na reabertura e sincroniza dentro da transação do chamador.
3. Item sem fornecedor fica PENDING_RULE, valor zero e sem regra aplicada, mesmo recebendo uma regra genérica.
4. Cancelamento do item cancela sua receita na mesma transação; RECEIVED bloqueia com 409. Sincronização considera somente itens ACTIVE. Mantidas as restrições existentes de edição da venda.
5. D4: frações decimais exatas com BigInt; arredondamento half-up somente após calcular o valor do item. Incluídos 1,005 → 1,01 e 0,014 × 4 → 0,06. Módulos Full e Lite idênticos byte a byte.
6. Confirmação Full e sincronização compartilham a transação. Receita, confirmação, cancelamento e reativação seguem lock da venda antes das entradas. Baixa legada Lite obtém lock da venda antes do recebível.
7. Totals.received soma received_amount. Totals.expected e totals.difference referem-se às entradas RECEIVED, para medir a divergência de liquidação sem confundir previsões com divergências. As telas mostram esperado, recebido e diferença por entrada recebida; a comparação com funcionário/vendedor usa “Diferença receita versus comissão”.
8. Recálculo preserva CANCELLED. POST /agency-revenue/entries/:id/reactivate exige administrador e body { reason: string }, de 1 a 128 caracteres úteis. Reativa a mesma entrada e seu snapshot; a auditoria obrigatória registra o motivo integral. Venda/item cancelados, entrada não cancelada ou outra entrada ativa do item impedem a operação. PENDING_RULE permanece pendente. No Lite também é exigida revenue.receive. Sem botão novo na UI.
9. Estorno Lite: retirado o bloqueio indiscriminado por cronograma. Antes de estornar, cancela a receita na mesma transação, com 409 se RECEIVED. Reabre todas as alocações de recebíveis de uma baixa, limpa settled_at e mantém as proteções existentes da comissão já paga. Não foi criado outro fluxo financeiro Full.

## Testes escritos/ajustados

- Unitários D4 e ausência de fornecedor, antes da implementação do cálculo.
- Integração: quitação legada real, R1 por POST /sales/:id/payments seguido de leitura (sem SQL direto de settled_at e sem recálculo para produzir o direito), cancelamento de item, D6, totais 100/90/10, recálculo e reativação com permissão/motivo/auditoria.
- Concorrência: duas chamadas de cálculo concorrentes com a confirmação, uma entrada e um evento de constituição.
- Falhas reais de auditoria por trigger descartável: rollback da confirmação/direito, recebimento e reativação.
- D3: comissão paga pelo fluxo financeiro antes de receber do fornecedor, em ambos os produtos. Fixtures de comissão explícitas: LEGACY no Full e ON_SALE no Lite; pagamento e alteração para PAID passam pelos endpoints reais.
- Estorno Lite: legado permitido/bloqueado por D6; cronograma com recebimento de receita bloqueado; cronograma sem recebimento permite estornar várias alocações.
- UI: esperado 100, recebido 90 e diferença 10, com rótulo distinto da comissão.
- Grants 106: fixture Full aplica até 105 e prepara os papéis antes de criar as tabelas de receita; aplica 106 e posteriores sem reaplicar o bootstrap. O teste usa o runtime real. Há uma concessão explícita de fixture somente para commission_release_events (108, Onda E2), necessária ao teste D3; nenhuma concessão de fixture para tabelas da receita após 106. A migration 108 não foi editada.

## Arquivos alterados nesta sessão

Full:
- infrastructure/migrations/106_agency_revenue.sql
- services/api/src/agency-revenue-calc.ts
- services/api/src/agency-revenue.ts
- services/api/src/sales.ts
- services/api/src/sale-items.ts
- services/api/src/audit-log.ts
- services/api/src/routes/agency-revenue.ts
- services/api/tests/agency-revenue-calc.test.ts
- tests/integration/database/agency-revenue.integration.test.ts
- apps/agency/src/pages/AgencyRevenuePage.tsx
- apps/agency/src/pages/AgencyRevenuePage.test.tsx

Lite:
- services/api-lite/src/agency-revenue-calc.ts
- services/api-lite/src/agency-revenue.ts
- services/api-lite/src/finance.ts
- services/api-lite/src/audit-log.ts
- services/api-lite/src/routes/agency-revenue.ts
- services/api-lite/src/routes/sale-items.ts
- services/api-lite/src/routes/cash-flow.ts
- services/api-lite/tests/agency-revenue.test.ts
- services/api-lite/tests/sale-payment-schedules.test.ts
- apps/travel-lite/src/pages/AgencyRevenuePage.tsx
- apps/travel-lite/src/AgencyRevenuePage.test.tsx

Documentação: este relatório. A migration Lite 015 já contém os grants necessários e não exigiu alteração. Nenhuma migration de outro número foi editada.

## Verificação e limites

Verificações estáticas executadas: comparação byte a byte dos módulos de cálculo e git diff --check dos arquivos rastreados alterados nesta sessão, ambos com saída 0. Isso não comprova compilação nem comportamento em PostgreSQL/browser.

Pendentes para quem executará os gates: lint, typecheck, Vitest das suítes acima, test:db e builds dos dois produtos, conforme QUALITY-GATES.md. Executar integração apenas em bancos descartáveis e sem paralelizar fixtures que compartilham container/porta. Não foi observado ciclo red/green, por proibição expressa de executar Node. Nenhuma alegação de testes passando.

Fora desta entrega: aplicação das migrations, alteração de dados reais, produção, deploy, commit e interface de reativação. Alterações preexistentes de outras frentes foram preservadas.
