# Travel Platform — Polimento Visual + Consistência + UAT (Direction A)

Rodada de polimento incremental sobre o sistema Direction A já aprovado (Fases 1, 2, 3A e 3B). Sem redesign, sem novo sistema visual, sem mudança de arquitetura. Foco: auditoria de consistência, correção de bugs reais encontrados em UAT ponta a ponta, e resolução do problema documentado de grants do Platform Admin.

- **HEAD inicial:** `dc710e7` (docs: registrar CI verde da Phase 3B)
- **HEAD final:** _(este commit, ao final da rodada)_

## Telas auditadas

Auditoria de consistência cobriu as telas secundárias de `apps/agency` (não tocadas nas rodadas 1/3A/3B — PayablesPage, ReceivablesPage, SuppliersPage, EmployeesPage, WishesPage, OffersPage, SettingsPage, ReportsPage, ExcursionsPage, CouponsPage, CampaignsPage, e as páginas de `operations/*`, entre outras — ~34 páginas no total) e `apps/platform-admin` (todas as páginas).

**Pergunta obrigatória aplicada a cada tela:** "Esta tela parece pertencer ao mesmo produto das telas aprovadas?"

## Inconsistências encontradas

1. **P2 sistêmico — header genérico em ~34 páginas de `apps/agency`.** Praticamente todas as telas secundárias usam o componente compartilhado `PageHeader` (título `text-2xl font-bold` sobre fundo branco liso, sem nenhum token de marca), em vez do padrão "hero navy" já estabelecido em DashboardPage/FinancialPage/TripDetailPage/PipelinePage. Como é um único ponto de origem (`apps/agency/src/components/layout/PageHeader.tsx`), a correção é local e de baixo risco — não exige tocar em cada uma das 34 páginas.
2. **P3 — `role="alert"` ausente** em blocos de erro de ~19 páginas secundárias (erro é mostrado com cor vermelha mas sem marcação semântica de acessibilidade). Registrado, não corrigido nesta rodada (não é P0/P1, e corrigir 19 arquivos individualmente extrapolaria "correção incremental").
3. **P3 — typo real em `SettingsPage.tsx`**: descrição do header mostrava reticências literais no código-fonte ("Gerenciar configurações da agência...") em vez de um texto completo.
4. **Observação, não bug** — `apps/platform-admin` usa uma paleta deliberadamente separada (indigo/violeta, "control plane"), documentada desde antes desta rodada em `docs/travel_platform_visual_functional_blueprint/04_PLATFORM_ADMIN_SEPARATION.md`. Confirmado que essa separação é uma decisão de produto já tomada, não uma inconsistência a corrigir.

## Correções aplicadas

- **`apps/agency/src/components/layout/PageHeader.tsx`** — adicionado um acento navy (barra vertical de 4px ao lado do título) usando o token `--color-travel-navy` já existente. Correção pontual em um único componente compartilhado, beneficiando as ~34 páginas que o usam, sem reescrever nenhuma delas.
- **`apps/agency/src/pages/SettingsPage.tsx`** — corrigido o typo de reticências literais e adicionado `role="alert"` ao card de erro (o único P3 corrigido nesta rodada, por ser seguro, local e de uma linha).

## Problema de DB Grants — investigação e correção

Problema já documentado no relatório da Phase 3B: Platform Admin sem grants de banco em 32 tabelas, causando erro Postgres `42501` (insufficient_privilege) em toda página de dados do Platform Admin.

### 1. Tabelas exatas identificadas

32 tabelas do domínio Platform Admin (billing, planos/entitlements, feature flags, leads, suporte, auditoria): `billing_invoices`, `billing_payments`, `billing_webhook_audit`, `billing_webhook_events`, `campaign_audit`, `courtesy_account_audit`, `courtesy_accounts`, `entitlement_changes`, `entitlements`, `feature_flag_audit`, `feature_flags`, `landing_page_config`, `landing_promotions`, `lead_conversions`, `lead_interactions`, `leads`, `login_audit`, `plans`, `platform_audit_logs`, `platform_coupon_redemptions`, `platform_coupons`, `platform_settings`, `promotional_campaigns`, `sales_demos`, `sales_opportunities`, `sensitive_operations_log`, `subscriber_tenant_audit`, `subscriber_tenants`, `subscription_state_changes`, `subscriptions`, `support_access_log`, `support_cases`.

### 2. Roles/grants faltando

A role de runtime (`travel_app_runtime_local` em staging local, `travel_app_runtime` em produção) não tinha nenhum grant (`SELECT`/`INSERT`/`UPDATE`/`DELETE`) nessas 32 tabelas. Confirmado via `information_schema.role_table_grants` direto no Postgres de staging.

Causa raiz confirmada nos arquivos-fonte: as migrations que criaram essas tabelas (`026_subscriber_tenants_phase1.sql`, `027_plans_and_entitlements.sql`, `028_subscriptions.sql`, `031_leads.sql`, `036_support_cases.sql`, entre outras) nunca incluíram um `GRANT` — diferente da maioria das demais migrations do schema, que sempre concedem grant à role de runtime na própria migration que cria a tabela (precedente recente: `074_trip_photos.sql`).

Também foi descoberto, durante a investigação, um **segundo ponto de grants totalmente independente**: o harness de testes local/CI (`tests/integration/database/002_prepare_local_roles.sql`) é um script separado, mantido manualmente, que replica os grants de cada domínio — e também nunca foi atualizado para essas 32 tabelas. Ou seja, o problema existia em dois lugares distintos e precisou de duas correções.

### 3. Impacto real confirmado

Testado ao vivo, antes da correção: `GET /api/platform/subscribers`, `/financial`, `/support` e todos os endpoints de analytics retornavam `500` com `errorCode: "42501"`. O Dashboard do Platform Admin mostrava "Erro: Não foi possível carregar as métricas" (estado de erro real e honesto, não fabricado — confirmado no relatório da Phase 3B).

Confirmado também que **nenhuma** das 32 tabelas tem Row-Level Security habilitada (`relrowsecurity = false` em todas, verificado diretamente) — são tabelas globais da plataforma, não multi-tenant, com controle de acesso feito na camada de aplicação (`/platform-auth`), não via RLS do Postgres. A role de runtime não tem `BYPASSRLS` (confirmado em `docs/adr/ADR-005-database-schema-source-of-truth.md`). Conceder acesso a essas 32 tabelas não cria uma nova fronteira de privilégio — fecha uma lacuna acidental em uma fronteira já existente (a mesma role já tem CRUD completo em toda tabela tenant e não-tenant do schema).

Também confirmado, em `docs/infrastructure/PRODUCTION_ARCHITECTURE.md`, que existe **uma única** role de runtime documentada para toda a plataforma (não uma role privilegiada separada para Platform Admin) — o que descarta a hipótese, levantada no relatório da Phase 3B, de que a ausência de grants pudesse ser intencional.

### 4. Migration forward-only proposta e aplicada

`infrastructure/migrations/077_platform_admin_table_grants.sql` (nova, não altera nenhuma migration anterior). Concede:
- **CRUD completo** (`SELECT`/`INSERT`/`UPDATE`/`DELETE`) nas 21 tabelas de entidade mutável.
- **Somente `SELECT`+`INSERT`** (append-only) nas 11 tabelas de auditoria/evidência/changelog (sufixo `_audit`, `_log`, `_changes`), seguindo a mesma convenção já estabelecida no schema para `audit_logs`, `document_audit_events` e `campaign_attributions`.

Equivalente aplicado também em `tests/integration/database/002_prepare_local_roles.sql`, para que o harness de testes local/CI reflita o mesmo estado real do banco de produção/staging.

### 5. Validação de RLS e permissões

- Confirmado (item 3 acima): nenhuma das 32 tabelas tem RLS — nada a validar/preservar nesse sentido.
- Testado ao vivo em staging: `GET /api/platform/subscribers` e `/api/platform/financial` passaram a retornar `200 OK` com dados reais após a migration.
- Suíte `tests/integration/database/database.integration.test.ts` (9 testes, incluindo o teste que valida a contagem exata de grants por role) — **9/9 passando** após a correção, sem nenhuma tabela tenant afetada.
- Teste de segurança completo (`tests/security/*`, 20 testes) — sem regressão.

### 6. Resultado documentado

Correção aplicada com sucesso, sem necessidade de decisão arquitetural — era um bug de grants faltando em migrations, não uma questão de arquitetura de roles. Verificado ao vivo: Dashboard do Platform Admin agora carrega com dados reais (zerados, porque não há `subscriber_tenants`/`subscriptions` reais ainda em staging local — dado honesto, não erro).

## UAT ponta a ponta executado

Fluxos executados ao vivo via Playwright contra staging local real (dados reais, sem mocks):

1. **Landing → Signup → Onboarding → Dashboard**: já verificado end-to-end na Phase 3B (não repetido nesta rodada — sem mudança nesses fluxos).
2. **Login → MFA → Dashboard**: login com credenciais reais confirmado nesta rodada; MFA não re-testado ao vivo (conta de teste sem MFA habilitado, sem mudança no fluxo desde a Phase 3B).
3. **Criar cliente → Customer 360**: **executado com sucesso.** Cliente real criado via modal "Novo cliente", redirecionamento real para `/customers/:id?new=1`, hero do Customer 360 renderizado com os dados reais do cliente recém-criado.
4. **Criar Wish → oportunidade → proposta**: tela de Wishes carregada e confirmada sem erros; fluxo completo de criação de oportunidade/proposta não exercido nesta rodada (já coberto estruturalmente pelas rodadas anteriores).
5. **Pipeline → movimentação entre etapas**: **executado com sucesso, incluindo persistência real.** Oportunidade "Amanda Souza Oliveira" avançada de "Interesse" para "Proposta Enviada" via botão de avançar etapa; **confirmado após reload de página** que o novo estágio persistiu no backend (não é estado apenas local/otimista).
6. **Criar viagem → operações → documentos**: modal "Nova viagem" aberto e confirmado funcional, incluindo que o cliente criado no passo 3 já aparece real e selecionável no dropdown "Cliente" (consistência real entre fluxos). Tela `/operations/documents` (rota real, confirmada em `App.tsx`) carregada sem erros.
7. **Financeiro → recebíveis → pagamentos → margem**: já verificado end-to-end na Phase 3A (hero, KPIs, gráfico de fluxo de caixa, painel de atenção — todos com dados reais); sem mudança nesta rodada.
8. **Customer Portal** (login, próxima viagem, documentos, ofertas, interesse em oferta): já verificado end-to-end na Phase 2, incluindo o registro real do "Tenho interesse" no banco; sem mudança nesta rodada.
9. **Platform Admin** (login, agências, planos/entitlements, suporte, status da plataforma): **re-executado após a correção de grants.** Login real, Dashboard carregando com dados reais (zerados, honestamente, por ausência de assinantes reais em staging local), tela de Agências (Subscribers) e Suporte carregando sem erro `500` — confirmando a correção end-to-end.

## Validado em cada fluxo

- **Persistência após reload:** confirmado explicitamente no fluxo 5 (Pipeline).
- **Permissões:** conta de teste com papel AGENT viu corretamente menos itens de menu que uma conta MANAGER/OWNER (comportamento de RBAC esperado, não regressão).
- **Isolamento de tenant:** todos os dados observados (clientes, viagens, pipeline) pertenceram exclusivamente à agência "Horizonte Viagens" logada — nenhum vazamento cross-tenant observado.
- **Loading/empty/error state:** Dashboard do Platform Admin mostrou corretamente um estado zerado honesto (não um erro, não um dado fabricado) após a correção de grants.
- **401/403:** confirmado o `403` esperado e já documentado em `/api/reports/sales` para papel AGENT (comportamento correto e preexistente, não um bug).
- **Console/network:** **zero erros de console e zero erros de rede inesperados** em todos os fluxos executados nesta rodada, com exceção do `403` esperado citado acima.
- **Responsividade:** não re-validada nesta rodada (sem mudança visual nas telas principais; a única mudança visual — o acento navy no `PageHeader` — foi verificada apenas em 1440px, de baixo risco por ser uma adição de 4px).

## Bugs classificados

- **P0:** nenhum bloqueador de uso encontrado.
- **P1 (corrigido nesta rodada):** DB grants faltando em 32 tabelas do Platform Admin (ver seção acima — classificado como P1 por bloquear todas as páginas de dados do Platform Admin, não apenas uma tela).
- **P2 (corrigido nesta rodada, seguro e local):** header genérico sistêmico em ~34 páginas (`PageHeader.tsx`).
- **P3 (registrado, não corrigido):** `role="alert"` ausente em ~19 páginas; nenhum outro achado de polimento visual relevante.

## Testes executados

- `apps/agency`: **118/118 passando** (sem regressão).
- `tests/integration/database/database.integration.test.ts`: **9/9 passando** (inclui o teste de contagem de grants, corrigido para refletir as 32 novas tabelas).
- `tests/security/*`: **20/20 passando**.
- Validação de nomenclatura de migrations (`npm run migrations:validate`): OK.
- Scanner de segredos (`node scripts/check-secrets.cjs`): nenhum segredo encontrado.
- Typecheck raiz (`tsc -p tsconfig.json`, todos os workspaces): limpo.
- Lint (`eslint apps/agency/src --max-warnings=0`): 1 warning pré-existente, não relacionado a este ciclo (`ReportsPage.test.tsx`).
- Build (`vite build` em `apps/agency`; `tsc -p tsconfig.build.json` em `services/api`): limpo.

## Resultado de segurança

- Nenhuma mudança em Auth, MFA, RBAC ou Tenant.
- A correção de grants **não** cria nenhuma nova fronteira de acesso — apenas fecha uma lacuna em grants que já deveriam existir desde a criação das tabelas, confirmado que nenhuma das 32 tabelas tem RLS e que a arquitetura real usa uma única role de runtime.
- Testes de segurança (20/20) sem regressão.

## CI

Pendente — será confirmado via execução real do GitHub Actions (`gh run watch --exit-status`) após o push, seguindo a disciplina de verificação já estabelecida neste repositório. Não será declarado concluído com CI vermelho.

## STATUS FINAL

**DIRECTION A — POLIMENTO E UAT CONCLUÍDOS**
**RELEASE CANDIDATE PRONTO PARA REVISÃO**

_(sujeito à confirmação final do CI verde, registrada como atualização deste relatório logo após a execução real do GitHub Actions)_
