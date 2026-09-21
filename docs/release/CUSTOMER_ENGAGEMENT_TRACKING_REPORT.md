# Customer Engagement Tracking — Relatório de Entrega

- HEAD inicial: `7a77c6d` (docs(release): registrar commit e CI real do
  Tasks UI + Customer 360 Quick Wins).
- Migrations novas: 2 — `086_engagement_tracking.sql` (novos valores de
  `EngagementType`), `087_engagement_tracking_columns.sql`
  (`proposal_id`/`trip_id`/`communication_id` + índice). Nenhuma tabela
  nova — reaproveita 100% a `engagements` já existente
  (`014_offer_growth_foundation.sql`).

## Auditoria (Fase 0)

Ver `docs/product/CUSTOMER_ENGAGEMENT_TRACKING.md` (seção "Fase 0") e
`docs/product/ENGAGEMENT_EVENT_TAXONOMY.md`. Resumo: `engagements` já
existia, tenant-scoped, RLS `FORCE`, com `offer_id`/`customer_id`
prontos, mas sem os tipos `*_VIEWED`; nenhuma tabela nova foi
necessária.

## Eventos implementados

`OFFER_VIEWED`, `OFFER_REVISITED`, `PROPOSAL_VIEWED`,
`PROPOSAL_REVISITED`, `COMMUNICATION_VIEWED`,
`COMMUNICATION_CTA_CLICKED`, `CUSTOMER_HOME_VIEWED`, `TRIP_VIEWED`.
`DOCUMENT_VIEWED` foi deliberadamente **não implementado** — o Customer
App não tem tela de detalhe por documento, só uma listagem; ver gap
documentado.

Regra de revisita: janela de 30 minutos, sem Redis, uma consulta por
gravação (índice `engagements_agency_customer_type_idx`). Cliques em
CTA de comunicado nunca são suprimidos como duplicata.

## Endpoints

Customer App (`/customer-api/*`, todos exigem sessão de cliente
autenticada, todos revalidam propriedade da entidade antes de gravar):
- `POST /customer-api/offers/:id/viewed`
- `POST /customer-api/proposals/:id/viewed`
- `POST /customer-api/trips/:id/viewed`
- `POST /customer-api/communications/:id/viewed`
- `POST /customer-api/communications/:id/cta-clicked`
- `POST /customer-api/home/viewed`

Agency (staff, `VIEWER`+, sem gate de entitlement):
- `GET /commercial/engagements?customerId=` — usado pelo Customer 360.

## Customer 360 (mudanças)

- Novo card **"Engajamento recente"** na aba Resumo (contagem de
  visualizações por oferta/proposta + última visualização — sem score,
  sem recomendação).
- Aba **Histórico**: eventos digitais agora aparecem na timeline junto
  com os comerciais/administrativos, distinguidos por um badge
  "Digital" (ciano) ou "Comercial" (âmbar) — nunca misturados
  visualmente sem essa distinção.

## Testes

`services/api/tests/customer-engagement-tracking.test.ts` — **15
testes, todos passando**: OFFER_VIEWED, supressão de duplicata,
OFFER_REVISITED, PROPOSAL_VIEWED, PROPOSAL_REVISITED,
COMMUNICATION_VIEWED + cliques de CTA nunca suprimidos, TRIP_VIEWED +
CUSTOMER_HOME_VIEWED, bloqueio cross-tenant, entidade inexistente
bloqueada, proposta de outro cliente do mesmo tenant bloqueada,
requisição não autenticada bloqueada, agregação do Customer 360 escopada
por tenant+customer, agregação por cliente único, persistência após
releitura, RBAC/autenticação da rota staff (401/400).

Também corrigidos, por efeito colateral necessário (não regressão de
produto): 3 arquivos de teste do frontend (`CustomerHomePage.test.tsx`,
`CustomerOfferDetailsPage.test.tsx`, `CustomerTripDetailsPage.test.tsx`)
que mockavam `customerApi.ts` com uma lista fixa de funções — as novas
funções `track*` precisaram ser adicionadas a esses mocks.

## Gates executados

| Gate | Resultado |
|---|---|
| `npm run lint` (monorepo) | ✅ 0 erros (apenas warnings pré-existentes não relacionados) |
| `npm run typecheck` (monorepo) | ✅ 0 erros |
| `npm run build` (monorepo) | ✅ todos os 7 pacotes buildaram |
| `npm run test:security` | ✅ 58/58 testes |
| `npm run test:db` | ✅ 9/9 testes |
| `apps/agency` — `npx vitest run` | ✅ 131/131 testes (19 arquivos) |
| `apps/customer` — `npx vitest run` | ✅ 542/542 testes (71 arquivos) |
| `services/api` — suíte completa (`CI=true npx vitest run`, sequencial) | ✅ 94/94 arquivos, 1604/1604 testes |

## QA local (Fase 18)

Realizado manualmente contra `npm run dev` local (Customer App +
Agency + backend local): login no Customer App → Home (comunicados
visíveis, view registrada) → abrir Offer → voltar → reabrir (dentro da
janela, sem inflar contagem) → abrir Proposal → clicar CTA de
comunicado. Depois, Agency → Customer 360 do mesmo cliente → aba Resumo
mostra "Engajamento recente" com as contagens corretas → aba Histórico
mostra os mesmos eventos com badge "Digital", intercalados
corretamente por data com as interações comerciais existentes.

## Débito / gaps futuros (documentados, não implementados)

- `DOCUMENT_VIEWED` — sem tela de detalhe de documento no Customer App.
- Offer Detail (lado agência) mostrando visualizações/clientes únicos —
  prioridade ficou no Customer 360.
- Integração com Segmentação ("visualizou X", "não abriu Y nos últimos
  7 dias") — documentada como possibilidade futura, não implementada.
- Score de propensão, IA, recomendação, automação comercial, alerta
  "cliente quente", campanha automática, notificação push,
  refatoração de Proposal, Day-by-Day, mudança no Segmentador — todos
  explicitamente fora de escopo por pedido.

## Deploy

**Não realizado nesta rodada**, conforme pedido explícito ("NÃO fazer
deploy automaticamente... a menos que o proprietário peça"). Código
pronto, CI verde, QA local concluído.

## Status

**CUSTOMER ENGAGEMENT TRACKING — PRONTO PARA REVISÃO LOCAL**
