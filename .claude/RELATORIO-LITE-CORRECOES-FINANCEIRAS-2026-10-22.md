# Relatório — correções financeiras do Travel Lite

Data: 2026-10-22. Branch: `wip/organizacao-2026-10-20`. Sem commit/push/deploy.

## Implementado (api-lite)

1. **Comissão só vira PAID na quitação total** — `services/api-lite/src/routes/cash-flow.ts`
   (`/payables/:id/pay`): o UPDATE para `PAID`, a auditoria `COMMISSION_PAID` e o evento
   de outbox só ocorrem quando o payable fica `PAID`. Pagamento parcial mantém a
   comissão `APPROVED` e `paid_at` nulo.
2. **Auditoria obrigatória em eventos financeiros** — `services/api-lite/src/audit-log.ts`:
   `REQUIRED_AUDIT_EVENTS` (COMMISSION_APPROVED/OVERRIDE/PAID, EXPENSE_CREATED/PAID,
   PAYMENT_RECEIVED/REVERSED) gravam sem SAVEPOINT; se o INSERT falhar, a transação
   inteira falha e reverte. Demais eventos continuam best-effort.
3. **Sem pagamento duplicado de comissão** —
   - `infrastructure/migrations-travel-lite/008_payable_commission_unique.sql`: índice
     único parcial `ux_payables_active_commission (tenant_id, commission_id)` onde
     `commission_id IS NOT NULL AND status <> 'CANCELLED'`; a migração aborta com erro
     claro se já houver duplicidade ativa (nada é apagado).
   - `POST /payables` agora recusa `commission_id` (400); a obrigação de comissão só
     nasce na aprovação.

## Testes (`services/api-lite/tests/commissions.test.ts`)

- pagamento parcial mantém `APPROVED`/sem `COMMISSION_PAID`; quitação final → `PAID`;
- `POST /payables` com `commission_id` → 400 e INSERT direto duplicado → `23505`;
- falha forçada (trigger) na auditoria `EXPENSE_CREATED` → 500 e payable não persiste.

## Verificação

- `npm run typecheck` e `npm run lint` (api-lite): limpos.
- `npm test` (api-lite): 185 passam, 2 falham em `tests/customers.test.ts`
  ("rejects an invalid CPF"), por mensagem em português ("O campo cpf deve ser um CPF
  válido") vs. regex `/valid CPF/`. Origem: trabalho paralelo de CEP em
  `routes/customers.ts`/`app.ts` (arquivos modificados que não são meus); não investigado
  além disso. Suítes de comissões, financeiro e hardening passam.
- Ambiente: a porta 55437 do Postgres de teste está em faixa reservada pelo Windows
  (`netsh … excludedportrange`). Recriei o contêiner descartável
  `travel-lite-postgres-test` (estava só `Created`) na porta 55600 e rodei com
  `LITE_TEST_ADMIN_URL`/`LITE_TEST_RUNTIME_URL`. O compose do repositório não foi alterado.

## Folha do Full: paga só na baixa do payable (autorizado depois)

- `services/api/src/payroll.ts` — `payPayrollEntry` agora só cria a conta a pagar; a folha
  continua `APPROVED` (sem `paid_at`). Recusa segunda obrigação, líquido <= 0 e usa
  `FOR UPDATE` (aprovar e pagar). Entrada expõe `payableId` (subconsulta em `PAYROLL_COLUMNS`;
  tipo em `packages/domain/types.ts`).
- `services/api/src/financial.ts` — `refreshPayableStatus` sincroniza a folha: payable
  quitado → `PAID` + `paid_at`; baixa parcial/desfeita → volta a `APPROVED`.
- `infrastructure/migrations/099_payroll_payable_unique.sql` — índice único parcial
  `(agency_id, payroll_entry_id)` para payable não cancelado; aborta se já houver
  duplicidade (nada apagado). **Não aplicada em ambiente real.**
- UI (`PayrollPage.tsx`, `lib/api.ts`): botão "Gerar conta a pagar" só sem `payableId`;
  status "Aguardando pagamento" quando há conta aberta.
- Testes (6 novos em `services/api/tests/financial.test.ts`): obrigação não paga a folha e
  segunda tentativa é recusada; duas chamadas concorrentes → 1 payable; parcial mantém
  `APPROVED`, quitação → `PAID`; líquido nulo recusado; outro tenant não cria; unicidade
  no banco (`23505`). `financial`, `financial-http` e `partners` passam (28 testes);
  typecheck do `services/api` e `apps/agency` limpos; lint sem erros (avisos antigos de `any`).
- Limitação: não há rota/estado para **desfazer** a baixa nem cancelar a conta; o retorno
  a `APPROVED` está no código de sincronização mas só é exercitável quando existir esse fluxo.
  Não testado pela UI no navegador.

## Fora desta entrega

- **Migração 008 não aplicada em ambiente real.** Antes de publicar, checar duplicidade
  de payables ativos por comissão no banco do piloto.
- Folha gerencial do Lite continua em HOLD (ver relatório de folha).
