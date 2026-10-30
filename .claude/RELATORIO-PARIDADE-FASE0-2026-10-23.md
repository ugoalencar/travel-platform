# Relatório Fase 0 — paridade de comissões Full / Lite (caracterização + proteções)

Data: 2026-10-23. Autor: Claude. Branch `wip/organizacao-2026-10-20` (working tree com outras alterações preservadas; sem commit/push, sem reset/checkout/stash).
Autorização recebida pela sessão de origem: Fase 0a + 0b; decisões F1 (aceito, só fases 3+), F2 (COM-03 bloqueada), F3 (canal único), F4 (arredondamento atual mantido).
Escopo respeitado: sem progressividade, categorias, atribuições, COM-02/COM-03 nem módulo de cálculo; `services/api-lite` e `apps/travel-lite` intocados; sem `.env`, sem banco remoto, sem Gadotti, sem deploy.

## 1. Arquivos alterados / criados

| Arquivo | Tipo | O que mudou |
| --- | --- | --- |
| `infrastructure/migrations/100_commission_channel_protection.sql` | **novo** | aborta se houver payable vivo duplicado por entrada; índice único parcial `payables_agency_commission_entry_live_key`; coluna `commission_entries.payroll_entry_id` (FK composta) + índice parcial. Aditiva, sem dados tocados, sem vínculo retroativo. |
| `services/api/src/commissions.ts` | alterado | PRO-01: `FOR UPDATE` em `approveCommissionEntry` e `createPayableFromCommissionEntry`; create-payable recusa (409) entrada reservada por folha; novo `listCommissionChannelConflicts` (somente leitura). |
| `services/api/src/payroll.ts` | alterado (já tinha mudanças de outro trabalho, preservadas) | `generatePayrollEntry`: lock consultivo por funcionário+mês; entradas elegíveis = `APPROVED`, sem payable avulso, não reservadas; reserva (`payroll_entry_id`); regenerar folha `OPEN` libera e reserva de novo; `PAYABLE`/`PAID` deixam de entrar na folha. |
| `services/api/src/financial.ts` | alterado (idem) | `refreshPayableStatus`: payable avulso quitado → entrada `PAID`; payable da folha quitado → entradas reservadas `PAID`; parcial não quita (PRO-03). |
| `services/api/src/employee-commissions.ts` | alterado | `cancelCommissionsForSale`: trava entradas e recusa (409, `ConflictError`) se alguma estiver `PAYABLE`, `PAID` ou reservada por folha (F3). |
| `services/api/src/routes/commissions.ts` | alterado | `GET /commissions/channel-conflicts` (MANAGER+, leitura). |
| `services/api/tests/commission-characterization.test.ts` | **novo** | 20 testes (§2). |
| `services/api/tests/financial.test.ts` | alterado (arquivo já modificado por outro trabalho) | só inclui `100_commission_channel_protection.sql` na lista explícita de migrations. |
| `docs/product/COMISSIONAMENTO_FUNCIONARIOS.md` | alterado | §7 (cancelamento agora 409) e nova §7.1 (canal único, legado, arredondamento). |

## 2. Testes novos e se falhavam antes

Rodados em Postgres 15 **descartável local** (contêiner `travel-platform-postgres-local`, porta 55432, criado/destruído pelo próprio teste).

Execução **antes** das proteções (código antigo, migration 100 ainda ausente): **5 passaram / 15 falharam**.

| ID | Cobre | Antes | Depois |
| --- | --- | --- | --- |
| CH-01 (R3) 18,50×3% = 0,55 (Lite daria 0,56) — F4 | arredondamento mantido | passou | passa |
| CH-06 (R4) 23:30 UTC−3 de 10/10 seleciona a regra de 11/10 (data em UTC) | caracteriza | passou | passa |
| CH-07 (R6) 2º item AIR da mesma venda é recusado | caracteriza | passou | passa |
| CH-08 (R11) nova regra com mesmo `valid_from` viola `validity_check` | caracteriza | passou | passa |
| PRO-01 (R1) create-payable concorrente → 1 payable (5 rodadas) | **falhou** (`2 fulfilled`: corrida reproduzida) | passa |
| PRO-02 banco recusa 2º payable vivo (`23505`) | **falhou** (insert aceito) | passa |
| PRO-02b payable cancelado não bloqueia novo (índice parcial) | passou | passa |
| PRO-03 entrada `PAYABLE` → `PAID` só na quitação total | **falhou** | passa |
| SET-01a entrada reservada pela folha → payable avulso 409 | **falhou** | passa |
| SET-01b entrada com payable avulso não entra na folha (total 0, líquido 3.000) | **falhou** (entrava: 100) | passa |
| SET-01c entrada `PAID` nunca entra na folha | **falhou** | passa |
| SET-02 regenerar folha `OPEN` não duplica reserva | **falhou** | passa |
| SET-02b comissão aprovada depois entra ao regenerar | **falhou** | passa |
| SET-03 payable avulso × folha concorrentes nunca nos dois canais (5 rodadas) | **falhou** | passa |
| SET-04 folha parcial não quita comissão; total quita | **falhou** | passa |
| SET-05a cancelar venda com comissão `PENDING` ainda cancela | **falhou** (coluna nova ausente no helper) | passa |
| SET-05b/c/d cancelar com `PAYABLE` / reservada / `PAID` → recusado, nada muda | **falharam** (cancelava) | passam |
| SET-06 relatório de conflitos legado, sem alterar dados | **falhou** | passa |

Observação honesta: parte das falhas "antes" vem da ausência da coluna `payroll_entry_id` (os helpers a leem), não só do comportamento; as que provam o risco por comportamento são PRO-01 (2 payables), PRO-02, SET-01b e SET-05b/c/d. R2 (sem `PAID`) é coberto por PRO-03. R5 e R13 (folha snapshot) não têm teste próprio: R13 passa a ser tratado pela reserva + 409 no cancelamento; R5 (`findApplicableRule` em outra transação) não foi alterado.

## 3. Gates (todos locais)

| Gate | Resultado |
| --- | --- |
| `npm run lint` | **OK** (9/9; só avisos preexistentes) |
| `npm run typecheck` | **OK** (9/9) |
| `npm run test` (turbo) | agency: 1 teste falhou por timeout/carga na execução paralela; **reexecutado isoladamente: 135/135 OK**. Turbo interrompeu o restante, então a API foi rodada à parte: |
| `vitest` de `services/api` completo | **1738 passaram, 1 falhou, 101 arquivos**: `customer-platform-auth-http.test.ts › a pending MFA challenge is invalidated after 5 wrong codes` (`expected 429 to be 401`). Reproduzido isolado. Não toca nenhum arquivo alterado por mim (é rate-limit/MFA); **não comparei com o baseline sem as minhas mudanças** (proibido stash) — tratar como falha independente a confirmar. |
| `npm run test:db` | **OK** (13/13) |
| `npm run build` | **OK** (9/9) |
| `npm run migrations:validate` | **OK** (sequência até 100) |
| `npm run secrets:scan` | **falha (exit 1)**: 36 linhas, todas em `services/api-lite/tests/*` (backup, branding, password-policy…); **nenhuma** em arquivos meus. Preexistente/fora do escopo. |

## 4. Autorrevisão crítica

- **Corrida do payable:** reproduzida antes (2 payables) e eliminada depois por dois mecanismos independentes (trava de linha + índice único). 5 rodadas pareadas passam.
- **Pagamento duplo folha × avulso:** fechado por reserva transacional. Ordem de locks: lock consultivo da folha → `FOR UPDATE` das entradas (ordenado por id); `create-payable`/`approve`/cancelamento travam a entrada. Sem ciclo conhecido; um deadlock teórico seria detectado e abortado pelo Postgres (não reproduzido).
- **Revalidação no pagamento (§5 do contrato):** **não** implementei revalidação em `allocatePayment`. Justificativa: as fontes de invalidação (cancelar venda com entrada reservada/paga) agora são recusadas na origem e a reserva é exclusiva. Risco residual: qualquer **novo** caminho que cancele/altere entrada reservada precisa respeitar o bloqueio. Se o Codex exigir a revalidação defensiva, é pequena (checar entradas reservadas no payable da folha).
- **Entradas `PAYABLE`/`PAID` deixam de entrar na folha:** mudança deliberada de valor para **novas** gerações (antes entravam e geravam pagamento duplo). Folhas já geradas/aprovadas não são alteradas. Consequência a saber: uma folha `OPEN` regenerada depois da migration passa a excluir comissão já paga por outro canal.
- **Legado:** nenhum vínculo retroativo; conflitos só em `GET /commissions/channel-conflicts`. A heurística é aproximada (payable avulso vivo + folha do mês com `commissions_total > 0`, entrada sem reserva); pode listar falso positivo e **não prova** que a folha contou aquela entrada.
- **Estados de reversão** (payable `PAID` → aberto) só existem no código, porque o Full não tem estorno; não testados.

## 5. Não verificado / limites

- Falha MFA (§3) sem baseline; `secrets:scan` preexistente.
- `PayrollPage.tsx` **não alterado**: o botão "Gerar Conta a Pagar" ainda aparece para entrada reservada e agora responde 409 com mensagem (exibida pelo `actionError`); ocultar o botão exige expor `payrollEntryId` na API/tipos (não feito — fora do escopo mínimo). Sem teste de UI.
- Migration 100 aplicada **somente** no Postgres descartável dos testes; não aplicada em nenhum banco real. Comportamento com dados legados reais (duplicatas vivas fariam a migration abortar) não verificado.
- Rotas HTTP novas/alteradas sem teste HTTP (cobertura é de camada de serviço); mapeamento `ConflictError` → 409 pelo handler global não foi reconferido por teste HTTP.
- R5, R13 como comportamento isolado, e estorno de pagamento: sem teste.
- Nenhuma decisão financeira fora de F1–F4 foi necessária; **sem bloqueios** para esta fase. Pendências para outras fases continuam: F2 (COM-03 bloqueada, `resolveReleasePolicy` ainda não criado — não era escopo), ADR e fases 1+.
