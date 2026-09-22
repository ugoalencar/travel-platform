# Proposal — Modelo de Conteúdo

Documenta a estrutura de dados de `Proposal Visual 2.0`. Ver também
`docs/product/PROPOSAL_VISUAL_2.md` para o contexto da rodada.

## Modelo

```
Proposal (existente, estendida)
  └── ProposalSection (novo — 089_proposal_sections.sql)
        └── ProposalItem (novo — 090_proposal_items.sql)
  └── ProposalMedia (novo — 091_proposal_media.sql)
```

Não é um page builder genérico: `ProposalSectionType` e
`ProposalItemType` são enums Postgres fechados. Uma proposta só tem as
seções que a agência efetivamente adicionou — nunca todas por padrão.

## `proposals` — campos novos (migration 088)

Todos nullable, puramente aditivos (toda proposta existente continua
funcionando sem eles):

| Campo | Tipo | Uso |
|---|---|---|
| `title` | TEXT | Título da capa |
| `subtitle` | TEXT | Subtítulo da capa |
| `destination_summary` | TEXT | Resumo do destino ("Cancún, México") |
| `travel_period` | TEXT | Período em texto livre ("12 a 19 de dezembro") |
| `traveler_summary` | TEXT | Viajantes em texto livre ("2 adultos, 1 criança") |
| `intro_text` | TEXT | Parágrafo de introdução |
| `published_at` | TIMESTAMPTZ | Gravado uma vez no primeiro envio; ver Fase 10 em PROPOSAL_VISUAL_2.md |

O campo de capa **imagem** não é uma coluna aqui — vive em
`proposal_media` (`is_cover = true`), reaproveitando o padrão
`secure_file_key` em vez de uma URL crua.

## `proposal_sections`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | TEXT (uuid) | |
| `agency_id` | TEXT | Tenant |
| `proposal_id` | TEXT | FK composta `(agency_id, proposal_id) → proposals(agency_id, id)`, `ON DELETE CASCADE` |
| `type` | `ProposalSectionType` | Enum fechado — ver lista abaixo |
| `title` | TEXT | Obrigatório, não pode ser vazio |
| `description` | TEXT | Opcional |
| `sort_order` | INTEGER | Ordem de exibição |
| `is_visible_to_customer` | BOOLEAN | Default `true`. `false` = a agência vê, o cliente não |
| `created_at`/`updated_at` | TIMESTAMPTZ | |

Valores de `ProposalSectionType`: `OVERVIEW`, `DESTINATIONS`,
`TRANSPORT`, `ACCOMMODATION`, `EXPERIENCES`, `ITINERARY`,
`INCLUSIONS`, `EXCLUSIONS`, `COMMERCIAL_TERMS`, `PAYMENT_OPTIONS`,
`MEDIA`, `DOCUMENTS`, `NOTES`.

## `proposal_items`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | TEXT (uuid) | |
| `agency_id` | TEXT | Tenant |
| `proposal_section_id` | TEXT | FK composta para `proposal_sections`, `ON DELETE CASCADE` |
| `type` | `ProposalItemType` | Enum fechado — ver lista abaixo |
| `title` | TEXT | Opcional |
| `description` | TEXT | Opcional |
| `sort_order` | INTEGER | Ordem dentro da seção |
| `day_number` | INTEGER | Só para itens `ITINERARY_DAY` ("Dia N") — `CHECK > 0` |
| `location_name` | TEXT | Opcional |
| `price` | NUMERIC(10,2) | Opcional — ver "Snapshot comercial" abaixo |
| `reference_type` | TEXT | Opcional — ver "Referências" abaixo |
| `reference_id` | TEXT | Opcional |

Valores de `ProposalItemType`: `TEXT`, `DESTINATION`, `TRANSPORT`,
`ACCOMMODATION`, `EXPERIENCE`, `ITINERARY_DAY`, `INCLUSION`,
`EXCLUSION`, `CONDITION`, `PAYMENT_OPTION`, `IMAGE`.

Campos deliberadamente **não incluídos**, por não terem uso real
identificado na auditoria: `start_time`/`end_time`,
`quantity`, `metadata` (JSONB genérico). Se surgir uma necessidade
real, adicionar via nova migration — não adivinhar antecipadamente.

## `proposal_media`

Mesmo padrão de `trip_photos` (`074_trip_photos.sql`): metadata only,
bytes vivem sob um `secure_file_key` minerado pelo servidor, via
`services/api/src/file-storage.ts`.

| Campo | Tipo | Notas |
|---|---|---|
| `secure_file_key` | TEXT | Nunca derivado do nome de arquivo do cliente |
| `file_name`, `file_mime_type`, `file_size_bytes` | | |
| `caption` | TEXT | Opcional |
| `is_cover` | BOOLEAN | No máximo uma por proposta, reforçado em código (não é `CHECK`/índice único parcial — trocar a capa é um update em duas linhas) |
| `sort_order` | INTEGER | |
| `deleted_at` | TIMESTAMPTZ | Soft delete — nunca apaga o blob subjacente, mesmo padrão de `trip_photos` |

Tipos de imagem aceitos: PNG, JPEG, WEBP (mesma lista de
`trip_photos`).

## Referências (Fase 1)

`ProposalItem.reference_type`/`reference_id` deixam um item
opcionalmente apontar para uma entidade existente (hoje, na prática,
`EXCURSION`) sem copiar todo o conteúdo dela. **Não é uma foreign key**
— é polimórfico (poderia apontar para tabelas diferentes conforme o
tipo), e uma FK composta não consegue mirar "uma dentre várias
tabelas". A propriedade/validade da entidade referenciada é
revalidada em código de aplicação sempre que `reference_id` é usado
para algo além de exibição.

Nesta rodada, o **schema** suporta a referência, mas **não existe UI**
no editor para escolher uma Excursion existente e vinculá-la — os
itens são digitados livremente. Fica como gap documentado (Fase 1 /
Fase 15).

## Snapshot comercial

Decisão deliberada: **o preço fica gravado diretamente no
`ProposalItem.price`** no momento em que o item é criado — não é lido
ao vivo da entidade referenciada a cada renderização.

Isso resolve o problema descrito na especificação: "Hotel tinha preço
X quando a proposta foi enviada; depois o fornecedor mudou o preço; a
proposta enviada ao cliente não deve mudar silenciosamente." Como o
preço do item é uma coluna própria (não uma consulta ao vivo), alterar
o preço de uma Excursion (ou qualquer entidade referenciada) no futuro
nunca altera uma proposta já montada.

## Segurança (Fase 16)

- Todas as três tabelas novas são tenant-scoped com RLS `FORCE`
  (padrão idêntico ao de `proposals`/`trip_photos`) — 4 políticas
  (`SELECT`/`INSERT`/`UPDATE`/`DELETE`) usando `current_agency_id()`.
- FKs compostas `(agency_id, <parent>_id)` — o mesmo padrão usado por
  toda tabela filha tenant-scoped no projeto — impedem uma seção da
  Agência A referenciar uma proposta da Agência B mesmo que o
  `agency_id` da seção fosse (indevidamente) igual.
- Testado (`proposal-visual-http.test.ts`): Agência B não lê nem edita
  seções da Agência A; um Customer não acessa proposta de outro
  Customer do mesmo tenant; nenhum campo interno
  (`notes`/`reference_id`/`secure_file_key`) chega ao DTO do cliente;
  download de mídia de outro tenant é bloqueado (404, não 403 —
  nunca revela que a entidade existe em outro tenant).

## RBAC (Fase 17)

Nenhuma matriz nova. Mesmo piso que já existia para `Proposal`:
- `GET` (proposta, seções, itens, mídia): `VIEWER`+.
- `POST`/`PATCH`/`DELETE` (seções, itens, mídia, duplicar): `MANAGER`+
  — mesmo piso que já protegia `create`/`update`/`send`/`accept` antes
  desta rodada. `AGENT` continua sem acesso de escrita a propostas
  (comportamento pré-existente, não alterado).
