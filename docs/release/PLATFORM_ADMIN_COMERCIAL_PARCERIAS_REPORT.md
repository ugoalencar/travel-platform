# Relatório Final — Platform Admin Comercial & Parcerias (META PÓS-PILOTO 01)

## Resumo

- **Commit:** `c8cb489`
- **CI run:** `35419480312` — ✅ sucesso
- **Branch:** `main`

## Migrations

- `infrastructure/migrations/078_platform_commercial_partnerships.sql` — forward-only, nenhuma migração existente foi editada. Aplicada e validada tanto no banco de teste descartável (via `npm run test:db`, 9/9) quanto no Postgres real de staging local (`travel-platform-postgres-staging`), onde foi aplicada manualmente com `psql -f` (o ambiente de staging não usa um runner de migrations com tabela de controle; migrações são aplicadas diretamente em sequência).
- `tests/integration/database/002_prepare_local_roles.sql` e `tests/integration/database/database.integration.test.ts` atualizados com os grants e as 9 tabelas novas nas listas de cobertura (mesmo padrão usado para a migração 077 em rodada anterior desta sessão).

## Entidades criadas

| Tabela | Domínio |
|---|---|
| `platform_landing_page` | Landing CMS — rascunho de trabalho |
| `platform_landing_sections` | Landing CMS — seções estruturadas |
| `platform_landing_publications` | Landing CMS — histórico de publicações (append-only, snapshot JSONB) |
| `platform_banners` | Banners / campanhas |
| `platform_partners` | Parceiros comerciais da Travel Plataforma |
| `platform_referrals` | Indicações |
| `platform_partner_benefits` | Regras de benefício/comissionamento |
| `platform_referral_credits` | Ledger de créditos por agência |
| `platform_partner_commissions` | Comissões de parceiro |

Nenhuma tabela de auditoria nova — todas as ações mutáveis gravam em `platform_audit_logs` (já existente desde a migração 034).

Deliberadamente **não** reaproveitada nem alterada: a família `commercial_partners`/`partner_contracts`/`partner_commissions` (migração 054) — é o programa de afiliados **da própria agência** (tenant-scoped, RLS), um conceito diferente do "Parceiros" desta feature (parceiros da própria Travel Plataforma, platform-global).

## Telas criadas (Platform Admin)

| Tela | Rota | Arquivo |
|---|---|---|
| Landing CMS | `/content/landing` | `apps/platform-admin/src/pages/LandingCMSPage.tsx` |
| Banners | `/content/banners` | `apps/platform-admin/src/pages/BannersPage.tsx` |
| FAQ | `/content/faq` | `apps/platform-admin/src/pages/FAQPage.tsx` |
| Parceiros | `/partnerships/partners` | `apps/platform-admin/src/pages/PartnersPage.tsx` |
| Indicações | `/partnerships/referrals` | `apps/platform-admin/src/pages/ReferralsPage.tsx` |
| Comissões | `/partnerships/commissions` | `apps/platform-admin/src/pages/CommissionsPage.tsx` |
| Créditos | `/partnerships/credits` | `apps/platform-admin/src/pages/CreditsPage.tsx` |

Navegação nova em `apps/platform-admin/src/components/Layout.tsx`: seções "Conteúdo" (Landing, Banners, FAQ) e "Parcerias" (Parceiros, Indicações, Comissões, Créditos), mantendo a personalidade de control plane do Direction A.

## Permissões

- Toda rota `/platform/*` desta feature exige `platformAuthHooks` (autenticação de Platform Admin, pipeline `/platform-auth` — completamente separado da autenticação de agência/tenant e do Customer Portal).
- Leitura: qualquer principal de Platform Admin autenticado.
- Escrita (criar/editar/publicar/mudar status): restrita a `PLATFORM_OWNER`/`PLATFORM_ADMIN` via `requirePlatformRole`, mesmo padrão já usado pelo toggle de feature flags.
- `OWNER`/`ADMIN`/`MANAGER`/`AGENT`/`VIEWER` de agência e `Customer` não têm acesso, por não autenticarem nesse pipeline — confirmado por teste real (usuário de agência não consegue nem alcançar essas rotas).
- 3 rotas públicas sem qualquer autenticação (`/public/landing`, `/public/partners`, `/public/banners`), cada uma restringindo o que expõe na própria query SQL (apenas `PUBLISHED`/`is_public=true`/`ACTIVE`-dentro-da-janela).

## QA real (navegador, staging local)

Executado contra `https://admin.localhost` real (staging local, Postgres real, com a migração 078 aplicada):

1. **Login como Platform Admin** → `Conteúdo → Landing` → editar hero title → salvar rascunho → **publicar** → confirmado via `GET /public/landing` que o conteúdo público reflete exatamente o publicado (screenshot: rascunho salvo, banner "Landing publicada com sucesso").
2. **Parcerias → Parceiros** → criar parceiro real → marcar como **público** e **ativo** → confirmado via `GET /public/partners` que o parceiro aparece no diretório público **sem** `internal_notes`/`contactEmail` (campos ausentes na resposta, não apenas vazios).
3. **Parcerias → Indicações** → criar indicação real → avançar `LEAD → CONTACTED → QUALIFIED → CONVERTED` → confirmado no funil da tela (contador CONVERTED: 1).
4. **Parcerias → Comissões** e **Parcerias → Créditos** → telas renderizam corretamente com o parceiro real disponível nos formulários.
5. **Conteúdo → Banners** e **Conteúdo → FAQ** → telas renderizam corretamente, formulários funcionais.

Um bug real foi encontrado e corrigido durante o próprio QA: a migração 078 nunca havia sido aplicada ao Postgres de staging (só ao banco de teste descartável), causando `42P01 undefined_table` em toda rota nova. Aplicada manualmente (`psql -f`) e revalidada com sucesso — documentado aqui em vez de omitido.

Estado de teste (parceiro e indicação de QA) removido do banco de staging após a validação, para não deixar dados de teste residuais.

## Testes automatizados

`services/api/tests/platform-commercial.test.ts` — **39/39 testes**, contra Postgres real descartável (mesmo padrão de `invitations-permission-restrictions.test.ts`):

- Validação de URL (aceita http(s)/caminho interno; rejeita protocol-relative, `javascript:`, `data:`, texto inválido) e sanitização de HTML/script em texto livre.
- Landing CMS: rascunho nunca vaza para o público; publish faz snapshot correto; seção desabilitada é excluída do snapshot; republish atualiza o público; tipo de seção inválido é rejeitado; auditoria registrada.
- Banners: criação e listagem por placement; período inválido rejeitado; banner fora da janela ou em DRAFT nunca aparece como ativo/público; placement inválido rejeitado.
- Parceiros: CRUD completo; parceiro não-público nunca aparece no diretório público; parceiro público+ativo aparece sem `contactEmail`/`internalNotes`; categoria inválida rejeitada.
- Indicações: ciclo completo `LEAD→CONTACTED→QUALIFIED→CONVERTED` com `convertedAt` setado; rejeição; `referrerType` inválido rejeitado.
- Créditos: ciclo `PENDING→AVAILABLE→APPLIED` com `appliedAt` setado; valor não-positivo rejeitado; agência inexistente rejeitada (via FK, não SELECT manual — ver nota técnica abaixo).
- Comissões: ciclo `PENDING→APPROVED→PAID` com `paidAt` setado, sem pagamento automático; parceiro inexistente rejeitado; benefício criado corretamente.
- HTTP: requisição não autenticada rejeitada (401); leitura permitida a qualquer role de plataforma; escrita negada a role não-admin (401); escrita permitida a `PLATFORM_ADMIN` com linha de auditoria real gravada; as 3 rotas públicas não exigem nenhuma autenticação de plataforma.

**Nota técnica** (achado real durante o desenvolvimento dos testes, corrigido): a tabela `agencies` tem `FORCE ROW LEVEL SECURITY` (migração 002), então uma consulta `SELECT` manual dentro de uma transação platform-scoped (`withPlatformTransaction`, que não define contexto de tenant) sempre retornaria zero linhas, mesmo para uma agência real. A verificação de existência de agência em `createReferralCredit` foi corrigida para depender da constraint de chave estrangeira (que roda internamente no Postgres, não sujeita a RLS da role que insere) em vez de um `SELECT` prévio.

## Gates executados (monorepo completo)

| Gate | Resultado |
|---|---|
| `npm run lint` | 0 erros (warnings pré-existentes apenas) |
| `npm run typecheck` | limpo |
| `npm run test` | 90/90 arquivos, 1526/1526 testes (API) + suítes das demais apps, todas verdes |
| `npm run test:security` | 5/5 arquivos, 58/58 testes |
| `npm run test:db` | 1/1 arquivo, 9/9 testes |
| `npm run build` | 7/7 pacotes |

Duas re-execuções foram necessárias por flakiness de infraestrutura local (conflito de nome de container Docker entre workers paralelos e um teste de formatação de moeda pré-existente e não relacionado a esta feature) — ambas confirmadas como não relacionadas ao código desta feature após reexecução isolada e limpeza do container órfão.

## Pendências (rodada original — ambas fechadas abaixo)

- ~~O link "Preview" da Landing CMS aponta para `/preview/landing`...~~ **Fechado.** Ver "Fechamento da META 01" abaixo.
- ~~A tela de Créditos pede o `agencies.id` diretamente em texto...~~ **Fechado.** Ver "Fechamento da META 01" abaixo.
- Nenhum pagamento automático de comissão, nenhuma alteração de billing recorrente, nenhum Marketplace/Amadeus/GDS — por instrução explícita (ver `docs/roadmap/MARKETPLACE_FUTURE.md`). Continua fora de escopo.

---

# Fechamento da META 01 — Landing Pública Dinâmica + UX de Créditos

Rodada curta, sem novo domínio, fechando as duas pendências acima.

- **Commit:** `9bcd2c5`
- **CI run:** `35452925381` — ✅ sucesso
- **Branch:** `main`

## 1. Integração com o app `marketing`

`apps/marketing/src/pages/LandingPage.tsx` agora consome `GET /public/landing`, `GET /public/partners` e `GET /public/banners` via um novo cliente (`apps/marketing/src/lib/publicCommercialApi.ts`), com o mesmo padrão de `fetch('/public/...')` já usado por `DemoRequest.tsx`/`TrialSignup.tsx` (sem prefixo `/api`, proxy já configurado em `vite.config.ts` e no `Caddyfile.local-staging`).

**Abordagem deliberadamente aditiva, não um redesign:**
- Hero title/subtitle/CTAs: se a landing publicada tiver esses campos preenchidos, sobrepõem o texto estático; senão, mantém o texto estático original como fallback — nunca quebra, nunca fica vazio.
- Seções **Parceiros**, **Depoimentos** e **FAQ**: só renderizam se houver conteúdo real publicado (parceiros públicos, ou seções `TESTIMONIALS`/`FAQ` habilitadas); ausentes por padrão, sem alterar o layout quando não há nada publicado.
- Banners: renderizados como uma faixa simples no topo, só quando há banner `ACTIVE` dentro da janela para o placement `LANDING`.
- As seções estáticas existentes (Áreas do produto, Segurança) **não foram tocadas**.

**Draft nunca vaza:** `getPublicLanding()` só chama `GET /public/landing`, que por sua vez só lê `platform_landing_publications` (nunca as tabelas de rascunho) — a mesma garantia de arquitetura da rodada anterior, agora com um consumidor real.

**Falha suave:** toda função do cliente (`getPublicLanding`, `getPublicPartners`, `getPublicBanners`) captura qualquer erro e retorna `null`/`[]` — uma API lenta, fora do ar, ou sem nada publicado nunca quebra a página pública.

**Cache:** `apps/marketing` é uma SPA estática (Vite, sem SSR). O fetch acontece em tempo de execução no navegador (`useEffect` no carregamento da página), não em build-time — portanto uma publicação no Platform Admin fica visível no próximo carregamento de página do visitante, sem rebuild e sem infraestrutura de invalidação de cache. Nenhuma infraestrutura de cache foi criada.

**Segurança:** além da validação já existente no backend (`assertSafeExternalUrl`), o cliente de marketing tem sua própria checagem client-side (`isSafeHref`, testada isoladamente) como defesa em profundidade antes de renderizar qualquer `href` dinâmico (CTA do hero, CTA de banner, link de parceiro) — nunca confia cegamente no valor armazenado. React escapa todo texto por padrão; nenhum `dangerouslySetInnerHTML` foi usado em lugar nenhum desta integração.

## 2. Preview (draft vs published)

`LandingCMSPage.tsx`: o botão "Preview" (antes um link quebrado para `/preview/landing`, uma rota que nunca existiu) agora abre um painel de preview **dentro do próprio Platform Admin**, renderizando os mesmos dados de rascunho já carregados pela página (`GET /platform/landing`, autenticado). Rotulado explicitamente "PREVIEW DO RASCUNHO — AINDA NÃO VISÍVEL AO PÚBLICO". Nunca sai por nenhuma rota pública — é só uma renderização local dos dados já em memória.

Confirmado por QA real: editar o rascunho e abrir o preview **não** altera o que `GET /public/landing` retorna; só depois de clicar em "Publicar" o público muda.

## 3. Seletor de agência em Créditos

Nenhum endpoint existente listava `agencies` de forma adequada para um seletor (`/platform/subscribers` retorna `subscriber_tenants.id`, uma tabela praticamente vazia no ambiente de staging — 0 de 26 agências tinham uma linha correspondente).

**Descoberta real durante a implementação:** a tabela `agencies` tem `FORCE ROW LEVEL SECURITY` (migração 002), então nenhuma consulta direta a partir de uma transação platform-scoped (sem contexto de tenant) jamais listaria mais de uma agência. Criar um novo endpoint de busca exigiria, portanto, ou enfraquecer a política de RLS de `agencies`, ou usar o mecanismo padrão do Postgres para esse exato cenário: uma função `SECURITY DEFINER` estreita.

`infrastructure/migrations/079_platform_agency_search.sql` cria `platform_search_agencies(search_query TEXT)`, uma função SQL `SECURITY DEFINER` de propriedade da role de migração (que tem `BYPASSRLS`), retornando **apenas** `id`, `name`, `slug`, `status` — nunca `cnpj`/`email`/`phone`/`address`/`settings`. **Nenhuma política de RLS existente foi alterada, criada ou enfraquecida** — `agencies_select_tenant` e as demais continuam exatamente como estavam; esta função é um escape hatch adicional, não uma mudança na política.

`GET /platform/agencies/search?q=` (novo, `platformAuthHooks`, leitura permitida a qualquer role de Platform Admin — não é uma escrita) chama essa função via `searchAgencies()` em `platform-commercial.ts`.

`CreditsPage.tsx`: campo de texto livre substituído por um seletor com busca (debounce de 250ms) por nome/slug/ID, mostrando nome + slug + status nos resultados e no próprio ledger (antes mostrava o `agencyId` cru).

## QA real (navegador, staging local) — fechamento da META 01

Executado contra `https://admin.localhost` e `https://www.localhost` reais (staging local, Postgres real, migrações 078+079 aplicadas):

1. **Landing:** editar hero do rascunho → salvar → **Preview** (painel mostra o novo texto, rotulado como rascunho) → landing pública (`www.localhost`) confirmada **sem alteração** → **Publicar** → landing pública confirmada **com o novo hero real**.
2. **Parceiros:** criar parceiro real → marcar público + ativo → landing pública confirmada exibindo a nova seção "Nossos parceiros" com o parceiro real, sem qualquer redesign do restante da página.
3. **Créditos:** buscar "Local Staging" no seletor → resultado real retornado (`Local Staging Agency (local-staging-agency · ACTIVE)`) → selecionar → criar crédito de R$ 250 → confirmado no ledger com nome/slug resolvidos (não o ID cru).

Estado de teste (parceiro e crédito de QA) removido do banco de staging após a validação.

## Testes automatizados — fechamento da META 01

- `services/api/tests/platform-commercial.test.ts` — agora **46/46 testes** (7 novos): busca de agência por nome parcial/ID exato/slug, nenhum resultado para query sem match, query vazia retorna lista real, resultado contém **apenas** `id`/`name`/`slug`/`status` (nenhum campo sensível), `GET /platform/agencies/search` exige autenticação de Platform Admin (401 sem auth), permitido para qualquer role autenticada (é leitura).
- `apps/marketing/src/lib/publicCommercialApi.test.ts` (novo, **8/8 testes**): `isSafeHref` aceita http(s) absoluto e caminho interno; rejeita protocol-relative, `javascript:`, `data:`, nulo/vazio/inválido.

## Gates executados (monorepo completo) — fechamento da META 01

| Gate | Resultado |
|---|---|
| `npm run lint` | 0 erros (warnings pré-existentes apenas) |
| `npm run typecheck` | limpo |
| `npm run test` | 90/90 arquivos, 1533/1533 testes (API) + suítes das demais apps, todas verdes |
| `npm run test:security` | 5/5 arquivos, 58/58 testes |
| `npm run test:db` | 1/1 arquivo, 9/9 testes (inclui a nova cobertura de grant da função `platform_search_agencies`) |
| `npm run build` | 7/7 pacotes |

Uma re-execução foi necessária por flakiness de infraestrutura local (conflito de nome de container Docker entre workers paralelos), confirmada como não relacionada ao código desta rodada após limpeza do container órfão e reexecução.

## Pendências (após o fechamento)

Nenhuma pendência não-bloqueante restante desta feature. Fora de escopo permanece, por instrução explícita: Marketplace, Amadeus/GDS, billing recorrente completo, pagamento automático de comissão (ver `docs/roadmap/MARKETPLACE_FUTURE.md`).

## Documentação

- `docs/product/PLATFORM_ADMIN_COMERCIAL_PARCERIAS.md`
- `docs/roadmap/MARKETPLACE_FUTURE.md`

---

## STATUS FINAL

**META 01 — FECHADA COMPLETAMENTE**
