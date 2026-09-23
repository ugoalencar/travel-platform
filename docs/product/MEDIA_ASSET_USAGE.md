# Media Asset — Reuso entre Offer, Proposal e Communication

## Fluxo de seleção ("Selecionar da biblioteca")

1. Usuário abre o `MediaAssetPicker` a partir de Proposal (aba Mídia),
   Offer (edição) ou Communication (formulário).
2. O picker lista os assets `ACTIVE` da agência (`GET /api/media-assets`),
   com busca por título/tag.
3. Ao escolher um asset já existente, a tela chamadora vincula o asset
   à entidade:
   - Proposal: `POST /api/proposals/:id/media/link` → cria/atualiza uma
     linha em `media_asset_links`.
   - Offer / Communication: define `coverMediaAssetId` no
     `PATCH`/`PUT` da entidade (relação 1:1 direta via coluna FK, não
     via `media_asset_links`, já que Offer/Communication hoje só têm
     capa — não galeria).
4. Se o usuário preferir enviar uma imagem nova, o picker sobe o
   arquivo para a biblioteca primeiro (`POST /api/media-assets`) e só
   depois de o upload terminar é que a seleção/vínculo acontece — nunca
   existe upload direto "dentro" de Offer/Proposal/Communication sem
   passar pela biblioteca.

## Reuso concreto (cenário de QA)

1. Marketing → Biblioteca de Mídia → upload da imagem "Cancún" com tags
   `Cancún, Praia, Família`.
2. Offer "Pacote Cancún" → editar → Selecionar da biblioteca → escolhe
   "Cancún" como capa (`offers.cover_media_asset_id`).
3. Proposal do mesmo cliente → aba Mídia → Selecionar da biblioteca →
   escolhe a mesma imagem "Cancún" como capa
   (`media_asset_links` com `usage = COVER`).
4. Communication "Campanha de Verão" → Selecionar da biblioteca →
   mesma imagem "Cancún" (`agency_communications.cover_media_asset_id`).
5. Resultado esperado: **1 arquivo físico**, **3 usos** — confirmado na
   tela da biblioteca ("Usado em: 1 Offer, 1 Proposal, 1 Communication",
   via `GET /api/media-assets/:id/usage`).

## Proteção contra exclusão perigosa

`deleteMediaAsset()` conta as linhas em `media_asset_links` para aquele
asset; se houver qualquer uso, a exclusão física é recusada (409) e a
UI orienta arquivar. Um asset arquivado continua resolvendo download
para quem já o usa — não quebra Proposal/Offer/Communication publicados.

## Imutabilidade / capa de proposta publicada

Decisão: o asset permanece estável e nunca é substituído silenciosamente.
Trocar a imagem de uma Proposal/Offer/Communication significa trocar
*qual* asset está vinculado (ou qual `coverMediaAssetId` está setado),
nunca sobrescrever o binário de um asset em uso. Vincular/desvincular
mídia em uma Proposal com status final (`ACCEPTED`, `DECLINED`,
`CANCELLED`, `EXPIRED`) é bloqueado pela mesma checagem de
imutabilidade usada para seções/itens (`assertProposalContentEditable`).

## Onde cada camada consome o asset

- **Agência** (Proposal Editor, Offer, Communication): via
  `MediaAssetPicker` + endpoints autenticados de staff.
- **Customer App**: recebe apenas a URL de download resolvida pelo
  backend (`GET /customer-api/proposals/:id/media/:mediaId/download`,
  que valida que o asset está de fato vinculado àquela proposta do
  cliente antes de servir o arquivo) — nunca expõe `secure_file_key`
  ou detalhes internos de storage.
