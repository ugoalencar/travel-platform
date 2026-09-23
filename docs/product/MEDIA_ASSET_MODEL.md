# Media Asset — Modelo de Dados

Ver `infrastructure/migrations/092_media_library.sql` para a fonte de
verdade em SQL. Este documento é a referência conceitual.

## `media_assets`

| Campo | Tipo | Observação |
|---|---|---|
| `id` | text (uuid) | PK |
| `agency_id` | text | FK para `agencies`; RLS por tenant |
| `title` | text | obrigatório, não pode ser vazio |
| `description` | text | opcional |
| `asset_type` | `MediaAssetType` | hoje só `IMAGE`; `VIDEO`/`DOCUMENT` documentados como futuro, não implementados |
| `mime_type` | text | validado contra allowlist de imagem |
| `file_size_bytes` | bigint | |
| `secure_file_key` | text | chave no storage (reaproveita `file-storage.ts`) |
| `width`, `height` | integer | opcionais |
| `alt_text` | text | opcional, usado em `<img alt>` |
| `tags` | text[] | busca por tag (`GIN` index) |
| `status` | `MediaAssetStatus` | `ACTIVE` \| `ARCHIVED` |
| `source` | `MediaAssetSource` | hoje só `UPLOAD` |
| `created_by` | text | FK composta `(agency_id, id)` em `users` |
| `created_at`, `updated_at`, `archived_at` | timestamptz | |

## `media_asset_links`

| Campo | Tipo | Observação |
|---|---|---|
| `id` | text (uuid) | PK |
| `agency_id` | text | RLS por tenant |
| `media_asset_id` | text | FK composta tenant-scoped para `media_assets` |
| `entity_type` | `MediaAssetUsageContext` | `OFFER` \| `PROPOSAL` \| `COMMUNICATION` |
| `entity_id` | text | **sem FK** — relação polimórfica; posse validada em código |
| `usage` | `MediaAssetUsageKind` | `COVER` \| `GALLERY` |
| `sort_order` | integer | ordem de exibição na galeria |
| `created_at` | timestamptz | |

Índice único `(agency_id, entity_type, entity_id, media_asset_id, usage)`
evita duplicar o mesmo vínculo; índice por `(agency_id, entity_type,
entity_id, sort_order)` acelera a listagem por entidade.

## Enums (TypeScript, `packages/domain/types.ts`)

```ts
enum MediaAssetType { IMAGE = 'IMAGE' }
enum MediaAssetStatus { ACTIVE = 'ACTIVE', ARCHIVED = 'ARCHIVED' }
enum MediaAssetSource { UPLOAD = 'UPLOAD' }
enum MediaAssetUsageContext { OFFER = 'OFFER', PROPOSAL = 'PROPOSAL', COMMUNICATION = 'COMMUNICATION' }
enum MediaAssetUsageKind { COVER = 'COVER', GALLERY = 'GALLERY' }
```

## Regra de capa única

Não há constraint de banco garantindo uma única `COVER` por entidade.
`linkMediaAsset()` (`services/api/src/media-library.ts`) remove
qualquer vínculo `COVER` existente da mesma `(entity_type, entity_id)`
antes de inserir o novo, mantendo a regra em código de aplicação de
forma idempotente (`ON CONFLICT ... DO UPDATE SET sort_order`).
