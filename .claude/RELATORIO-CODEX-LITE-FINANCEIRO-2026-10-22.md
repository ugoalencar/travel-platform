# Relatório para análise do Codex — Travel Lite financeiro (comissões, folha, correções)

Data: 2026-10-22. Autor: Claude (executou a frente do Codex a pedido do usuário, que informou
que o Codex estava sem tokens). Branch: `wip/organizacao-2026-10-20` (não é `main`).
**Nada foi commitado, enviado ou publicado.** Este documento serve para o Codex revisar o que foi
feito, contestar decisões e retomar a coordenação.

Leitura sugerida, nesta ordem: este relatório → `docs/travel-lite/COMMISSION-ENGINE-SPEC.md`
(especificação, seção 12 = decisões pós-aprovação) → `docs/adr/ADR-LITE-COMMISSION-001-motor-de-comissoes.md`
(proposta, não aceita) → relatórios por frente em `.claude/` (lista na seção 9).

## 1. Resumo executivo

1. **Correções financeiras** pedidas (4 itens) — todas feitas: comissão só `PAID` na quitação total (Lite),
   folha só `PAID` na baixa do payable (Full), auditoria obrigatória em eventos de dinheiro (Lite),
   unicidade de payable por comissão (Lite) e por folha (Full).
2. **Fase 1** do motor de comissões: `roundMoney` única e cancelamento de venda cancela o payable de comissão aberto.
3. **Fase 2**: regras de comissão versionadas por vendedor/categoria/vigência (backend + tela).
4. **Fase 3**: comissão progressiva por faixas de meta mensal (backend + tela).
5. **Fase 4**: liberação da comissão por forma de pagamento (backend + telas).
6. **Folha gerencial do Lite**: só auditoria e proposta (`RELATORIO-LITE-FOLHA`); **não implementada** (HOLD).
7. **Aprovações de venda** (cancelamento/alteração com aprovação) e **Fase 5** (retroatividade): **não feitas**.

## 2. Decisões do usuário que governam o desenho (fonte: conversa de 2026-10-22)

- D1–D9 da spec foram **adotadas conforme as recomendações** (regra padrão da agência; data-base = `sale_date`;
  faixa marginal; arredondamento half-up por componente; meta em mês civil; liberação proporcional ao recebido;
  bônus soma/teto por competência [ainda não implementados]; ajuste negativo = saldo a compensar [sem fluxo];
  vendedor vê a própria regra).
- Incremento de 3% para 4% = +1 ponto percentual.
- **Meta conta a venda INTEIRA na confirmação** (R$ 50.000 em 10x entra como 50.000, não como parcelas).
- A comissão é calculada pela meta atingida na confirmação.
- **Liberação depende da forma de pagamento**: com a regra "exige recebimento", a comissão é paga em parcelas,
  proporcional ao recebido; sem a regra, é paga direto sobre o total da venda.
  => O perfil financeiro global `META_E_LIBERACAO / SOMENTE_LIBERACAO` do prompt de coordenação foi **descartado**
  (a spec 12.3 registra isso). **Codex: confirmar se concorda**, pois contraria o texto da coordenação.
- A regra de comissão deve ter uma única fonte (a tela Regras de comissão); o cadastro do vendedor deixou de editá-la.
- Retroatividade (prévia, reautenticação) e aprovações de venda: **fora desta entrega**.

## 3. Mudanças por área (arquivos)

### 3.1 Travel Lite — backend (`services/api-lite`)

| Área | Arquivos | O que mudou |
| --- | --- | --- |
| Arredondamento | `src/money.ts` (novo); `finance.ts`, `routes/{cash-flow,dashboard,reports,sale-costs,sales,sellers}.ts` | `roundMoney` (centavos, meio afastando de zero, remove ruído de ponto flutuante) substituiu 17 usos de `Math.round(x*100)/100`. Ficaram de fora: `reports.ts:466` (percentual de margem), `validation.ts`, `imports.ts`, `sales-analytics.ts` |
| Comissão paga | `routes/cash-flow.ts` (`POST /payables/:id/pay`) | comissão vira `PAID`, evento `COMMISSION_PAID` e outbox só quando o payable fica `PAID`; parcial mantém `APPROVED` |
| Auditoria | `src/audit-log.ts` | `REQUIRED_AUDIT_EVENTS` (COMMISSION_APPROVED/OVERRIDE/PAID, EXPENSE_CREATED/PAID, PAYMENT_RECEIVED/REVERSED, COMMISSION_RULE_CREATED/REVISED/ARCHIVED) gravam **sem SAVEPOINT**: falha de auditoria derruba a transação. Os demais eventos continuam best-effort |
| Duplicidade | `routes/cash-flow.ts` (`POST /payables` recusa `commission_id`); `migrations-travel-lite/008` | índice único parcial `ux_payables_active_commission (tenant_id, commission_id)` onde não cancelado; a migração aborta se já houver duplicidade |
| Cancelar venda | `routes/sales.ts` | cancela o payable de comissão com `paid_amount = 0`; se houver pagamento parcial, responde 409 (decisão D8 pendente) |
| Motor | `src/commission-engine.ts` (novo) | seleção determinística (vendedor+categoria > vendedor > padrão+categoria > padrão; maior `effective_from` <= data da venda), cálculo puro (PERCENTAGE total/excedente, FIXED, NONE, progressivo por faixas), `computeCommissionForSale`, `appendRuleVersion`, `mirrorSellerRule` |
| Regras | `routes/commission-rules.ts` (novo); `src/app.ts`; `src/access.ts` (permissão `commissions.rules_manage`) | GET lista/detalhe (vendedor só vê as aplicáveis), POST regra, POST versão (motivo obrigatório, **sem data passada**), POST arquivar |
| Venda/vendedor | `routes/sales.ts`, `routes/sellers.ts` | confirmação usa o motor (snapshot com regra, versão, faixas, `calc_version`); PATCH/POST de vendedor espelham os campos `commission_*` como nova versão; recálculo de `PENDING_RULE` usa o motor |
| Liberação | `routes/financial-catalog.ts`, `routes/commissions.ts`, `finance.ts` (`loadCommissionRelease`), `routes/cash-flow.ts`, `routes/sales.ts` | `payment_methods.requires_receipt`; `seller_commissions.release_mode` congelado na confirmação; `/payables/:id/pay` limita ao liberado (= comissão x recebido/total dos recebíveis não cancelados) menos o já pago; `/commissions` devolve `release_mode` e `released_amount` |

### 3.2 Travel Lite — migrações (`infrastructure/migrations-travel-lite`, todas aditivas)

- `008_payable_commission_unique.sql` — índice único + guarda contra duplicidade.
- `009_commission_rules.sql` — `commission_rules` (um escopo ativo por vendedor+categoria via índice com COALESCE),
  `commission_rule_versions` (append-only: runtime só SELECT/INSERT), RLS/grants, permissão nova (ADMIN, MANAGER),
  **backfill**: cada vendedor com regra vira regra de escopo vendedor, versão 1 vigente desde 1970-01-01.
- `010_commission_rule_tiers.sql` — `progressive` + `commission_rule_tiers` (append-only).
- `011_commission_release_by_receipt.sql` — `payment_methods.requires_receipt`, `seller_commissions.release_mode`.

### 3.3 Travel Lite — front (`apps/travel-lite`)

- Novos: `src/commissionRules.ts`, `src/pages/CommissionRulesPage.tsx` (rota `/regras-comissao`).
- Alterados (desta entrega): `App.tsx`, `menu.ts`, `pages/SellersPage.tsx` (campos antigos removidos; bloco "Comissão" somente leitura +
  link `?vendedor=<id>`), `pages/CatalogPage.tsx` (opção na forma de pagamento), `pages/CommissionsPage.tsx` (coluna Liberação),
  `styles.css`, `App.test.tsx` (entrada de menu).
- **Não são desta entrega** (trabalho paralelo de CEP no mesmo checkout): `src/api.ts`, `pages/CustomersPage.tsx`,
  `CustomerCepField*`, `services/api-lite/src/routes/customers.ts` (+ `cep*`).

### 3.4 Travel Platform Full

- `services/api/src/payroll.ts`: `payPayrollEntry` agora só **cria** a conta a pagar; a folha continua `APPROVED`; recusa segunda obrigação e
  líquido <= 0; `approve`/`pay` com `FOR UPDATE`; entrada expõe `payableId`.
- `services/api/src/financial.ts` (`refreshPayableStatus`): payable `PAID` -> folha `PAID` + `paid_at`; baixa parcial/desfeita -> volta a `APPROVED`.
- `infrastructure/migrations/099_payroll_payable_unique.sql`: índice único parcial `(agency_id, payroll_entry_id)`; aborta se houver duplicidade.
- `packages/domain/types.ts` (`payableId`), `apps/agency` (`lib/api.ts`, `PayrollPage.tsx`: botão "Gerar conta a pagar", status "Aguardando pagamento").
- Testes: 6 novos em `services/api/tests/financial.test.ts`.

### 3.5 Documentação

`docs/travel-lite/COMMISSION-ENGINE-SPEC.md` (spec; seção 12 registra as fases 3 e 4 e as decisões),
`docs/adr/ADR-LITE-COMMISSION-001-motor-de-comissoes.md` (**proposta**), `docs/travel-lite/ACCESS-CONTROL.md` (permissão nova).

## 4. Comportamento resultante (para conferir contra a sua expectativa)

- **Comissão**: valor decidido na confirmação da venda. Progressiva: acumulado do vendedor no mês civil (vendas CONFIRMED/PARTIALLY_PAID/PAID,
  exceto a própria venda, restritas à categoria da regra se ela tiver) é fatiado nas faixas; cada fatia usa a taxa da sua faixa.
  Comissões anteriores **nunca** são reescritas pela subida de faixa. Trava `pg_advisory_xact_lock` por tenant+vendedor+mês.
- **Liberação**: `ON_SALE` (padrão) paga direto; `ON_RECEIPT` limita cada pagamento a `liberado - já pago`. Estorno de recebimento reduz o liberado.
- **Regras**: revisão cria nova versão; vale a partir de `effective_from` (hoje ou futuro); versões nunca são alteradas.
- **Auditoria**: criar/revisar/arquivar regra e eventos financeiros falham fechado.

## 5. Pontos que o Codex deve examinar com atenção (riscos e escolhas contestáveis)

1. **Acúmulo da meta depende da ordem de confirmação** e é calculado uma vez, na confirmação. Cancelar ou editar uma venda depois **não**
   recalcula as comissões das vendas seguintes; vendas retroativas (data em mês passado) só enxergam o que já estava confirmado. É coerente com
   "nunca reescrever", mas é uma escolha. `PATCH /sales/:id` após a confirmação não recalcula comissão (comportamento anterior, não mexido).
2. **Chave do advisory lock** usa `hashtext(text)` (32 bits): colisão só serializa a mais, não corrompe; confirmar se é aceitável.
3. **Espelho do vendedor (dual-write)**: a primeira versão criada pelo cadastro legado vigora desde 1970-01-01 (equivale ao comportamento
   antigo, que ignorava datas); as seguintes valem de hoje. A API de vendedores ainda aceita `commission_*` por compatibilidade
   (importações). Avaliar se isso deve ser removido ou bloqueado.
4. **`ON_RECEIPT` + override manual** (`PATCH /commissions/:id`): o valor da comissão pode mudar depois de o payable existir; o payable não é
   ajustado (problema anterior à entrega, agravado pela liberação proporcional). O fluxo de ajuste negativo/saldo a compensar (D8) **não existe**.
5. **Recebimento estornado depois de a comissão ser paga**: o liberado cai abaixo do pago; nada impede nem registra o excedente. Falta o fluxo D8.
6. **Venda com mais de uma forma de pagamento**: o modelo tem uma `payment_method_id` por venda; liberação usa a soma dos recebíveis da venda.
7. **`ENGINE_CALC_VERSION` permaneceu 1** (progressivo é aditivo, sem alterar snapshots antigos). Confirmar a política de versionamento.
8. **Migrações 008/099 abortam se houver duplicidade**; foram aplicadas só no banco local de desenvolvimento e nos bancos de teste.
   Antes de qualquer ambiente real, rodar a verificação de duplicidade manualmente.
9. **Auditoria fail-closed** muda o perfil de disponibilidade: qualquer falha em `audit_logs` aborta a operação financeira. Intencional; revisar a lista.
10. **Substituição de `Math.round`** por `roundMoney` (17 pontos): diferenças possíveis só em casos de meio centavo/ruído binário e negativos.
11. **Folha do Full**: não há rota para desfazer baixa nem cancelar o payable de folha; o retorno a `APPROVED` está no código de sincronização mas sem fluxo
    que o acione. Continuam **sem tratamento** os achados F2 (competência da comissão por `created_at`), F7 (descontos apagáveis após fechamento),
    F9 (gerente lê toda a folha), F11 (sem auditoria) e F12 (módulo sem testes além dos novos).
12. **Aprovação de usuário** das migrações foi explícita para 008–011 no banco local (script `travel-lite-migrate.cjs`); o `AGENTS.md` proíbe
    migrar sem autorização — ver seção 8.

## 6. Verificação executada

| Escopo | Resultado |
| --- | --- |
| `services/api-lite` (suíte inteira) | **220/222** passam. As 2 falhas (`tests/catalog.test.ts` "rejects a user_id from another tenant" e `tests/customers.test.ts` "rejects an invalid CPF with 400") esperam mensagem em inglês e recebem português — vêm do trabalho paralelo de tradução de erros/CEP, **não** desta entrega (não investigado além disso) |
| `apps/travel-lite` | **128/128** passam; `tsc` e `eslint` limpos |
| `services/api-lite` | `tsc` e `eslint` limpos |
| `services/api` Full | `financial` (12), `financial-http` e `partners` (16) passam; `tsc` limpo; `eslint` sem erros (avisos antigos de `any`) |
| Navegador | só o layout do editor de faixas foi conferido (marcação real + CSS construído, página estática). **Nenhum fluxo logado foi exercitado no navegador** |

Testes novos principais (api-lite): `commission-rules.test.ts` (13), `commission-progressive.test.ts` (12, inclui concorrência, mês seguinte,
cancelamento, append-only), `commission-release.test.ts` (6), `money.test.ts` (3), +2 em `sales.test.ts`, +3 em `commissions.test.ts`.
Front: `CommissionRulesPage.test.tsx` (14), `SellersPage.test.tsx` (9), `CommissionRelease.test.tsx` (3).

## 7. Estado do ambiente local (o que foi alterado fora do código)

- Banco local `travel-lite-postgres` (porta 55436, banco `travel_lite`): migrações **008, 009, 010, 011 aplicadas**
  (script `scripts/travel-lite-migrate.cjs`, com `MIGRATIONS_DATABASE_URL` local). 5 regras migradas do legado existem agora.
- API local `travel-lite-api` (http://127.0.0.1:4010): reconstruída 4 vezes com
  `docker compose -p travel-lite -f docker-compose.travel-lite.yml up -d --build --no-deps api`. O `travel-lite-start.ps1` **falha** neste
  host porque o contêiner do Postgres pertence a outro projeto do Compose (`travel-lite` com working dir `.worktrees/travel-lite`);
  por isso o Postgres e o volume nunca foram recriados. A imagem inclui também as mudanças não commitadas do trabalho de CEP.
- Banco de teste: a porta 55437 está em faixa reservada pelo Windows (`netsh interface ipv4 show excludedportrange`);
  recriei o contêiner descartável `travel-lite-postgres-test` na porta 55600 e rodei os testes com
  `LITE_TEST_ADMIN_URL`/`LITE_TEST_RUNTIME_URL`. O `docker-compose.travel-lite-test.yml` **não** foi alterado.
- Teste do Full usa `travel-platform-postgres-local` (porta 55432); o contêiner é recriado/removido pelo próprio teste.
- Nenhum acesso a banco remoto, `.env`, produção, Render, commit, push ou deploy.

## 8. Divergências em relação ao pacote de coordenação (transparência)

- O prompt da folha e a coordenação **proibiam implementar** nesta rodada; o usuário autorizou depois, por mensagens explícitas na conversa
  ("pode implementar", "o codex está sem tokens pode executar a demanda", aprovação de cada fase). As aplicações de migração no banco local
  também foram autorizadas explicitamente, uma a uma.
- Migrações novas foram **numeradas por mim** (Lite 008–011, Full 099). Se o Codex tinha numeração reservada, há risco de colisão — conferir.
- O perfil financeiro global foi substituído por regra na forma de pagamento (seção 2).

## 9. Relatórios e documentos relacionados

- `.claude/RELATORIO-LITE-FOLHA-2026-10-22.md` — auditoria Full x Lite e proposta de folha gerencial (HOLD, nada implementado).
- `.claude/RELATORIO-LITE-CORRECOES-FINANCEIRAS-2026-10-22.md` — as 4 correções e a folha do Full.
- `.claude/RELATORIO-LITE-SPEC-COMISSOES-2026-10-22.md` — fases 1 a 4 e ajustes pós-uso.
- `docs/travel-lite/COMMISSION-ENGINE-SPEC.md`, `docs/adr/ADR-LITE-COMMISSION-001-motor-de-comissoes.md`.
- `.opencode/RELATORIO-LITE-CEP-2026-10-22.md` — frente de CEP (outro agente; não revisada por mim).

## 10. Pendências e próximos passos sugeridos

1. Codex revisar a seção 5 e decidir: aceitar o ADR, contestar o descarte do perfil global, definir D8 (saldo a compensar).
2. **Fase 5**: retroatividade com prévia, confirmação, reautenticação própria do aprovador, auditoria (spec seção 6).
3. **D7**: bônus e teto por competência.
4. **Aprovações de venda** (cancelamento/alteração) — não iniciado; ver coordenação.
5. **Folha gerencial do Lite** — só começa com o contrato comissão↔obrigação fechado; propostas e perguntas Q1–Q4, Q8 em `RELATORIO-LITE-FOLHA`.
6. Testes e2e logados no navegador; texto na página de ajuda sobre regras e liberação.
7. Resolver as 2 falhas de mensagem em português (dono: trabalho de CEP/tradução de erros).
8. Antes de qualquer ambiente real: checar duplicidades (008/099), revisar o backfill da 009, decidir o plano de publicação (a coordenação diz que
   a validação local **não** libera publicação online).

**HOLD**: nenhuma publicação, commit ou push até revisão do Codex e aprovação do usuário.
