# Relatório — especificação do motor de comissões (Lite)

Data: 2026-10-22. Branch `wip/organizacao-2026-10-20`. Sem código, sem migração, sem commit.

Entregues (somente documentação):
- `docs/travel-lite/COMMISSION-ENGINE-SPEC.md` — spec completa (estado atual verificado,
  modelo versionado, seleção/cálculo, perfil financeiro, política de recebimento,
  retroatividade com prévia/ajustes, integração com folha, permissões, auditoria, testes, fases).
- `docs/adr/ADR-LITE-COMMISSION-001-motor-de-comissoes.md` — ADR **proposta**.

Achado novo: cancelar venda marca a comissão como CANCELLED mas **não cancela o payable
aberto** (`services/api-lite/src/routes/sales.ts:749-753`); ele continua pagável. Entra na Fase 1.

Bloqueios: decisões D1–D9 da spec (data-base, faixa inteira vs. marginal, arredondamento,
período de meta, política de liberação por recebimento, bônus/teto, ajuste negativo, visibilidade).
Nada codificado até aprovação.

## Fase 1 implementada (api-lite)

- `services/api-lite/src/money.ts` — `roundMoney` única (centavos, meio afastando de zero,
  remove ruído de ponto flutuante: 1,005 → 1,01; nunca -0). Substituiu 17 usos de
  `Math.round(x*100)/100` em `finance.ts`, `routes/{cash-flow,dashboard,reports,sale-costs,sales,sellers}.ts`.
  Percentual de margem (`reports.ts:466`), `validation.ts`, `imports.ts` e `sales-analytics.ts`
  ficaram de fora (outra escala/validação).
- `routes/sales.ts` (cancelamento): cancela o payable de comissão em aberto (`paid_amount = 0`)
  junto com a comissão; se o payable já recebeu pagamento parcial, o cancelamento é recusado (409),
  pois o ajuste/recuperação depende da decisão D8 da spec.
- Testes: `tests/money.test.ts` (3), `tests/sales.test.ts` (+2: payable cancelado e não pagável;
  cancelamento recusado com pagamento parcial).
- Verificação: typecheck e lint limpos; suíte api-lite 190/192. As 2 falhas
  (`catalog.test.ts` "user of this tenant" e `customers.test.ts` "valid CPF") esperam mensagem
  em inglês e recebem português — vêm do trabalho paralelo de tradução de erros/CEP, não desta fase.

## Fase 2 implementada (backend api-lite; sem UI)

Decisões D1–D9 adotadas pelo usuário conforme as recomendações da spec.

- `migrations-travel-lite/009_commission_rules.sql`: `commission_rules` (um escopo ativo por
  vendedor+categoria; nulos = padrão da agência/todas) e `commission_rule_versions`
  (append-only: runtime só `SELECT, INSERT`); permissão `commissions.rules_manage` (ADMIN, MANAGER);
  legado: cada vendedor com regra vira regra de escopo vendedor, versão 1 vigente desde 1970-01-01.
  **Não aplicada em ambiente real.**
- `src/commission-engine.ts`: seleção determinística (vendedor+categoria > vendedor > padrão+categoria > padrão;
  maior `effective_from` ≤ data da venda), cálculo puro TOTAL/EXCESS/FIXED/NONE com `roundMoney`,
  snapshot com `rule_id`, `rule_version_id`, `calc_version`, `apply_on`.
- `routes/sales.ts`: a confirmação usa o motor (data-base = `sale_date`).
- `routes/sellers.ts`: PATCH/POST do vendedor espelham a regra como nova versão; recálculo de
  PENDING_RULE usa o motor.
- `routes/commission-rules.ts`: GET lista/detalhe (vendedor vê só as aplicáveis), POST regra,
  POST versão (motivo obrigatório, sem data passada), POST arquivar. Eventos de auditoria obrigatórios
  `COMMISSION_RULE_CREATED/REVISED/ARCHIVED`.
- Testes: `tests/commission-rules.test.ts` (13). Suíte api-lite 203/205; as 2 falhas são as mesmas
  de mensagem em português (catalog/customers), alheias a esta fase. Typecheck e lint limpos.
- Pendente: UI de regras; retroatividade (Fase 5); progressão/metas (Fase 3); perfil financeiro (Fase 4).

## UI de regras de comissão (apps/travel-lite)

- `src/pages/CommissionRulesPage.tsx` (rota `/regras-comissao`, menu "Regras de comissão" para quem tem
  `commissions.rules_manage`, `commissions.read_all` ou `commissions.read_own`): lista com escopo
  (vendedor/categoria), resumo da versão mais recente e vigência; histórico de versões; criar regra;
  nova versão (motivo obrigatório); arquivar (com confirmação). Sem `rules_manage` a página é só leitura
  (vendedor vê as regras que se aplicam a ele, conforme D9). Regras arquivadas não oferecem revisão.
- `src/commissionRules.ts`: tipos, `describeVersion` e `buildVersionPayload` (valida e monta o corpo
  da API; o servidor continua sendo a autoridade).
- Testes: `src/CommissionRulesPage.test.tsx` (10); `App.test.tsx` ajustado (nova entrada de menu para
  MASTER e vendedor). Suíte do app 112/112; typecheck e lint limpos.
- Não verificado no navegador (sem servidor de desenvolvimento nesta sessão); o servidor Marvelous UI
  estava sem conexão, então a tela segue as classes existentes do Lite (`lite-form`, `btn`, `lite-table-wrap`).
- Fora do escopo: texto na página de ajuda, progressão/metas (Fase 3).

## Fase 3 implementada (progressão por faixas de meta mensal)

- `migrations-travel-lite/010_commission_rule_tiers.sql`: `progressive` na versão + `commission_rule_tiers`
  (append-only). **Não aplicada em nenhum banco real; no banco local de desenvolvimento ainda não
  foi aplicada** (rodou só no banco de teste).
- `commission-engine.ts`: `computeCommissionForSale` (seleção + acumulado do mês + lock por vendedor/mês),
  fatiamento marginal, snapshot com `slices`. `routes/commission-rules.ts`: valida `tiers`
  (2 a 10 faixas, contíguas, começando em 0, última aberta, taxas 0 a 100) e devolve `progressive`/`tiers`.
- UI: checkbox "Comissão progressiva por meta mensal", editor de faixas (adicionar/remover), resumo
  na lista e no histórico.
- Testes: `commission-progressive.test.ts` (12, incl. concorrência, mês seguinte, cancelamento,
  append-only); UI +4 (14 na página). api-lite 214/216 (mesmas 2 falhas de mensagem em português);
  app 116/116; typecheck e lint limpos.
- Regra de recebimento por forma de pagamento registrada na spec §12.2 (Fase 4); pergunta em aberto
  sobre o perfil financeiro global.

## Ajustes pós-uso (layout da progressiva e redundância com o cadastro do vendedor)

- Layout: o editor de faixas usava `fieldset.field` (coluna flex) com linhas de `row-actions`, o que estourava a
  grade do formulário. Agora usa `fieldset.tier-editor` + `.tier-row` (grade de 4 colunas; 2 no celular) e a caixa
  "Comissão progressiva" alinhada. Conferido no navegador com o CSS construído (captura de tela da marcação real).
- Redundância: a regra de comissão agora tem UMA fonte, a página Regras de comissão. No cadastro do vendedor os campos
  antigos (tipo/percentual/valor fixo) saíram do formulário; no lugar há um bloco "Comissão" somente leitura com as
  regras que se aplicam ao vendedor (própria; senão, a padrão da agência) e o link "Definir ou revisar a regra deste
  vendedor" (`/regras-comissao?vendedor=<id>`, abre o formulário já com o vendedor escolhido). A coluna "Regra" da
  lista de vendedores também vem das regras. Quem não tem permissão de regras vê "Sem regra" e não há chamada à API de regras.
- Compatibilidade: a API de vendedores ainda aceita `commission_*` (importações/clientes antigos) e continua espelhando
  como nova versão, mas a tela deixou de enviá-los.
- Testes: `SellersPage.test.tsx` (9), `CommissionRulesPage.test.tsx` ajustado (Router). App 125/125; typecheck e lint limpos.
- Pendente: reconstruir a API local para disponibilizar a tela (pedido de autorização).

## Fase 4 implementada: liberação da comissão por forma de pagamento

- Regra do usuário: meta conta a venda inteira na confirmação; forma com "exige recebimento" paga a comissão em
  parcelas conforme o recebido; sem a regra, paga direto sobre o total. Perfil financeiro global descartado (spec 12.3).
- `migrations-travel-lite/011_commission_release_by_receipt.sql` (`payment_methods.requires_receipt`,
  `seller_commissions.release_mode`). **Não aplicada no banco local ainda** (só no banco de teste).
- API: flag em `/payment-methods`; confirmação congela `release_mode`; `/payables/:id/pay` limita ao liberado;
  `/commissions` devolve `release_mode` e `released_amount`.
- UI: opção na forma de pagamento (Cadastros) e coluna "Liberação" na lista de comissões.
- Testes: `commission-release.test.ts` (6: flag, direto na venda, parcelado por recebimento, meta pela venda inteira,
  política congelada, estorno). api-lite 220/222 (mesmas 2 falhas de mensagem); app 128/128; typecheck e lint limpos.
