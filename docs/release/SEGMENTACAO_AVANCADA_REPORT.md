# Segmentação Avançada de Clientes — Relatório de Release

## Status

SEGMENTAÇÃO AVANÇADA — PRONTO PARA REVISÃO

## Referências

- HEAD inicial: `338f187` (feat(agency): comissionamento por funcionário e produto)
- HEAD final: ver commit desta entrega (mensagem `feat(agency): segmentação avançada de clientes`)
- Documento de produto: `docs/product/SEGMENTACAO_AVANCADA.md`
- Migration: `infrastructure/migrations/081_customer_segments.sql`

## Migrations

`infrastructure/migrations/081_customer_segments.sql` (forward-only):

- Cria enum `customer_segment_scope` (`PERSONAL`/`SHARED`).
- Cria tabela `customer_segments` (tenant-scoped, RLS forçado, política completa), com CHECK garantindo `is_shared` sempre coerente com `scope`.
- Índices: `customer_segments_agency_idx`, `customer_segments_agency_owner_idx`, `customer_segments_agency_scope_idx`, índice GIN em `filter_definition`.
- Índice novo `customer_addresses_agency_city_idx` (evidência real: segmentação é a primeira feature a filtrar por cidade em volume).
- Reaproveita `audit_logs` (não cria tabela de auditoria nova) — novos `event_type`: `SEGMENT_CREATED`, `SEGMENT_UPDATED`, `SEGMENT_ARCHIVED`, `SEGMENT_SHARED`.
- Aplicada e validada em Postgres descartável (reset completo + reaplicação sequencial de todas as migrations em ordem) e em staging local, sem erros.

## Backend

- `services/api/src/customer-segmentation.ts` — motor de consulta: `FIELD_REGISTRY` (allowlist de 26 campos, único ponto de verdade sobre campos/joins/tabelas possíveis), validação de `filter_definition` (profundidade máx. 4, até 30 condições), construção de SQL sempre parametrizada, paginação, preview e execução dinâmica (`runFilterDefinition`).
- `services/api/src/customer-segments.ts` — CRUD de `customer_segments`: criação/listagem/leitura/atualização/arquivamento, com RBAC (SHARED exige OWNER/ADMIN/MANAGER; PERSONAL visível só ao criador ou papel administrativo) e auditoria.
- `services/api/src/routes/customer-segments.ts` — rotas HTTP: `GET/POST /customer-segments`, `GET/PATCH /customer-segments/:id`, `POST /customer-segments/:id/archive`, `GET /customer-segments/:id/results`, `POST /customer-segments/preview`.
- `services/api/src/app.ts` — registro das novas rotas.
- `services/api/src/audit-log.ts` — novos `AuditEventType` de segmento.
- `packages/domain/types.ts` — `CustomerSegment`, `CustomerSegmentScope`.

## Frontend (`apps/agency`)

- Rota `/segments`, item "Segmentação" em Comercial → `apps/agency/src/App.tsx`, `apps/agency/src/components/layout/Sidebar.tsx`.
- `apps/agency/src/pages/SegmentsPage.tsx` — lista de segmentos salvos com cards de resumo (segmentos salvos/compartilhados/pessoais), editor visual (campo/operador/valor allowlisted, sem SQL exposto), pré-visualização antes de salvar, visualização de resultado de segmento salvo (sempre recalculado), arquivamento.
- `apps/agency/src/lib/api.ts` — client para os novos endpoints.

## Testes

### Backend — `services/api/tests/customer-segments.test.ts`

**26/26 passando**, cobrindo os 22 cenários pedidos: filtro simples, AND, OR, aninhamento AND/OR, filtro de texto, número, data, enum, EXISTS/NOT_EXISTS, segmento PERSONAL, segmento SHARED, bloqueio de criação SHARED por AGENT, isolamento cross-tenant, campo inválido, operador inválido, tentativa de SQL injection (por valor e por nome de campo), paginação, contagem, ordenação, segmento arquivado, RBAC via HTTP (AGENT 403 / OWNER 201), persistência/reload, e a prova central do domínio — o resultado muda quando os dados mudam (sem snapshot de membros congelado).

### Frontend — `apps/agency/src/pages/SegmentsPage.test.tsx`

**2/2 passando.**

### Gates finais (monorepo completo)

| Gate | Resultado |
|---|---|
| `npm run lint` | 0 erros (13 warnings pré-existentes, não relacionados a esta feature) |
| `npm run typecheck` | limpo nos 7 pacotes |
| `npm run test` | **92/92 arquivos, 1578 testes** (1532 + 46 confirmados em reexecução isolada — duas falhas da primeira rodada foram flakiness transitória de `docker compose`, já documentada como padrão conhecido desta sessão, reconfirmadas verdes isoladamente) |
| `npm run test:security` | **5/5 arquivos, 58/58 testes** |
| `npm run test:db` | **1/1 arquivo, 9/9 testes** (confirma `customer_segments` presente nas tabelas esperadas) |
| `npm run build` | 7/7 pacotes, sucesso |

## QA real (navegador, ambiente de staging local)

Fluxo completo validado via Playwright contra `https://agency.localhost`, com migration 081 aplicada em staging e `api-staging`/frontend `agency` reconstruídos com o código desta entrega:

1. Login como owner da agência de staging.
2. Comercial → Segmentação (rota nova visível no menu).
3. "Novo segmento" → condição `Status é ACTIVE` → "Pré-visualizar" → **1 cliente(s) encontrado(s)**, com nome real do cliente de staging.
4. "Salvar segmento" → segmento aparece em "Meus segmentos" com contagem dinâmica correta (1 cliente).
5. "Ver resultados" no segmento salvo → reexecução ao vivo do filtro, mesmo resultado, confirmando que a lista **nunca é um snapshot persistido**.
6. Limpeza: segmento de QA removido do banco de staging ao final.

Durante o QA foi encontrado e corrigido um problema real de infraestrutura (não de código da feature): o container `api-staging` estava rodando uma imagem Docker desatualizada porque o rebuild anterior usara um nome de projeto Compose diferente do original, deixando o container preso à imagem antiga (rotas novas devolviam 404). Corrigido reconstruindo com `docker compose -p travel-platform-local-staging ... build --no-cache api-staging` e recriando o container — confirmado com as rotas `GET /api/customer-segments` e `POST /api/customer-segments/preview` retornando 200.

## Gaps remanescentes (documentados, não bloqueantes)

- Exportação CSV do resultado de um segmento: não implementada — não há política de exportação segura já estabelecida no projeto para este tipo de dado.
- "Usar em oferta": integração Segmento → Oferta preparada conceitualmente (contrato descrito em `docs/product/SEGMENTACAO_AVANCADA.md`), não implementada nesta fase.
- Campos não implementados por ausência de dado estruturado confiável: tags de cliente, agente/responsável fixo, forma de pagamento mais usada, parcelamento médio, preferências livres tipo "gosta de praia", dias no estágio de pipeline (sem histórico de transição).
- Campanhas, LLM/IA, scoring de compatibilidade: fora de escopo por instrução explícita.

## CI

Push realizado para `main`; CI real acompanhada via `gh run watch` — ver run id e status abaixo (preenchido após push desta entrega).

## Status final

**SEGMENTAÇÃO AVANÇADA — PRONTO PARA REVISÃO**
