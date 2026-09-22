# Proposal — Experiência do Cliente

Documenta o Customer Proposal Viewer (Fase 8/9/19/20 de
`docs/product/PROPOSAL_VISUAL_2.md`).

## Estrutura da tela

`apps/customer/src/customer-portal/pages/CustomerProposalDetailsPage.tsx`,
mobile-first (testado em 390px):

```
Capa (imagem de capa + título + subtítulo)
↓
Aviso informativo ("proposta é apenas informativa")
↓
Resumo (destino / período / viajantes, se preenchidos)
↓
Texto de introdução (se preenchido)
↓
Seções, na ordem definida pela agência (só as com
is_visible_to_customer = true)
↓
Valores e condições (total, desconto, validade, condições)
↓
CTA
```

A ordem das seções (Destinos, Hospedagem, Transporte, Experiências,
Itinerário, Inclui/Não inclui etc.) segue o `sort_order` que a agência
definiu no editor, não uma ordem fixa no código — a estrutura só
mostra as seções que existem e estão marcadas como visíveis, nunca uma
lista fixa de blocos vazios.

## Renderização por tipo de seção

- **ITINERARY**: itens em uma timeline vertical (borda à esquerda),
  com "Dia N" em destaque quando o item tem `dayNumber`.
- **INCLUSIONS**/**EXCLUSIONS**: itens com ícone ✅/❌.
- Demais tipos: lista simples de itens (título, descrição, local,
  preço quando aplicável).

## CTA (Fase 8)

Único botão implementado nesta rodada: **"Falar com meu agente"**,
reaproveitando o contato da agência já buscado
(`getMyAgencyContact()`) — abre WhatsApp (se a agência tem telefone)
ou e-mail (fallback). Só aparece quando o status da proposta é
`SENT` (não faz sentido "falar sobre" uma proposta ainda em rascunho,
nem uma já aceita/recusada/cancelada/expirada).

**"Aceitar proposta" não foi implementado.** O fluxo de aceite
existente (`POST /proposals/:id/accept`) é `MANAGER`-only no lado da
agência; abrir essa transição de status para o cliente exigiria
desenhar regras de autorização novas (o cliente pode aceitar em nome
de quem? Precisa de confirmação adicional? Isso conflita com
"assinatura digital/checkout", explicitamente fora de escopo desta
rodada). Fica documentado como gap para uma rodada futura dedicada,
não implementado às pressas.

## Tracking (Fase 9)

Reaproveita 100% o que já existia da rodada de Customer Engagement
Tracking — **nada foi duplicado**:
- `PROPOSAL_VIEWED`/`PROPOSAL_REVISITED` já disparavam via
  `trackProposalViewed(id)` desde a rodada anterior; mantido
  inalterado.
- `PROPOSAL_SECTION_VIEWED` **não foi implementado** — a
  especificação pedia isso só "se houver uso real imediato" e
  preferia não granular demais. Como não há hoje nenhuma tela
  consumindo esse nível de detalhe, não foi construído. Implementar
  exigiria uma coluna nova em `engagements` (a tabela não tem
  metadata por seção hoje) — gap documentado, não uma limitação
  técnica intransponível.
- O clique no CTA "Falar com meu agente" **não** dispara nenhum
  evento de tracking — não existe um tipo de evento para isso na
  taxonomia desta rodada (é uma ação de Proposal, não de
  Communication, então `COMMUNICATION_CTA_CLICKED` não se aplica).
  Documentado como gap.

## Autorização de mídia

Download de imagem de capa/galeria
(`GET /customer-api/proposals/:id/media/:mediaId/download`) sempre
revalida, nesta ordem: (1) a proposta pertence a este tenant E a este
customer (via `getMyProposalById`), (2) a mídia pertence a esta mesma
proposta. Testado: cliente de outro tenant recebe 404 (nunca 403 —
nunca revela que a mídia existe).

## Fase 19 — UX (Direction A)

- Capa com gradiente + imagem de fundo (quando existe) + overlay
  escuro para legibilidade do título, igual ao tratamento visual já
  usado em `CustomerTripDetailsPage`/`CustomerHomePage`.
- Cartão de valores com gradiente azul/índigo, não um bloco branco
  administrativo.
- Timeline vertical para o itinerário (borda colorida + espaçamento),
  não uma tabela.
- CTA como botão circular de destaque, não um link de texto perdido
  no meio da página.

## Fase 20 — Mobile (390px)

Testado manualmente em largura estreita: capa em altura reduzida
(`h-56` vs `h-72` em telas maiores), grid de resumo colapsa para uma
coluna, rolagem vertical única sem overflow horizontal, CTA sempre
visível ao final do conteúdo (não fixo/sticky — decisão consistente
com o restante do Customer App, que não usa elementos fixos).

## Gaps futuros (resumo)

- `PROPOSAL_SECTION_VIEWED` (tracking granular por seção).
- Tracking do clique no CTA "Falar com meu agente".
- "Aceitar proposta" como ação do cliente.
- Vínculo visual/UI para `reference_type`/`reference_id` (ex.: abrir
  detalhes de uma Excursion referenciada a partir de um item).
