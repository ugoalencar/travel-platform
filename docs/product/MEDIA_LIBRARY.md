# Media Library — Biblioteca Central de Mídia

## Contexto

O Proposal Visual 2.0 introduziu upload de imagem isolado por proposta
(`proposal_media`). Em QA local, o usuário identificou que isso estava
arquiteturalmente errado: mídia não deveria ser exclusiva de uma
Proposal, e sim administrada de forma central pelo Marketing e
reutilizável entre Proposal, Offer e Agency Communication.

> "Esta errado midia nao e pra ser individual e pra ser algo para
> divulgar de forma geral ou para um grupo deve ser administrado pelo
> marketing nao por proposta. pode ate chamar uma midia para mandar em
> uma proposta mais deve vir do marketing."

Este documento descreve a Media Library que substitui `proposal_media`.

## Princípio central

**Arquivo físico ≠ uso do arquivo.** O asset pertence à biblioteca da
agência; entidades de negócio (Proposal, Offer, Communication) apenas
referenciam o asset através de um link. Um mesmo `MediaAsset` pode ser
usado por várias entidades sem duplicar o arquivo no storage.

## Modelo de dados

- `media_assets` — asset central da agência (título, descrição, tipo,
  mime, tamanho, `secure_file_key`, dimensões, alt text, tags, status,
  origem). RLS + tenant isolation completos.
- `media_asset_links` — tabela genérica de vínculo
  (`agency_id, media_asset_id, entity_type, entity_id, usage, sort_order`).
  `entity_type` é `OFFER | PROPOSAL | COMMUNICATION`; `usage` é
  `COVER | GALLERY`. `entity_id` não é FK (relação polimórfica) — a
  posse é validada em `assertEntityOwnedByTenant()` antes de qualquer
  vínculo/desvínculo.

Ver `docs/product/MEDIA_ASSET_MODEL.md` para o detalhamento de campos e
`docs/product/MEDIA_ASSET_USAGE.md` para o fluxo de reuso.

## Por que uma tabela de link genérica (e não uma por entidade)

O spec permite um modelo genérico quando é mais simples e seguro do
que três tabelas quase-idênticas. Como Offer e Communication não
tinham nenhuma infraestrutura de mídia antes desta rodada (terreno
limpo) e Proposal só tinha o já-superado `proposal_media`, não havia
precedente de tabela por entidade a preservar. Optou-se por
`media_asset_links` único, com validação de posse em código de
aplicação (nunca confiando em `entity_type`/`entity_id` vindos do
cliente sem essa validação).

## Storage

Reaproveita a mesma infraestrutura de arquivo já existente
(`file-storage.ts` / `secure_file_key`, com adaptador Supabase já
presente em `supabase-storage.ts`). Nenhum sistema de storage novo foi
criado. Upload valida tipo MIME/extensão contra o allowlist de imagem
já usado por outras features de upload do produto.

## RBAC

- Upload / editar / arquivar / excluir asset: `MANAGER`+ (mesmo piso
  de Offer/Communication).
- Selecionar/vincular um asset já existente a uma entidade: `AGENT`+
  (ação de seleção, não de administração de mídia).
- Listar / visualizar / baixar: `VIEWER`+.

## Delete vs. Archive

- Um asset **em uso** (com pelo menos um `media_asset_links`) não pode
  ser fisicamente excluído — a tentativa retorna 409 (Conflict) e a UI
  orienta a arquivar em vez de excluir.
- Um asset sem uso pode ser excluído por quem tem papel `MANAGER`+.
- Arquivar (`ARCHIVED`) nunca quebra proposta/oferta/comunicação já
  publicada — o link continua apontando para o mesmo `media_assets.id`
  e o binário permanece acessível via download.

## Migração de `proposal_media`

`infrastructure/migrations/094_migrate_proposal_media_to_library.sql`
copia cada linha de `proposal_media` para `media_assets` +
`media_asset_links` (nunca apaga dados) e então remove a tabela
superada. Auditoria confirmou que nenhum script de seed de demo jamais
populou `proposal_media`; ainda assim a migração trata linhas reais
defensivamente.

## UI

- **Marketing → Biblioteca de Mídia** (`/media-library`): tela central
  de upload, busca por título/tag, contagem de uso e arquivamento.
- **`MediaAssetPicker`** (componente reutilizável em
  `apps/agency/src/components/media/MediaAssetPicker.tsx`): usado por
  Proposal (aba Mídia), Offer (edição — imagem de capa) e Communication
  (formulário — imagem de capa) para "Selecionar da biblioteca" ou
  "Enviar nova imagem" (que entra na biblioteca antes de ser vinculada).

## Compatibilidade preservada

- `offers.image_url` e `agency_communications.image_url` continuam
  existindo como fallback manual — `coverMediaAssetId` tem precedência
  quando presente, mas nada quebra para registros antigos.
- Proposal Viewer (Customer App) e o preview interno da agência
  continuam funcionando: a leitura de mídia da proposta passou a vir de
  um JOIN em `media_asset_links` + `media_assets`, mantendo o mesmo
  contrato de download (`downloadUrl`, agora resolvido a partir do
  `mediaAssetId`).

## Fora de escopo (não implementado nesta rodada)

DAM enterprise, edição/crop de imagem, IA de geração de imagem, CDN
próprio, transcodificação de vídeo, versionamento complexo, pastas
hierárquicas, marketplace de mídia, mídia compartilhada entre tenants.
