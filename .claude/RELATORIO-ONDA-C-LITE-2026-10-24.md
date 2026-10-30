# Relatório — Onda C no Lite (cronograma de pagamento e baixas) — 24/10/2026

Sem commit, push ou deploy. Banco de teste do Lite: `travel-lite-postgres-test` (porta 55600). O Codex não foi usado nesta tarefa (limite de uso dele até 15:29; sem revisão independente desta etapa).

## O que foi feito
1. **422 dos 9 testes de `sale-payment-schedules.test.ts`:** era a fixture, não a validação. A categoria do teste não habilitava `travel_start_date` (formulário da Onda B). A fixture agora configura a categoria (PUT do formulário como administrador). Depois disso sobraram duas falhas reais, corrigidas no código:
   - `routes/sales.ts` `confirmSaleDraft`: confirmar um rascunho que já tem condição de pagamento aplicada gerava recebíveis legados e duplicava (500, `ux_receivables_sale_installment`). Agora não gera recebíveis legados quando existe `payment_condition_snapshot`.
   - `sale-payment-schedules.ts` `createSalePaymentSchedule`: a verificação de recebíveis legados (409) passa a vir antes do cálculo do cronograma (antes vinha 422).
2. **Frontend:** criados `apps/travel-lite/src/paymentSchedule.ts` (cópia do contrato do Full, com `account_id` na baixa) e `SalePaymentPanel.tsx` (estilo do Lite, sem Tailwind; classe `.sr-only` adicionada em `styles.css`), integrado ao detalhe da venda em `SalesPage.tsx`. Revisão de condição só para MASTER/ADMIN; aplicar e baixar exigem `finance.manage`. Os testes `SalesDetail.test.tsx` e `SalesIncomplete.test.tsx` ganharam `useAuth` no mock.
3. **Saldo aberto e data civil (equivalente ao `receivable-sql.ts` do Full):** painel do dashboard soma `GREATEST(amount - paid_amount, 0)`; filtro `overdue` de `/receivables` usa `overdueReceivableSql('now()')` (data civil em America/Sao_Paulo) em vez de `CURRENT_DATE`; `remaining_amount` nunca negativo. Teste novo `tests/receivable-balances.test.ts`.
4. **409 na troca de categoria com cronograma aplicado:** já coberto e passando em `sale-payment-schedules.test.ts` (PATCH `category_id` → 409).

## Testes (quais falhavam antes)
- Falhavam antes: 9/9 de `sale-payment-schedules.test.ts` (fixture) e depois 2 (confirmação duplicando recebíveis; ordem 409×422); `SalePaymentPanel.test.tsx` (módulos inexistentes); 2 testes de UI existentes quebraram ao integrar o painel (mock sem `useAuth`) e foram ajustados.
- Passam: `sale-payment-schedules` 9/9, `payment-schedule*` (22), `receivable-balances` (2).
- Ressalva: o teste de fuso do filtro `overdue` pode não reproduzir a falha antiga (o pool de conexões já aberto ignora o `ALTER ROLE ... timezone`); ele protege o comportamento correto, mas não provei que falhava antes.

## Gates
- api-lite: 38 arquivos, 402 testes ✔ (porta 55600).
- Frontend Lite: 20 arquivos, 186 testes ✔.
- `npm run lint` ✔ (9/9; ajustei o cabeçalho do `SalePaymentPanel.test.tsx` deixado pelo Codex), `typecheck` ✔, `build` ✔.

## Não verificado
- Revisão independente do Codex desta etapa (pendente até 15:29).
- Painel no navegador (só testes de componente).
- Integração real do `useCan('finance.manage')` por papel na UI (mockado nos testes).
- Fuso: o teste do filtro `overdue` (ver ressalva).

## Também registrado: Onda B (concluída antes desta tarefa)
Correções finais pedidas pelo Codex aplicadas e testadas: limites de itens no Full com paridade Full×Lite (`saleItemAmountsError`), `categoryId: null` limpa o vínculo do produto, testes de cancelamento concorrente e rollback no Full. Suíte completa do Full: 2016/2017 (única falha: MFA 429 preexistente). Revisão do Codex dessas últimas correções não ocorreu (limite).
