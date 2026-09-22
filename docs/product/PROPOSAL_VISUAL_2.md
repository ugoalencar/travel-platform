# Proposal Visual 2.0

Rodada: evolução do `Proposal` de registro comercial simples para
proposta visual estruturada de viagem. Ver também
`docs/product/PROPOSAL_CONTENT_MODEL.md` (modelo de dados) e
`docs/product/PROPOSAL_CUSTOMER_EXPERIENCE.md` (experiência do
cliente).

## Princípio central preservado

- **Offer** = produto/oferta comercial reutilizável.
- **Proposal** = o que estamos oferecendo comercialmente a este cliente.
- **Booking** = reserva/contratação operacional.
- **Trip** = o que foi contratado/confirmado e será operado.

Nenhuma dessas entidades foi colapsada nem transformada em outra.
`Proposal` não virou CMS genérico, não virou Trip.

## Fase 0 — Auditoria final (o que já existia)

| Campo/capacidade | Proposal atual (antes) | Entidade reutilizável | Gap | Ação |
|---|---|---|---|---|
| Preço/desconto/total | `proposed_price`, `discount`, `total` (NUMERIC) | — | Nenhum | Reaproveitado integralmente, sem financeiro paralelo |
| Status | `ProposalStatus` (DRAFT/SENT/ACCEPTED/DECLINED/EXPIRED/CANCELLED) | — | Nenhum | Reaproveitado, nenhum enum novo |
| Capa/resumo | Não existia | — | Real | 6 colunas novas em `proposals` (088) |
| Galeria/imagem | Não existia (Offer tem só `image_url` raw) | `trip_photos` (secure_file_key) | Real | `proposal_media`, cópia do padrão trip_photos (091) |
| Conteúdo estruturado (seções/itens) | Não existia — `ProposalBuilderPage` tinha um estado local `itineraryItems` que nunca era persistido | — | Real, e o gap estava mascarado por UI enganosa | `proposal_sections` + `proposal_items` (089, 090); UI falsa removida |
| Prévia da agência | Placeholder (`EmptyState` fixo) | — | Real | `ProposalVisualPreview` real |
| Customer Viewer visual | Card simples (valores + condições) | — | Real | Reescrito, mobile-first |
| Tracking PROPOSAL_VIEWED/REVISITED | Já existia (rodada anterior) | `services/api/src/customer-engagement.ts` | Nenhum | Reaproveitado sem alteração |
| Duplicar proposta | Não existia | Padrão client-side de Offer (não backend) | Real | `duplicateProposal` real, com sections/items/media |
| Excursion/Air/Land como referência | Existiam, mas Air/Land são operacionais (pós-venda, presos a trip/booking) | `excursions` (catálogo pré-venda) | Parcial | `reference_type`/`reference_id` no schema, sem UI de vínculo nesta rodada (gap documentado) |
| Documento (anexo à proposta) | `customer_documents` é sobre identidade do cliente, não anexo | — | Real, mas fora de escopo | Não implementado — usar `proposal_media` para imagens cobre o essencial desta rodada |

Nenhuma tabela nova foi criada para algo que já existia — `proposals`
em si não foi recriada, só estendida (migration 088).

## Fase 1 — Modelo de conteúdo

`Proposal → ProposalSection → ProposalItem`, exatamente a estrutura
sugerida. Não é um page builder genérico — `ProposalSectionType` e
`ProposalItemType` são enums fechados. Detalhes completos em
`docs/product/PROPOSAL_CONTENT_MODEL.md`.

## Fase 2/3 — Capa e mídia

Campos de capa (`title`, `subtitle`, `destination_summary`,
`travel_period`, `traveler_summary`, `intro_text`) direto em
`proposals` (migration 088). Capa/galeria em `proposal_media`
(migration 091), reaproveitando 100% o padrão `secure_file_key` +
`file-storage.ts` já usado por `trip_photos` — nenhum sistema de DAM
novo, nenhuma URL absoluta como identidade.

## Fase 4 — Editor da proposta

`apps/agency/src/pages/proposals/ProposalEditorPage.tsx`
(`/proposals/:id/editor`), com abas Capa / Conteúdo / Mídia / Prévia:

- **Capa**: formulário para os 6 campos de capa.
- **Conteúdo**: adicionar/remover/reordenar seções (botões ▲▼, sem
  drag-and-drop — nenhuma biblioteca de dnd já existia no projeto e
  adicionar uma só para isso não se justificava), ocultar/mostrar
  seção do cliente, adicionar/editar/remover itens dentro de cada
  seção.
- **Mídia**: upload de imagens (define automaticamente a primeira como
  capa), grade de miniaturas, exclusão.
- **Prévia**: usa o mesmo componente `ProposalVisualPreview` que a
  aba "Prévia" standalone (`/proposals/:id/preview`) usa — a agência
  vê exatamente o que será renderizado, não uma aproximação.

Componentes de conteúdo mínimos implementados: Texto, Destino,
Transporte, Hospedagem, Experiência, Dia de itinerário, Inclusão,
Exclusão, Condição, Forma de pagamento, Imagem — cobrindo a lista
mínima pedida sem blocos extras sem uso real.

### Limpeza de UI morta

`ProposalBuilderPage` tinha um card "Itinerário" com
adicionar/remover itens que **nunca eram enviados ao backend** — só
alimentavam um "Total" calculado localmente que enganava o usuário
sobre o que seria realmente salvo. Removido nesta rodada (o Editor
visual é o lugar real para itinerário agora); os campos de preço,
markup/desconto, condições e observações continuam funcionando como
antes.

## Fase 5 — Itinerário (resumo comercial, não Day-by-Day operacional)

Seção do tipo `ITINERARY` com itens `ITINERARY_DAY` (`day_number` +
título + descrição) — exatamente o nível "Dia 1 / Dia 2 / Dia 3" do
exemplo da especificação. O Day-by-Day operacional completo
permanece fora de escopo, como pedido explicitamente.

## Fase 6 — Valores e condições

Continuam vindo do modelo comercial já existente
(`proposedPrice`/`discount`/`total`/`conditions`/`validUntil`) —
nenhum financeiro paralelo foi criado. "Formas de pagamento" pode ser
representado como uma seção `PAYMENT_OPTIONS` com itens de texto —
não existe hoje um modelo de parcelamento pré-venda reutilizável (o
`payment_schedule` existente é pós-venda, ligado a Sale/Booking), e
criar um novo ficaria fora do escopo desta rodada; documentado como
gap futuro.

## DTO do cliente (nunca expõe dados internos)

`CustomerProposalView`/`CustomerProposalDetail`
(`services/api/src/customer-portal.ts`) nunca incluem: `notes`,
`reference_type`/`reference_id`, `secure_file_key`, `user_id`, nem
qualquer outro campo interno. Coberto por teste automatizado
(`(12) internal fields... never reach the customer DTO`).

## Fase 7 — Prévia da agência

Ver Fase 4 acima — substituída a `EmptyState` placeholder por
`ProposalVisualPreview` real, a mesma usada dentro do editor.

## Fase 8/9 — Customer App + Tracking

Ver `docs/product/PROPOSAL_CUSTOMER_EXPERIENCE.md`.

## Fase 10 — Versionamento/imutabilidade (decisão mínima)

Problema real: um agente pode editar a proposta depois que o cliente
já a visualizou, sem o cliente saber o que mudou.

Decisão adotada (deliberadamente mínima, documentada em
`088_proposal_visual_cover.sql`):

- `published_at` é gravado uma vez, na primeira vez que a proposta é
  enviada (`sendProposal`), e nunca mais alterado.
- **Uma vez que a proposta sai de DRAFT/SENT (ou seja, vira
  ACCEPTED/DECLINED/CANCELLED/EXPIRED), todo o conteúdo se torna
  imutável** — `proposedPrice`, `discount`, `conditions`, capa,
  seções, itens e mídia não podem mais ser alterados
  (`assertProposalContentEditable`, reforçado em toda mutação de
  `proposals.ts` e `proposal-content.ts`, nunca só no frontend).
- **O que NÃO foi implementado**: uma proposta ainda em DRAFT/SENT
  pode ser editada livremente após o cliente já tê-la visualizado,
  sem gerar um snapshot do que foi mostrado. Não existe
  `revision_number` nem histórico de versões. Isso é um gap
  conhecido, documentado para uma rodada futura dedicada — construir
  isso corretamente exige uma decisão de produto sobre o que fazer
  com propostas antigas já vistas antes da mudança.

## Fase 11 — Status

Nenhum enum paralelo — `ProposalStatus` continua sendo a única fonte
de verdade. Uma visualização (`PROPOSAL_VIEWED`) não altera o status
comercial automaticamente — nenhuma regra nova foi adicionada
conectando tracking a status.

## Fase 12 — Conversão (Proposal → Booking → Trip)

**Auditado, gap confirmado, não implementado.** Não existe hoje
nenhuma função ou rota que converta uma Proposal aceita em Booking —
`acceptProposal` só muda o status. O botão "Converter" na tela de
detalhe continua desabilitado (com tooltip explicando o motivo). Fica
documentado como gap para uma rodada futura — não foi automatizado
"às cegas" como pedido explicitamente.

## Fase 13 — Duplicar proposta

Implementado do zero (não existia nem no backend nem no frontend).
`POST /proposals/:id/duplicate` clona a proposta base + todas as
sections + items + media, com ids novos, tenant preservado, sempre
volta para DRAFT (nunca copia status/`published_at`), e nunca copia
engagements/tracking. Mídia duplicada aponta para o mesmo
`secure_file_key` do original — não há necessidade de re-upload dos
bytes (mesmo padrão de soft-delete de `trip_photos`, que nunca apaga
o blob subjacente).

## Fase 14 — Template futuro (não implementado)

Documentado apenas: a arquitetura atual (`ProposalSection`/
`ProposalItem` com `type` fechado) não impede a criação futura de um
"Proposal Template" — um conjunto de sections/items pré-definidos que
poderiam ser clonados para uma nova Proposal usando a mesma lógica de
`duplicateProposal`. Não implementado nesta rodada.

## Fase 15 — Offer → Proposal

Proposal já podia referenciar uma Offer via `offer_id` (campo
pré-existente). Criar uma Proposal a partir de uma Offer com
pré-preenchimento de conteúdo **não foi implementado** — auditado e
confirmado que a própria Offer não tem seções/galeria estruturadas
hoje (só um `image_url` único), então não há conteúdo rico para
copiar ainda. Documentado como gap futuro, dependente de Offer também
evoluir.

## Fase 16/17 — Segurança e RBAC

Ver seção de testes abaixo e `docs/product/PROPOSAL_CONTENT_MODEL.md`.
RBAC preservado sem matriz nova: `VIEWER`+ para leitura,
`MANAGER`+ para escrita (mesmo piso que já existia para Proposal:
`create`/`update`/`send`/`cancel`/`accept`/`decline` já eram
`MANAGER`-only antes desta rodada — sections/items/media/duplicate
seguem o mesmo piso, sem inventar uma matriz nova).

## Fase 18 — Performance

O Customer Proposal Viewer usa **uma única chamada agregada**
(`getMyProposalDetailById`) que já traz proposta + seções visíveis +
itens + mídia numa transação — sem fetch por seção, sem N+1. O editor
da agência faz `Promise.all` para seções + `Promise.all` para os itens
de cada seção (paralelo, não sequencial) — aceitável para o volume
esperado (uma proposta tem tipicamente poucas seções).

## Fase 19/20 — UX e Mobile

Ver `docs/product/PROPOSAL_CUSTOMER_EXPERIENCE.md`.

## Testes

`services/api/tests/proposal-visual-http.test.ts` — 12 testes,
cobrindo criação rica, seções (adicionar/editar/remover/reordenar),
itens (adicionar/editar), visibilidade de seção para o cliente,
isolamento de tenant, propriedade do cliente, não vazamento de dados
internos, Viewer agregado + persistência/reload, duplicação (sem
copiar tracking), imutabilidade de proposta aceita, autorização de
mídia. Frontend: `ProposalEditorPage.test.tsx` (4 testes),
`CustomerProposalDetailsPage.test.tsx` (4 testes).

Também corrigidos, por efeito colateral necessário (não regressão de
produto): `proposal-routes.test.ts`, `proposal-e2e.test.ts`,
`proposals.test.ts` usavam listas de migration fixas (só 001+002) —
atualizados para descoberta dinâmica via `readdirSync`, mesmo padrão
já usado em arquivos mais novos, garantindo que rodam contra o schema
real (incluindo as migrations 088-091 desta rodada).

## Gates

Ver `docs/release/PROPOSAL_VISUAL_2_REPORT.md` para os resultados reais.

## NÃO FAZER (confirmado, nada implementado)

Day-by-Day operacional completo, integração com mapas, assinatura
digital, checkout/payment gateway, IA, geração automática de
proposta, marketplace de templates, editor livre tipo Canva, HTML/CSS
arbitrário por tenant.
