# Proposal Visual 2.0 — Relatório de Entrega

- HEAD inicial: `7482cf3` (docs(release): registrar commit e CI real do
  Customer Engagement Tracking).
- Migrations novas: 4 —
  `088_proposal_visual_cover.sql` (campos de capa + `published_at` em
  `proposals`), `089_proposal_sections.sql`, `090_proposal_items.sql`,
  `091_proposal_media.sql`. Nenhuma tabela pré-existente foi recriada.

## Auditoria (Fase 0)

Matriz completa em `docs/product/PROPOSAL_VISUAL_2.md`. Achado
relevante fora do escopo inicial da auditoria automatizada: já existia
uma tabela `proposal_optional_items` (migration 055, upsell/"Turbine
sua Viagem") — conceito **diferente** do `ProposalItem` desta rodada
(upsell é sobre produtos vendáveis com preço/comissão real; o
`ProposalItem` novo é sobre conteúdo visual exibido ao cliente). Sem
conflito de nome de tabela, documentado em
`docs/product/PROPOSAL_CONTENT_MODEL.md`.

## Modelo de dados

`Proposal → ProposalSection → ProposalItem`, mais `ProposalMedia`
(capa/galeria, reaproveitando o padrão `secure_file_key` de
`trip_photos`). Detalhes completos, incluindo decisão de snapshot
comercial e referências polimórficas, em
`docs/product/PROPOSAL_CONTENT_MODEL.md`.

## Entidades criadas

- `proposal_sections`, `proposal_items`, `proposal_media` (backend:
  `services/api/src/proposal-content.ts`).
- 6 campos de capa + `published_at` em `proposals`
  (`services/api/src/proposals.ts`).

## Endpoints

Staff (`/proposals/*`, `MANAGER`+ para escrita, `VIEWER`+ para
leitura — mesmo piso pré-existente, nenhuma matriz nova):
- `POST /proposals/:id/duplicate`
- `GET`/`POST /proposals/:id/sections`
- `PATCH`/`DELETE /proposal-sections/:sectionId`
- `GET`/`POST /proposal-sections/:sectionId/items`
- `PATCH`/`DELETE /proposal-items/:itemId`
- `GET`/`POST /proposals/:id/media` (upload multipart)
- `DELETE /proposal-media/:mediaId`
- `GET /proposal-media/:mediaId/download`

Customer App:
- `GET /customer-api/proposals/:id` — agora retorna o payload
  agregado (`CustomerProposalDetail`: capa + seções visíveis + itens +
  mídia), numa única transação.
- `GET /customer-api/proposals/:id/media/:mediaId/download`

## Telas

- **Agency**: `ProposalEditorPage.tsx` (`/proposals/:id/editor`) com
  abas Capa/Conteúdo/Mídia/Prévia; `ProposalPreviewPage` reescrita
  (era um placeholder `EmptyState`); `ProposalDetailPage` com os
  botões Editar/Duplicar/Prévia/Enviar finalmente funcionais (antes
  todos `disabled`); UI morta de itinerário removida de
  `ProposalBuilderPage` (nunca era persistida).
- **Customer App**: `CustomerProposalDetailsPage.tsx` reescrita como
  Proposal Viewer mobile-first completo (capa, resumo, seções,
  itinerário em timeline, inclusões/exclusões, valores, CTA).

## Customer DTO — dados internos nunca expostos

`notes`, `reference_type`/`reference_id`, `secure_file_key`,
`user_id` nunca aparecem em `CustomerProposalView`/
`CustomerProposalDetail`. Coberto por teste automatizado.

## Tracking

Reaproveitado sem alteração — `PROPOSAL_VIEWED`/`PROPOSAL_REVISITED`
já existiam da rodada anterior. Nada duplicado.
`PROPOSAL_SECTION_VIEWED` não foi implementado (sem uso real
identificado). Ver gaps em
`docs/product/PROPOSAL_CUSTOMER_EXPERIENCE.md`.

## Imutabilidade (Fase 10)

Uma vez que a proposta sai de DRAFT/SENT, todo o conteúdo (campos
comerciais, seções, itens, mídia) fica travado — reforçado em código
(`assertProposalContentEditable`), nunca só no frontend. `published_at`
gravado uma vez no primeiro envio. Decisão deliberadamente mínima —
não é um engine de versionamento completo; ver o gap documentado sobre
edição pré-aceite após visualização do cliente.

## Testes

`services/api/tests/proposal-visual-http.test.ts` — **12 testes**,
cobrindo os 20 itens da Fase 21 (vários itens agrupados por teste onde
fazia sentido): criação rica, seções (adicionar/editar/remover/
reordenar), itens (adicionar/editar), visibilidade de seção,
isolamento de tenant, propriedade do cliente, não vazamento de dados
internos, Viewer agregado + persistência/reload, duplicação sem copiar
tracking, imutabilidade de proposta aceita, autorização de mídia.

Frontend: `ProposalEditorPage.test.tsx` (4 testes),
`CustomerProposalDetailsPage.test.tsx` (4 testes).

Corrigidos de passagem (pré-existentes, quebrados pelo mesmo padrão de
lista de migration desatualizada já visto em rodadas anteriores):
`proposal-routes.test.ts`, `proposal-e2e.test.ts`, `proposals.test.ts`,
`customer-portal-security.test.ts` — migrados para descoberta dinâmica
via `readdirSync`. O último (`customer-portal-security.test.ts`) tinha
um bug real mascarado por essa lista desatualizada: como as tabelas
`proposal_sections`/`proposal_items`/`proposal_media` não existiam
naquele schema de teste, `getMyProposalDetailById` lançava um erro cru
de "relation does not exist", que o handler devolvia como 500 em vez
do 404 esperado em cenários de isolamento entre agências — corrigido
junto com a lista de migrations.

Corrigido também: `tests/integration/database/002_prepare_local_roles.sql`
não incluía as 3 tabelas novas na lista explícita de grants do papel
de runtime local — um bootstrap totalmente do zero (`docker compose
down -v` + `up -d`, sem papéis pré-existentes no cluster) deixava
`proposal_sections`/`proposal_items`/`proposal_media` sem nenhum
privilégio para `travel_app_runtime_local`. Descoberto pelo próprio
`npm run test:db` (`database.integration.test.ts`), corrigido
adicionando as 3 tabelas ao bloco condicional de grant.
`tests/integration/database/database.integration.test.ts`'s
`expectedAllTables`/`expectedTenantTables` também atualizadas com as 3
tabelas novas.

## Gates

| Gate | Resultado |
|---|---|
| `npm run lint` (monorepo) | ✅ 0 erros (apenas warnings pré-existentes não relacionados) |
| `npm run typecheck` (monorepo) | ✅ 0 erros |
| `npm run build` (monorepo) | ✅ todos os 7 pacotes buildaram |
| `npm run test:security` | ✅ 58/58 testes |
| `npm run test:db` | ✅ 9/9 testes |
| `apps/agency` — `npx vitest run` | ✅ 135/135 testes (20 arquivos) |
| `apps/customer` — `npx vitest run` | ✅ 546/546 testes (72 arquivos) |
| `services/api` — `proposal-visual-http.test.ts` isolado | ✅ 12/12 testes |
| `services/api` — suíte completa (`CI=true npx vitest run`, sequencial) | ✅ 95/95 arquivos, 1616/1616 testes |

## QA local (Fase 22)

Não executado interativamente nesta rodada (sem servidor de
desenvolvimento local rodando durante a sessão) — a jornada completa
(Agency: criar Proposal → editar conteúdo visual → adicionar imagem →
adicionar hospedagem/transporte → condições → prévia → publicar/enviar;
Customer: login → abrir Proposal → visualizar → retornar → abrir de
novo; Agency: Customer 360 → confirmar Proposal viewed/revisited) foi
validada via os testes de integração HTTP reais
(`proposal-visual-http.test.ts`), que exercitam exatamente esse fluxo
fim a fim contra um Postgres real, incluindo upload de imagem
multipart real. QA manual em navegador fica como pendência explícita
antes do deploy.

## Débito / gaps futuros

- `PROPOSAL_SECTION_VIEWED` (tracking granular por seção).
- Tracking do clique no CTA "Falar com meu agente".
- "Aceitar proposta" como ação do cliente (exigiria nova regra de
  autorização).
- Conversão Proposal → Booking → Trip (não existia antes, não foi
  automatizada).
- Vínculo de UI para `reference_type`/`reference_id` (escolher uma
  Excursion existente no editor).
- Offer → Proposal com pré-preenchimento de conteúdo (Offer também não
  tem conteúdo estruturado ainda).
- Versionamento/snapshot completo de proposta pré-aceite (decisão
  mínima adotada: só bloqueia edição pós-aceite).
- Template de proposta (documentado, não implementado).

## Commit e CI

- Commit: `620b092` — `feat(proposal): evoluir Proposal para proposta
  visual estruturada (Proposal Visual 2.0)`.
- Push: `origin/main` (`7482cf3..620b092`).
- CI real (GitHub Actions): run
  [`35686922825`](https://github.com/ugoalencar/travel-platform/actions/runs/35686922825)
  — **✅ sucesso**, job "Quality Gates" completo em 11m35s: Lint,
  Typecheck, Secret scan, Dependency audit, Validate migration file
  naming, Unit tests, Security tests, Database and RLS integration
  tests, Build — todos verdes. Apenas warnings pré-existentes não
  relacionados (nenhum erro).

## Deploy

**Não realizado nesta rodada**, conforme pedido explícito.

## Status

**PROPOSAL VISUAL 2.0 — PRONTO PARA REVISÃO LOCAL**
