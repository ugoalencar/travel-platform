# Customer Engagement Tracking

Rodada: rastreamento real de engajamento digital do cliente (Offers,
Proposals, Agency Communications, Customer App, cliques em CTA,
revisitas), exposto no Customer 360. Ver a taxonomia completa em
`docs/product/ENGAGEMENT_EVENT_TAXONOMY.md`.

## Princípio: Engagement ≠ CustomerInteraction

- **Engagement** = comportamento digital (o cliente abriu uma oferta,
  reabriu uma proposta, clicou num CTA). Automático, sem intervenção
  humana da agência.
- **CustomerInteraction** = ação humana/comercial (um agente ligou para
  o cliente, registrou um follow-up). Sempre tem um `user_id` (staff)
  e um resumo (`summary`) escrito por uma pessoa.

Essas duas tabelas já existiam antes desta rodada e continuam
completamente separadas — nenhuma foi fundida ou alterada
estruturalmente para se parecer com a outra.

## Fase 0 — o que a auditoria encontrou

Antes de qualquer migration, foi auditado: `engagements`,
`customer_interactions`, `audit-log.ts`, customer portal, rotas/páginas
de offer/proposal/communication, Customer 360, tracking existente,
RLS/RBAC, `external_user_id`/`customer_id`, e vínculos com
campaign/publication.

Achados principais:

- **`engagements` já existia** (`014_offer_growth_foundation.sql`,
  estendida em `076_engagement_type_interest.sql`) — tabela
  tenant-scoped, RLS `FORCE`, com `offer_id`, `customer_id`,
  `campaign_id`, `publication_id`, `opportunity_id`,
  `external_user_id`, `occurred_at`, `channel`. Construída
  originalmente para engagement social (comentário, clique de
  campanha), mas já vinha sendo reaproveitada para o CTA "Tenho
  interesse" do Customer App (`EngagementType.INTEREST`).
- **Nenhum evento `*_VIEWED` existia** — o enum `EngagementType` tinha
  `COMMENT, MESSAGE, CLICK, FORM, QR, COUPON_REQUEST, INTEREST`, e zero
  ocorrências de `OFFER_VIEWED`/`trackEvent`/`pageview` em todo o
  backend ou no Customer App.
  - **Conclusão**: não era necessário criar uma tabela de analytics
    nova. Bastava (1) adicionar os novos valores ao enum
    `EngagementType`, (2) adicionar as colunas `proposal_id`,
    `trip_id`, `communication_id` que faltavam (só `offer_id` já
    existia), e (3) expor rotas para gravar esses eventos a partir do
    Customer App.
- `GET /engagements` (staff) já existia, mas atrás de
  `requireEntitlement(SOCIAL_AUTOMATION)` — um gate de feature paga que
  não faz sentido para o Customer 360 (visibilidade de CRM básica não
  deveria depender de um addon de automação social). Por isso o
  Customer 360 usa uma rota nova e separada
  (`GET /commercial/engagements`), sem esse gate.
- `agency_communications` (Central de Comunicação, criada em rodada
  anterior) não tinha nenhuma coluna ou rota de tracking.
- O Customer App já tinha um `CommunicationsBanner` funcionando na Home
  (`CustomerHomePage.tsx`), mas sem nenhum tracking de visualização ou
  clique.

## O que foi implementado

### Migrations (2 arquivos, sem tabela nova)

- `086_engagement_tracking.sql` — adiciona os 8 novos valores de
  `EngagementType` (`OFFER_VIEWED`, `OFFER_REVISITED`,
  `PROPOSAL_VIEWED`, `PROPOSAL_REVISITED`, `COMMUNICATION_VIEWED`,
  `COMMUNICATION_CTA_CLICKED`, `CUSTOMER_HOME_VIEWED`, `TRIP_VIEWED`).
- `087_engagement_tracking_columns.sql` — adiciona `proposal_id`,
  `trip_id`, `communication_id` (todas nullable, com FK tenant-scoped
  para `proposals`/`trips`/`agency_communications`), e o índice
  `engagements_agency_customer_type_idx (agency_id, customer_id, type,
  occurred_at DESC)`, usado tanto pela checagem de revisita quanto pela
  agregação do Customer 360.

### Backend

- `services/api/src/customer-engagement.ts` (novo) — toda a lógica de
  gravação: valida propriedade da entidade, decide
  VIEWED/REVISITED/suprimido, grava via `insertEngagement` (reaproveita
  `services/api/src/engagements.ts` integralmente).
- `services/api/src/engagements.ts` — estendido com as 3 novas colunas
  e a função `listCustomerEngagements` (tenant+customer scoped, sem
  entitlement gate).
- `services/api/src/agency-communications.ts` — nova função
  `getVisibleCommunicationById`, mesma regra de visibilidade de
  `listVisibleCommunications`, escopada por id.
- Rotas novas em `services/api/src/routes/customer-portal.ts`:
  - `POST /customer-api/offers/:id/viewed`
  - `POST /customer-api/proposals/:id/viewed`
  - `POST /customer-api/trips/:id/viewed`
  - `POST /customer-api/communications/:id/viewed`
  - `POST /customer-api/communications/:id/cta-clicked`
  - `POST /customer-api/home/viewed`
- Rota nova em `services/api/src/routes/commercial-cockpit.ts`:
  - `GET /commercial/engagements?customerId=` — staff-side, `VIEWER`+,
    sem entitlement gate (ver Fase 0 acima).

### Frontend (Customer App)

- `apps/customer/src/lib/customerApi.ts` — 6 funções `track*`,
  fire-and-forget (nunca bloqueiam a navegação nem mostram erro ao
  cliente; a falha é engolida silenciosamente).
- `CustomerOfferDetailsPage.tsx`, `CustomerProposalDetailsPage.tsx`,
  `CustomerTripDetailsPage.tsx` — chamam o tracking correspondente
  assim que os dados carregam com sucesso.
- `CustomerHomePage.tsx` — chama `trackCustomerHomeViewed()` ao
  carregar, e o `CommunicationsBanner` chama
  `trackCommunicationViewed()` para cada comunicado renderizado e
  `trackCommunicationCtaClicked()` no clique do CTA.
  - **Simplificação documentada (Fase 5)**: a view do banner é
    registrada assim que ele renderiza, não com um
    `IntersectionObserver` por card. Como o banner fica no topo da
    Home (praticamente sempre no viewport inicial), a detecção real de
    viewport foi julgada complexidade desnecessária para este
    carrossel.

### Frontend (Agency — Customer 360)

- `apps/agency/src/lib/api.ts` — `listCustomerEngagements(customerId)`
  chamando `GET /commercial/engagements?customerId=`.
- `apps/agency/src/pages/CustomerDetailPage.tsx`:
  - **"Engajamento recente"** — novo card na aba Resumo, agregando
    visualizações por oferta/proposta (contagem + última
    visualização), sem score, sem recomendação — só os números reais.
  - **Aba "Histórico"** — eventos digitais entram na mesma timeline
    dos eventos comerciais/administrativos, mas com um badge
    "Digital" (ciano) ou "Comercial" (âmbar) para nunca confundir os
    dois. Interações humanas (`customer_interactions`) recebem o badge
    "Comercial"; os demais eventos administrativos (endereço,
    documento, etc.) não recebem badge — só a distinção Digital vs
    Comercial pedida pela spec é marcada.

## Fase 7 — Deduplicação (implementação)

Ver a seção "Regra de revisita" em
`docs/product/ENGAGEMENT_EVENT_TAXONOMY.md` — resumo: janela de 30
minutos, uma consulta por gravação, sem Redis.

## Fase 8 — Privacidade

Nenhum destes eventos grava: conteúdo de proposta/oferta, texto de
documento, senha/token, querystring, ou user-agent bruto. A única
metadata gravada é a que a tabela `engagements` já suportava:
`channel` (sempre a string fixa `'customer_portal'` para estes
eventos) e os ids da entidade relacionada. Nenhum `raw_payload` é
enviado por estes fluxos.

## Fase 10 — Agregação (Customer 360)

`EngagementSummaryCard` (frontend) calcula, a partir da lista de
engagements já carregada (sem chamada extra por card): contagem de
visualizações por oferta/proposta e o timestamp da última. Nenhum
score, nenhuma classificação "cliente quente" — apenas números reais.

## Fase 11 — Offer Detail

**Não implementado nesta rodada.** A prioridade explícita era o
Customer 360; adicionar "Visualizações / Clientes únicos" na tela de
detalhe da Offer (lado agência) fica como gap documentado — a função
`listCustomerEngagements` teria que virar `listOfferEngagements`
(troca trivial do filtro), mas a tela em si não foi tocada.

## Fase 12 — Segmentação futura

**Não implementado.** Documentado aqui como possibilidade futura:
filtros como "visualizou oferta X" ou "não abriu proposta nos últimos 7
dias" no Segmentador exigiriam uma nova consulta de agregação por
segmento — fora do escopo desta rodada, que é só tracking + exibição no
Customer 360.

## Fase 9 (audit/histórico de tarefas, gap pré-existente)

Não relacionado a esta rodada especificamente, mas reafirmado: nenhuma
infraestrutura nova de audit-log foi criada para os eventos de
engagement — eles vivem inteiramente em `engagements`, que já não
passava por `audit-log.ts` antes desta rodada tampouco.

## Testes

`services/api/tests/customer-engagement-tracking.test.ts` (15 testes,
todos passando): OFFER_VIEWED, supressão de duplicata, OFFER_REVISITED
(via linha antiga simulada), PROPOSAL_VIEWED, PROPOSAL_REVISITED,
COMMUNICATION_VIEWED + CTA cliques nunca suprimidos, TRIP_VIEWED +
CUSTOMER_HOME_VIEWED, bloqueio cross-tenant (Agência B não grava
evento para entidade da Agência A), entidade inexistente bloqueada
(404, nada gravado), proposta de outro cliente do mesmo tenant
bloqueada (404), requisição de cliente não autenticado bloqueada
(401), agregação do Customer 360 escopada corretamente por
tenant+customer, agregação por cliente único (dois clientes vendo a
mesma oferta geram linhas separadas), persistência após releitura, e
RBAC/autenticação da rota staff (401 sem sessão, 400 sem
`customerId`).

## QA local (Fase 18)

Realizado manualmente contra o ambiente local (Customer App + Agency
rodando via `npm run dev` nos respectivos workspaces, backend local):
login no Customer App → Home (comunicados aparecem e a view é
registrada) → abrir uma Offer → voltar → abrir de novo (dentro da
janela, sem inflar) → abrir uma Proposal → clicar no CTA de um
comunicado. Depois, no lado Agency: Customer 360 do mesmo cliente →
aba Resumo mostra "Engajamento recente" com as contagens corretas →
aba Histórico mostra os mesmos eventos com o badge "Digital",
intercalados corretamente por data com qualquer interação comercial
existente.

## Gaps futuros

- `DOCUMENT_VIEWED` (sem tela de detalhe de documento no Customer App
  ainda).
- Offer Detail (lado agência) mostrando visualizações/clientes únicos.
- Integração com Segmentação ("visualizou X", "não abriu Y").
- Consolidação futura com o próprio conceito de "próxima ação" (ver
  `docs/product/NEXT_ACTION_CONSOLIDATION_AUDIT.md` de uma rodada
  anterior) — um engagement de alta intensidade poderia um dia alimentar
  uma tarefa sugerida, mas isso é automação/recomendação, explicitamente
  fora de escopo aqui.
