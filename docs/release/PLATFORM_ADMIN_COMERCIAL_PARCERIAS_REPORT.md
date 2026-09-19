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

## Pendências

- O link "Preview" da Landing CMS aponta para `/preview/landing`, uma rota que o app `marketing` ainda precisa implementar para consumir `GET /public/landing`. A API pública já está pronta, testada e validada manualmente — falta apenas o consumo visual no app de marketing, fora do escopo desta rodada (spec não pediu alterações no app `marketing`).
- A tela de Créditos pede o `agencies.id` diretamente em texto, sem um seletor amigável — porque o endpoint `/platform/subscribers` existente retorna `subscriber_tenants.id`, não `agencies.id`. Corrigir isso exigiria expor `agency_id` nesse endpoint pré-existente, fora do escopo desta feature.
- Nenhum pagamento automático de comissão, nenhuma alteração de billing recorrente, nenhum Marketplace/Amadeus/GDS — por instrução explícita (ver `docs/roadmap/MARKETPLACE_FUTURE.md`).

## Documentação

- `docs/product/PLATFORM_ADMIN_COMERCIAL_PARCERIAS.md`
- `docs/roadmap/MARKETPLACE_FUTURE.md`

---

## STATUS FINAL

**PLATFORM ADMIN COMERCIAL & PARCERIAS — PRONTO PARA REVISÃO**
