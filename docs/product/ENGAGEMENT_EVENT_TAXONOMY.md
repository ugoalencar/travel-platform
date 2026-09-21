# Taxonomia de Eventos de Engajamento

Rodada Customer Engagement Tracking. Lista fechada de eventos — não
adicionar eventos novos "por precaução"; cada evento aqui está
conectado a uma tela real do Customer App.

## Eventos

| Evento | Quando é gravado | Entidade relacionada |
|---|---|---|
| `OFFER_VIEWED` | Primeira visualização de uma oferta pelo cliente | `offer_id` |
| `OFFER_REVISITED` | Visualização da mesma oferta após a janela de revisita (30 min) | `offer_id` |
| `PROPOSAL_VIEWED` | Primeira visualização de uma proposta pelo cliente | `proposal_id` |
| `PROPOSAL_REVISITED` | Visualização da mesma proposta após a janela de revisita | `proposal_id` |
| `COMMUNICATION_VIEWED` | Banner de comunicado renderizado na Home do Customer App | `communication_id` |
| `COMMUNICATION_CTA_CLICKED` | Clique no CTA de um comunicado | `communication_id` |
| `CUSTOMER_HOME_VIEWED` | Acesso à Home do Customer App | nenhuma (evento sem entidade) |
| `TRIP_VIEWED` | Visualização dos detalhes de uma viagem | `trip_id` |

Todos os eventos usam a tabela `engagements` já existente
(`014_offer_growth_foundation.sql`), com os tipos acima adicionados via
`086_engagement_tracking.sql` e as colunas `proposal_id`, `trip_id`,
`communication_id` adicionadas via
`087_engagement_tracking_columns.sql`. Nenhuma tabela nova foi criada.

## Regra de revisita

Uma segunda visualização do mesmo par (cliente, entidade) só vira
`*_REVISITED` se **mais de 30 minutos** tiverem se passado desde o
último evento de visualização daquela entidade por aquele cliente.
Dentro da janela de 30 minutos, a segunda visualização é **suprimida
por completo** — nenhuma linha nova é gravada.

Isso evita inflar a contagem por:
- reload da página,
- polling,
- re-render do React,
- prefetch,
- health checks / retries de rede.

`TRIP_VIEWED`, `COMMUNICATION_VIEWED` e `CUSTOMER_HOME_VIEWED` não têm
uma variante "revisitado" na taxonomia — o mesmo tipo é reutilizado
tanto na primeira visualização quanto nas seguintes, sempre respeitando
a mesma janela de deduplicação de 30 minutos.

`COMMUNICATION_CTA_CLICKED` é a única exceção: cliques **nunca são
suprimidos**. Um segundo clique no mesmo CTA é um sinal real e distinto
(o cliente abriu o link de novo depois de navegar para outro lugar), ao
contrário de uma visualização passiva.

## Por que 30 minutos, sem Redis

A verificação de janela é uma única consulta a `engagements`
(`SELECT occurred_at ... ORDER BY occurred_at DESC LIMIT 1`), usando o
índice `engagements_agency_customer_type_idx`. Não há dependência de
Redis, sessão ou cache — cada verificação é uma leitura direta contra o
Postgres, na mesma transação que grava o novo evento (ou decide não
gravar nada). 30 minutos foi uma escolha deliberadamente simples: longa
o bastante para não confundir reload/prefetch com uma revisita real,
curta o bastante para que um retorno genuíno horas depois sempre conte.

## Identidade do evento (Fase 2)

Todo evento gravado por este fluxo carrega:
- `agency_id` — nunca vindo do browser, sempre do contexto de tenant
  autenticado (`getAgencyId()`).
- `customer_id` — nunca vindo de parâmetro de rota, sempre do contexto
  de sessão do cliente autenticado (`getCustomerId()`).
- a entidade relacionada (`offer_id`/`proposal_id`/`trip_id`/
  `communication_id`), sempre revalidada contra o backend antes de
  gravar (ver "Validação de propriedade" abaixo) — nunca um id cru do
  frontend é confiado sem essa revalidação.
- `occurred_at` (timestamp real do servidor).
- `channel` — sempre `'customer_portal'` para estes eventos (distingue
  de engagements vindos de conectores de canal social/campanha).

`external_user_id` (campo pré-existente da tabela, para eventos vindos
de conectores externos) não é usado por nenhum destes eventos — só faz
sentido para engagement anônimo vindo de campanhas sociais.

## Validação de propriedade (Fase 14)

Nenhum evento é gravado sem antes revalidar a entidade:
- `OFFER_VIEWED`/`REVISITED`: `getAvailableOfferById` — a oferta precisa
  existir, pertencer ao tenant do cliente autenticado, estar `ACTIVE` e
  dentro da validade.
- `PROPOSAL_VIEWED`/`REVISITED`: `getMyProposalById` — a proposta
  precisa pertencer ao mesmo `agency_id` **e** ao mesmo `customer_id`
  do cliente autenticado (não apenas ao tenant).
- `COMMUNICATION_VIEWED`/`CTA_CLICKED`: `getVisibleCommunicationById` —
  o comunicado precisa pertencer ao tenant, estar `ACTIVE` e dentro da
  janela `visible_from`/`visible_until`.
- `TRIP_VIEWED`: `getMyTripById` — mesma regra de propriedade da
  proposta.
- `CUSTOMER_HOME_VIEWED`: não tem entidade a validar; a única exigência
  é uma sessão de cliente autenticada válida.

Qualquer id que não passe nessa validação retorna 404 e **nada é
gravado** — nunca 403 revelando que a entidade existe em outro tenant.

## Fora de escopo nesta rodada

`DOCUMENT_VIEWED` foi cogitado na especificação original, mas o
Customer App não tem uma tela de detalhe por documento (apenas uma
listagem em `CustomerDocumentsPage.tsx`) — implementar esse evento sem
uma tela de destino real violaria a regra de "não rastrear cada clique
irrelevante". Fica documentado como gap para quando existir uma tela de
detalhe de documento.
