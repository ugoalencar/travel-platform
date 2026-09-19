# Platform Admin — Comercial & Parcerias (META PÓS-PILOTO 01)

Documento do produto para a camada comercial própria da Travel Plataforma dentro do Platform Admin: Landing CMS, Banners/Campanhas, Parceiros, Indicações, Comissões, Créditos e Auditoria comercial.

**Escopo explicitamente fora desta fase:** Marketplace, inventário externo, integração Amadeus/GDS, emissão de passagem, booking externo, settlement de marketplace, billing recorrente completo, pagamento automático de comissão. Ver `docs/roadmap/MARKETPLACE_FUTURE.md` para o registro da META 02 (futura, sem implementação).

## Princípio de arquitetura

Esta funcionalidade pertence à **Travel Plataforma**, não ao tenant/agência. É domínio exclusivo do **Platform Admin**.

Ponto crítico, já existente no schema antes desta feature: a tabela `commercial_partners` (migração 054) e sua família (`partner_contracts`, `partner_links`, `partner_attributions`, `partner_commissions`) implementam o **programa de afiliados da própria agência** — tenant-scoped, RLS por `agency_id`. Isso é um conceito **diferente** do "Parceiros" desta feature, que são os parceiros comerciais da própria Travel Plataforma (ex.: fintech, seguradora, parceiro de tecnologia) exibidos na landing pública.

Para evitar qualquer mistura entre os dois domínios, todas as tabelas novas usam o prefixo `platform_` e vivem em um módulo de backend próprio (`services/api/src/platform-commercial.ts`), nunca reaproveitando as tabelas/rotas tenant-scoped existentes.

## Migração

`infrastructure/migrations/078_platform_commercial_partnerships.sql` — forward-only, não edita nenhuma migração existente. Cria:

| Tabela | Propósito |
|---|---|
| `platform_landing_page` | Rascunho de trabalho da landing (hero, CTAs, SEO, footer) |
| `platform_landing_sections` | Seções estruturadas da landing (HERO, FEATURES, WORKFLOW, CUSTOMER_PORTAL, SECURITY, PARTNERS, TESTIMONIALS, FAQ, CTA) |
| `platform_landing_publications` | Histórico append-only de publicações — snapshot JSONB imutável tirado no momento do publish |
| `platform_banners` | Banners/campanhas (placements: LANDING, PLATFORM_ADMIN, extensível) |
| `platform_partners` | Parceiros comerciais da Travel Plataforma |
| `platform_referrals` | Indicações (PARTNER/AGENCY/MANUAL/CAMPAIGN → LEAD/CONTACTED/QUALIFIED/CONVERTED/REJECTED) |
| `platform_partner_benefits` | Regra comercial (tipo de benefício + valor + vigência) |
| `platform_referral_credits` | Ledger de créditos por agência |
| `platform_partner_commissions` | Comissões de parceiro (sem pagamento automático) |

Nenhuma tabela nova de auditoria foi criada — todas as ações mutáveis gravam em `platform_audit_logs` (034, já existente), reaproveitando seu padrão genérico (`actor_id`, `action`, `resource_type`, `resource_id`, `changes`, `reason`, `metadata`). `action` é um enum fixo do schema (`CREATED`/`UPDATED`/`DELETED`/`PUBLISHED`); o nome de evento fino desta feature (ex. `landing.section.created`) fica em `metadata.event`.

Grants para o runtime role (`travel_app_runtime_local`/`travel_app_runtime`) seguem exatamente o padrão da migração 077: SELECT/INSERT/UPDATE/DELETE nas tabelas normais, SELECT/INSERT (sem UPDATE/DELETE) na tabela append-only de publicações.

## Landing CMS e preview seguro

Fluxo: **editar → salvar rascunho → preview → publicar**.

- Editar grava apenas em `platform_landing_page`/`platform_landing_sections` (rascunho de trabalho).
- Publicar tira um snapshot JSONB do rascunho + seções habilitadas e insere uma nova linha em `platform_landing_publications`. É a única escrita que afeta o que o público vê.
- **A landing pública (`GET /public/landing`) lê exclusivamente `platform_landing_publications`** (a publicação mais recente) — nunca as tabelas de rascunho. Uma edição não publicada nunca aparece no site público, mesmo que salva.
- Preview no Platform Admin lê o rascunho diretamente (`GET /platform/landing`), sem exigir publish antes.

## Banners

Campos: `title`, `subtitle`, `image_url`, `cta_label`, `cta_url`, `placement`, `starts_at`, `ends_at`, `status`, `sort_order`. Placements iniciais: `LANDING`, `PLATFORM_ADMIN` — enum extensível para o futuro (spec explícito: nenhum banner é exibido no Agency App sem decisão futura explícita; não há placement `AGENCY_APP`).

`GET /public/banners?placement=LANDING` retorna apenas banners com `status=ACTIVE` **e** dentro da janela `starts_at`/`ends_at` — nunca um banner `DRAFT`, `PAUSED` ou fora do período.

## Parceiros e exibição pública

`platform_partners` tem um campo `is_public` explícito. `GET /public/partners` só retorna parceiros com `is_public=true` **e** `status=ACTIVE` **e** dentro da janela de vigência, e a query **nunca seleciona** `internal_notes`, `contact_name` ou `contact_email` — a exclusão acontece na própria query SQL (`SELECT` explícito das colunas públicas), não por filtragem posterior no código, para que não haja como um bug futuro vazar esses campos por acidente.

## Indicações (Referrals)

`referrer_type` ∈ `PARTNER | AGENCY | MANUAL | CAMPAIGN` (polimórfico — `referrer_id` não tem FK única já que o alvo varia por tipo; validado na camada de aplicação). Ciclo de status: `LEAD → CONTACTED → QUALIFIED → CONVERTED` ou `REJECTED` a qualquer momento antes de `CONVERTED`. `converted_at` é setado automaticamente apenas quando o status muda para `CONVERTED`.

## Benefícios, Créditos e Comissões

- **Benefícios** (`platform_partner_benefits`): regra comercial associada a um parceiro e/ou indicação. Tipos: `FIXED_COMMISSION`, `PERCENTAGE_COMMISSION`, `MONTHLY_CREDIT`, `PERCENTAGE_CREDIT`, `MANUAL_BENEFIT`. Não calcula nem aplica cobrança SaaS automaticamente.
- **Créditos** (`platform_referral_credits`): ledger simples por agência. Ciclo `PENDING → AVAILABLE → APPLIED` (ou `CANCELLED`). Nunca altera a mensalidade real — apenas registra o crédito.
- **Comissões** (`platform_partner_commissions`): ciclo `PENDING → APPROVED → PAID` (ou `CANCELLED`). `PAID` é sempre um registro manual de um pagamento já feito fora do sistema — não existe integração de pagamento automático.

## Permissões

Toda rota `/platform/*` desta feature exige autenticação de Platform Admin (`platformAuthHooks`), completamente separada da autenticação de agência/tenant — `OWNER`/`ADMIN`/`MANAGER`/`AGENT`/`VIEWER` de agência e `Customer` **não têm acesso**, porque essas roles nunca autenticam contra o pipeline `/platform-auth`.

Dentro do Platform Admin, leitura é permitida a qualquer principal autenticado (mesmo padrão de todo `GET /platform/*` já existente no código). Escrita (criar/editar/publicar/mudar status) é restrita a `PLATFORM_OWNER`/`PLATFORM_ADMIN`, mesmo padrão já usado pelo toggle de feature flags — `SUPPORT_ADMIN`, `BILLING_ADMIN`, `MARKETING_ADMIN` e `READ_ONLY_AUDITOR` podem ler mas não escrever.

## Segurança

- **URLs externas** (`cta_url`, `website_url`, `logo_url`, `hero_image_url`, `og_image_url`): validadas por `assertSafeExternalUrl` — aceita apenas `http:`/`https:` absolutos ou caminhos internos (`/algo`); rejeita `javascript:`, `data:` e URLs protocol-relative (`//evil.com`, vetor clássico de open redirect).
- **Sanitização de texto**: `sanitizePlainText` remove qualquer tag HTML de campos de texto livre (título, descrição, notas) — nenhum HTML/script arbitrário é aceito.
- **Sem editor visual complexo**: o CMS é baseado em seções estruturadas com campos discretos (título, subtítulo, conteúdo, imagem, ordem), não um editor WYSIWYG/drag-and-drop com HTML livre.

## UI (Platform Admin)

Navegação nova, mantendo a personalidade de control plane do Direction A (`apps/platform-admin/src/components/Layout.tsx`):

- **Conteúdo**: Landing, Banners, FAQ
- **Parcerias**: Parceiros, Indicações, Comissões, Créditos

FAQ é implementado como uma visão filtrada + formulário sobre as mesmas seções da landing (`type=FAQ`), sem tabela/rota dedicada — evita duplicar o conceito de "conteúdo estruturado" já coberto pelo CMS.

## Telas criadas

- `apps/platform-admin/src/pages/LandingCMSPage.tsx` — edição de hero/CTAs/SEO/footer, lista de seções (criar/habilitar/desabilitar/remover), publicar, histórico de publicações, link de preview.
- `apps/platform-admin/src/pages/BannersPage.tsx` — lista + criação + ativar/pausar/remover.
- `apps/platform-admin/src/pages/FAQPage.tsx` — lista + criação de perguntas/respostas.
- `apps/platform-admin/src/pages/PartnersPage.tsx` — lista + criação + alternar público/destaque/status.
- `apps/platform-admin/src/pages/ReferralsPage.tsx` — funil por status + criação + avançar/rejeitar.
- `apps/platform-admin/src/pages/CommissionsPage.tsx` — comissões e benefícios, criação + aprovar/marcar como paga.
- `apps/platform-admin/src/pages/CreditsPage.tsx` — ledger de créditos + criação + avançar status.

## Testes

`services/api/tests/platform-commercial.test.ts` — 39 testes, todos contra Postgres real descartável (mesmo padrão de `invitations-permission-restrictions.test.ts`): validação de URL/sanitização, ciclo de vida de landing (draft nunca vaza para o público, publish faz snapshot, seção desabilitada é excluída do snapshot, republish atualiza o público), banners (período inválido, fora da janela, DRAFT nunca público), parceiros (CRUD, exposição pública sem campos privados), indicações (ciclo completo, rejeição), créditos (ciclo completo, valor inválido, agência inexistente), comissões (ciclo completo sem pagamento automático, parceiro inexistente), permissão HTTP (não autenticado, leitura por qualquer role, escrita negada a role não-admin, escrita permitida a PLATFORM_ADMIN com auditoria registrada), e os 3 endpoints públicos sem exigir autenticação de plataforma.

## Pendências conhecidas (não bloqueiam esta fase)

- Não há tela de "preview" renderizado visualmente da landing dentro do Platform Admin — o link "Preview" aponta para `/preview/landing`, uma rota que a landing pública (app `marketing`) ainda precisa implementar para consumir `GET /public/landing`. A API pública já está pronta e testada; falta o consumo real no app de marketing, que está fora do escopo desta rodada (a spec não pediu alterações no app `marketing`).
- `/platform/subscribers` retorna `subscriber_tenants.id`, não `agencies.id` — por isso a tela de Créditos pede o ID da agência (`agencies.id`) diretamente, em vez de um seletor amigável. Corrigir isso exigiria expor `agency_id` nesse endpoint existente, fora do escopo desta feature.
