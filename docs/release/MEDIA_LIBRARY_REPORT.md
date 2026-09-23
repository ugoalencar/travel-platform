# Media Library — Relatório de Entrega

## Contexto

Corrige um gap arquitetural identificado em QA local do Proposal Visual
2.0: mídia estava sendo tratada como upload isolado por proposta. Esta
rodada substitui `proposal_media` por uma **Media Library central da
agência**, administrada pelo Marketing, reutilizável por Proposal,
Offer e Agency Communication.

## O que foi entregue

### Migrations
- `infrastructure/migrations/092_media_library.sql` — `media_assets` +
  `media_asset_links`, com RLS/RBAC completos.
- `infrastructure/migrations/093_offer_communication_cover_asset.sql` —
  `cover_media_asset_id` em `offers` e `agency_communications`
  (`image_url` preservado como fallback).
- `infrastructure/migrations/094_migrate_proposal_media_to_library.sql` —
  migra `proposal_media` (sem perda de dados) e remove a tabela.

### Backend (`services/api`)
- `src/media-library.ts` — serviço central: CRUD de asset, link/unlink
  a entidades com validação de posse por tenant, contagem de uso,
  arquivar/excluir com proteção contra exclusão de asset em uso.
- `src/routes/media-library.ts` — HTTP staff-facing.
- `src/routes/proposals.ts` — rotas de mídia da Proposal reescritas
  para usar a Media Library (upload direto ainda disponível como
  atalho, mas sempre entra na biblioteca).
- `src/routes/customer-portal.ts` + `src/customer-portal.ts` — leitura
  de mídia da proposta do cliente migrada para o novo modelo, com
  verificação de vínculo antes de servir o download.
- `offers.ts`, `agency-communications.ts`,
  `commercial-input-parsing.ts`, `routes/agency-communications.ts` —
  suporte a `coverMediaAssetId`.

### Frontend (`apps/agency`)
- `src/components/media/MediaAssetPicker.tsx` — componente reutilizável
  ("Selecionar da biblioteca" / "Enviar nova imagem").
- `src/pages/MediaLibraryPage.tsx` + rota `/media-library` + item de
  menu "Biblioteca de Mídia" em Marketing.
- `ProposalEditorPage.tsx` — aba Mídia reescrita para consumir o
  picker em vez de upload isolado.
- `ProposalVisualPreview.tsx`, `SalesJourneyPages.tsx` — migrados do
  tipo `ProposalMedia` (removido) para `EntityMediaItem`.
- `OfferDetailPage.tsx`, `CommunicationFormPage.tsx` — campo "Imagem de
  capa" via picker, com `imageUrl` mantido como alternativa manual.

### Testes e validação
- `tests/integration/database/002_prepare_local_roles.sql` e
  `database.integration.test.ts` atualizados para o novo schema.
- `npm run test:db` — **9/9 passando** (validou o schema real após
  aplicar as migrations 092–094).
- Durante a validação, a migration 094 revelou um bug real: as
  expressões `CASE WHEN ... THEN 'ACTIVE' ...` não tinham cast para os
  enums `MediaAssetStatus`/`MediaAssetUsageKind`, o que quebrava a
  migração sempre que houvesse alguma linha em `proposal_media`. Corrigido
  com `::"MediaAssetStatus"` / `::"MediaAssetUsageKind"`.
- A mesma validação também encontrou `tests/proposal-visual-http.test.ts`
  ainda referenciando a tabela removida `proposal_media` (TRUNCATE) e o
  antigo formato de resposta de upload de mídia (`media.id` em vez de
  `media.mediaAssetId`). Ambos corrigidos; os 12 testes desse arquivo
  voltaram a passar.
- `npm run lint` (monorepo) — 0 erros (apenas warnings pré-existentes
  em código não tocado por esta rodada).
- `npm run typecheck` (monorepo) — 0 erros.
- `npm run test:security` — 58/58 passando.
- `npm run test` (suíte completa) — **95/95 arquivos, 1616/1616 testes
  passando**.
- `npm run build` (monorepo) — 7/7 pacotes buildam sem erro.

## Critério de aceite (status)

| Critério | Status |
|---|---|
| Media Library central existir | ✅ |
| Upload entra na biblioteca | ✅ |
| Proposal seleciona asset existente | ✅ |
| Offer seleciona asset existente | ✅ |
| Communication seleciona asset existente | ✅ |
| Mesmo asset reutilizável entre entidades | ✅ |
| Nenhum arquivo duplicado no storage | ✅ (link aponta para o mesmo `secure_file_key`) |
| Tenant isolation preservado | ✅ (RLS + validação de posse por entidade) |
| Assets usados não apagados perigosamente | ✅ (409 ao excluir asset em uso) |
| Proposal Viewer continua funcionando | ✅ (`test:db` valida schema; fluxo de leitura migrado) |
| Customer App continua funcionando | ✅ (rota de download revalidada) |
| QA local (Fase 18, passo a passo manual) | ⏳ pendente |
| Testes automatizados dedicados (Fase 17, 20 cenários) | ⏳ pendente (cobertura indireta via testes existentes: 1616/1616 passando) |
| CI verde | ⏳ pendente confirmação após push |

## Gaps conhecidos / próximos passos

- Nenhum teste automatizado dedicado ao módulo Media Library foi
  escrito ainda (Fase 17 do spec, 20 cenários). O que existe hoje é a
  cobertura indireta via `test:db` (schema) e `test:security`.
- QA local manual (Fase 18 — Marketing → upload → Offer/Proposal/
  Communication reusando o mesmo asset) não foi executado interativamente
  nesta rodada.
- Eventos de auditoria (Fase 15 —
  `MEDIA_ASSET_CREATED/UPDATED/ARCHIVED/DELETED/LINKED/UNLINKED`) ainda
  não foram adicionados ao `audit-log.ts`.
- Nenhum deploy foi realizado, conforme instrução explícita do escopo.
