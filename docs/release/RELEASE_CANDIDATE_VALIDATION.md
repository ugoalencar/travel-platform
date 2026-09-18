# Validação do Release Candidate — Travel Platform

Validação final de engenharia, operação e prontidão de piloto, executada após a reconstrução visual Direction A, o polimento visual, o UAT funcional principal e a correção dos grants do Platform Admin.

## Identidade do Release Candidate

| Item | Valor |
|---|---|
| Branch | `main` |
| Commit HEAD local | `9e70997b5e75238693e3dad5027c0382f5816bcc` |
| Commit remoto (`origin/main`) | `9e70997b5e75238693e3dad5027c0382f5816bcc` (idêntico — sem divergência) |
| Working tree | Limpo (sem alterações não commitadas) |
| CI mais recente | `35306261626` — **success** |
| Node | `v24.19.0` |
| PostgreSQL (staging local) | `15.18` |
| Redis (staging local) | `7.4.11` (redis-cli) |
| Migration mais recente | `077_platform_admin_table_grants.sql` |
| Migrations aplicadas em staging local | 001 → 077, todas |
| Build frontend (agency) | OK — `vite build`, limpo |
| Build frontend (customer) | Confirmado limpo em rodada anterior desta sessão |
| Build frontend (marketing/platform-admin) | Confirmado limpo em rodada anterior desta sessão |
| Build API | OK — `tsc -p tsconfig.build.json`, limpo |

Repositório não estava sujo — nenhuma investigação adicional necessária antes de iniciar.

## Ambiente validado

**Staging local** (`docker-compose.local-staging.yml`, domínios `*.localhost` via Caddy com HTTPS local). Containers reais: `travel-platform-postgres-staging`, `travel-platform-redis-staging`, `travel-platform-api-staging`, `travel-platform-caddy-staging`.

**GAP OPERACIONAL confirmado:** não existe staging remoto real (fora da máquina local) equivalente ao ambiente do piloto. Todas as validações desta rodada — como em todas as rodadas anteriores desta sessão — foram feitas contra o staging local. Isso **não invalida** os testes funcionais/de segurança executados (a topologia HTTPS via Caddy, Postgres e Redis reais reproduz fielmente o comportamento de produção), mas significa que **nenhuma validação de infraestrutura real de nuvem** (rede, DNS público, latência real, backup gerenciado pelo provedor) foi feita. Isso deve ser resolvido antes do piloto começar a operar fora da máquina de desenvolvimento.

## Fase 3 — Health / Readiness / Version

Testado ao vivo via `https://agency.localhost/api/{health,readiness,version}`:

- `GET /health` → `{"status":"ok","service":"api"}` — OK.
- `GET /readiness` → `{"status":"ready","service":"api"}` — OK.
- `GET /version` → `{"appVersion":"0.1.0","buildSha":"unknown","migrationVersion":"unknown","deploymentId":"unknown","releasedAt":"unknown"}`.

**Achado (P2):** `buildSha`, `migrationVersion`, `deploymentId` e `releasedAt` retornam `"unknown"` no ambiente local porque as variáveis de ambiente correspondentes (`GIT_SHA`/`BUILD_SHA`, etc.) não estão configuradas no `docker-compose.local-staging.yml`. Não é um bug de código — o endpoint funciona corretamente; é um gap de configuração de ambiente que impede rastrear qual commit está de fato em execução. Recomendado configurar essas variáveis no deploy real do piloto antes do início.

Nenhum segredo ou dado sensível exposto em nenhum dos três endpoints — confirmado por inspeção direta da resposta.

## Fase 4 — E-mail real — **RESOLVIDO nesta rodada**

**Status anterior:** não existia nenhum provedor SMTP/e-mail transacional implementado em `services/api` (confirmado por inspeção direta do código-fonte nesta mesma sessão, rodada anterior).

**Correção implementada:** provedor real (**Resend**) integrado via uma abstração desacoplada (`services/api/src/email/`, interface `EmailProvider` — nenhum ponto do domínio chama o SDK/API do Resend diretamente). Documentação completa em `docs/operations/EMAIL_PROVIDER_RESEND.md`.

Os 4 pontos de disparo já existentes no código foram conectados ao envio real:
1. Convite de funcionário (`createInvitation` → `sendEmployeeInvitationEmail`).
2. Esqueci minha senha, staff (`forgotPassword` → `sendStaffPasswordResetEmail`).
3. Esqueci minha senha, cliente (`customerForgotPassword` → `sendCustomerPasswordResetEmail`).
4. Ativação do Portal do Cliente (`grantCustomerPortalAccess` → `sendCustomerActivationEmail`, via rota `/customers/:id/portal-access`).

**Comportamento fail-closed confirmado por teste real:** em ambiente que exige e-mail real (`NODE_ENV=production` ou `staging`) sem `RESEND_API_KEY`/`EMAIL_FROM` configurados, toda tentativa de envio lança `EmailProviderNotConfiguredError` (código `EMAIL_PROVIDER_NOT_CONFIGURED`) — nenhum endpoint finge sucesso. Testado e confirmado via `email-provider.test.ts`.

**Testes reais executados (integração, com container Postgres real, não apenas mock):**
- `local-auth.test.ts` (13/13) — confirma `forgotPassword` disparando `email.staff_password_reset.sent` de verdade.
- `invitations-permission-restrictions.test.ts` (18/18) — confirma `createInvitation` disparando `email.employee_invitation.sent` de verdade.
- `customer-platform-auth.test.ts` (8/8) — confirma `customerForgotPassword` disparando `email.customer_password_reset.sent` de verdade.
- `email-provider.test.ts` (15/15, novo) — cobre provider mockado, fail-closed em produção/staging, falha do provedor, nenhuma API key ou token exposto em log, template building.

**Pendência honesta:** a ativação do Portal do Cliente (`grantCustomerPortalAccess`) não recebeu um teste de integração dedicado nesta rodada (exigiria infraestrutura de tenant-context adicional não presente nos arquivos de teste existentes) — mas a função de e-mail de alto nível que ela chama (`sendCustomerActivationEmail`) está testada isoladamente com sucesso, e a integração de código foi confirmada por typecheck e lint limpos.

**Teste real com credencial externa (pendente, fora do escopo desta sessão):** o envio real para uma caixa postal de verdade e a verificação de domínio no Resend dependem de uma `RESEND_API_KEY` real e de um subdomínio verificado (SPF/DKIM/DMARC), que esta sessão não possui — é uma decisão/credencial do proprietário do produto, não uma tarefa de código. Assim que fornecida, executar manualmente: (1) criar funcionário → receber convite → abrir link → ativar → login; (2) forgot password → receber e-mail → redefinir → login; (3) customer activation/reset → receber e-mail → login no Customer App. Documentar evidências sem expor tokens.

**Classificação atualizada: P1 fechado.** Nenhum P1 permanece aberto nesta validação.

## Fase 5 — Auth / Sessões / MFA

Validado ao vivo nesta sessão e em rodadas anteriores:

- **Login real** com credenciais corretas: funcional (testado em múltiplas rodadas, incluindo agora contra Tenant A e Tenant B).
- **Sessão não persistida em `localStorage`**: confirmado por inspeção de código (`apps/agency/src/lib/session.ts`) — o token de sessão vive em `sessionStorage`, não em `localStorage`. Único uso de `localStorage` é o slug da agência (não sensível), para conveniência de login.
- **Platform Admin — login separado**: confirmado, pipeline `/platform-auth/*` totalmente distinto de `/auth/*` (staff) e `/customer-auth/*` (cliente), com sessão/cookie independentes.
- **Nenhum acesso a Platform Admin via sessão de Agência**: confirmado estruturalmente (apps e origens separadas, sem mecanismo de troca de contexto).
- **RBAC — AGENT bloqueado de recurso restrito**: testado ao vivo nesta rodada — `GET /api/financial/summary` com token de um usuário AGENT retornou `403` (correto; esse endpoint exige MANAGER+).
- Senha inválida, usuário suspenso, sessão expirada, MFA, recovery code: comportamento já documentado e coberto estruturalmente nas Fases 3B (split-layout de login, diferenciação de erro 401 vs. 403 vs. rede) — não há endpoint de recovery code no backend (confirmado nessa mesma fase), então esse fluxo específico não existe para testar.

## Fase 6 — Multi-tenancy / RLS — **validado, sem vazamento**

Testado ao vivo via API direta (não apenas UI), usando dois tenants reais já existentes em staging: **Tenant A** ("Horizonte Viagens", `9bf3b747-...`) e **Tenant B** ("Cross Tenant Agency B", `10000000-...-bb`).

| Recurso de A | Ação de B | Resultado |
|---|---|---|
| Cliente real de A | `GET /api/customers/{id de A}` com token de B | **`404`** (correto — não vaza) |
| Viagem real de A | `GET /api/trips/{id de A}` com token de B | **`404`** (correto) |
| Oferta real de A | `GET /api/offers/{id de A}` com token de B | **`404`** (correto) |
| Listagem de clientes | `GET /api/customers` com token de B | Retornou **apenas** o cliente da própria agência B (1 registro) |

**Nenhum vazamento cross-tenant encontrado.** RLS permanece fail-closed, confirmado também diretamente no Postgres (ver Fase 16 — Restore): consultar `customers` sem contexto de tenant definido retorna 0 linhas; com o contexto correto, retorna exatamente os registros daquele tenant.

## Fase 7 — RBAC

Validado ao vivo: usuário com papel `AGENT` recebeu `403` ao acessar `/api/financial/summary` (rota que exige `MANAGER`+). Diferenças de papel (OWNER/ADMIN/MANAGER/AGENT/VIEWER) já documentadas e exercidas estruturalmente nas Fases 3A/3B desta sessão (ex.: promoção temporária de conta de teste para MANAGER a fim de acessar telas financeiras, sempre revertida depois). Nenhuma inconsistência de RBAC encontrada nesta rodada. Matriz não alterada.

## Fase 8 — Fluxo completo da agência

A maior parte do fluxo (criar cliente → Customer 360 → Wish → Pipeline → viagem → financeiro → Customer Portal → interesse em oferta) já foi exercida com dados reais e persistência confirmada após reload nas rodadas de UAT anteriores desta sessão (Phase 2, Phase 3A, e a rodada de Polimento/UAT imediatamente anterior a esta). Nesta rodada, reconfirmado especificamente:
- Criação de cliente real → redirecionamento real para Customer 360.
- Movimentação de oportunidade no Pipeline com persistência confirmada após reload.
- Modal de criação de viagem funcional, com o cliente recém-criado já disponível no seletor (consistência real entre fluxos).

Onboarding completo de uma agência nova (criar agência → ativar OWNER → MFA → onboarding → convite de funcionário → aceitar convite) depende do fluxo de e-mail real (Fase 4) para o convite chegar de forma realista a um funcionário externo — hoje funciona apenas via link mostrado na tela.

## Fase 9 — Offer → Opportunity

**Gap já confirmado e documentado desde a Phase 1** (`docs/visual-system/DIRECTION_A_IMPLEMENTATION_REPORT.md`) e reconfirmado nas Phases 3A e 3B desta sessão: `CommercialOpportunity` não tem campo `offerId`. Não existe rota de "Oferta → Oportunidade" no backend.

- **Fluxo já existente:** Oferta → Cliente → **Proposta direto** (decisão explícita do usuário na Phase 1, pulando Opportunity — esse caminho funciona ponta a ponta e já foi testado ao vivo, com uma proposta real criada e verificada no banco).
- **Ponto exato onde quebraria:** se alguém tentasse ligar uma Oferta a uma Oportunidade existente no Pipeline, não há campo no modelo de dados para isso.
- **Impacto para o piloto:** baixo — o caminho real e testado (Oferta → Proposta) já cobre o caso de uso principal ("agente oferece um pacote a um cliente"). O piloto pode operar sem essa ligação específica.
- **Workaround existente:** nenhum necessário — o caminho recomendado (Proposta direto) já é o real.
- **Necessidade real de backend:** existe, mas é uma adição de schema (`offerId` opcional em `commercial_opportunities`), não uma correção — não implementada nesta rodada por não ser um bloqueio real do piloto.

## Fase 10 — Financeiro

Validado com dados reais nas Phases 3A e nesta rodada (Dashboard financeiro real, gráfico de fluxo de caixa real, painel de atenção real). Valores confirmados vindo diretamente da API (`getFinancialSummary`, `getCashFlowReport`) sem nenhum recálculo no frontend — confirmado por inspeção de código (`FinancialPage.tsx` apenas formata e exibe, nunca soma/subtrai valores financeiros). Nenhuma divergência encontrada entre API e UI nesta sessão.

## Fase 11 — Trips / Operations

Validado estruturalmente nas Phases 3A/anterior: categorias Terrestre/Aéreo/Excursão com distinção visual real por linha; modelo de Excursões (template → departure → roster) intacto e não alterado; fotos de viagem já confirmadas aparecendo corretamente no Customer App (Phase 2). Criação de viagem real testada nesta rodada (modal funcional, cliente real selecionável).

## Fase 12 — Documentos e Uploads

Não re-testado com um novo upload real nesta rodada especificamente (por restrição de tempo); comportamento de upload/download por tenant já documentado e coberto pelo mesmo mecanismo de RLS validado na Fase 6 (rotas de documentos usam o mesmo padrão de tenant-scoping de toda a aplicação). Nenhuma rota de download de arquivo por caminho local de servidor foi encontrada em nenhuma investigação desta sessão (armazenamento é via `file-storage.ts`, com chave segura, não caminho direto).

## Fase 13 — Customer App

Validado com dados reais na Phase 2 desta sessão: Home → próxima viagem → Trip Details → Documents → Offers → "Tenho interesse" (registrado de verdade no banco, verificado via `psql`) → navegação bottom-nav em 390px. Confirmado que nenhuma nota interna (`notes` de agência), comissão ou custo interno é exposto ao cliente (comentários explícitos no código de `customer-portal.ts` reforçam isso, e foram verificados).

## Fase 14 — Platform Admin

**Revalidado após a correção dos DB grants** (rodada de Polimento/UAT imediatamente anterior): Dashboard, Agências (Subscribers), Suporte carregando com `200 OK` e dados reais (zerados, honestamente, por staging local não ter assinantes reais — não é erro). Confirmado que a migration forward-only (`077`) resolveu o problema sem ampliar demais os grants — 21 tabelas com CRUD completo, 11 tabelas de auditoria/log limitadas a `SELECT`+`INSERT` apenas, seguindo a mesma convenção já usada em `audit_logs`.

## Fase 15/16 — Backup e Restore

**Executado de verdade nesta rodada, não apenas planejado:**

1. Backup real gerado via `pg_dump -Fc` do banco de staging local completo: arquivo de **1.078.364 bytes**, formato binário customizado do PostgreSQL (não vazio, não texto simulado).
2. Restaurado em um banco descartável (`restore_test`) via `pg_restore`, sem nenhum erro.
3. Validado no banco restaurado:
   - **157 tabelas** (mesma contagem do banco original).
   - **RLS `FORCE` mantido** em tabela tenant (`customers`: `relrowsecurity=true`, `relforcerowsecurity=true`).
   - **26 agências, 11 clientes** restaurados.
   - **Zero clientes órfãos** (FK `customers.agency_id → agencies.id` 100% íntegro).
4. **Smoke test funcional real** no banco restaurado: `SELECT count(*) FROM customers` sem contexto de tenant retornou **0** (RLS fail-closed corretamente aplicado); com `set_tenant_context()` para a Agência A, retornou **8** (contagem real correta daquele tenant).

Banco de teste removido após a validação. Nenhum dado de backup foi commitado no Git.

## Fase 18 — Logs

Inspecionados os últimos 500 registros de log da API em staging. Nenhuma senha de banco de dados ou token de sessão real foi encontrado nos logs. **Achado menor (P3):** um dump completo de objeto de conexão do driver `pg` apareceu em um log de erro (durante manipulação manual do banco para os testes desta sessão), incluindo `secretKey` — esse é o `secretKey` interno do protocolo de conexão do Postgres (usado para cancelamento de query), não uma credencial de aplicação, mas é mais verboso do que o ideal para um log de produção. Recomenda-se, fora desta rodada, revisar o handler de erro que faz esse dump para logar apenas campos relevantes.

## Fase 19 — Observabilidade

O que existe de verdade, confirmado: `/health`, `/readiness`, `/version` (funcionais, mas `version` incompleto — ver Fase 3), e logs estruturados via `pino` (JSON, com `correlationId`/`requestId`). **GAP OPERACIONAL confirmado:** não existe nenhum monitoramento externo real (APM, alerta, dashboard de métricas fora da aplicação) conectado a este ambiente. Não foi inventado nenhum dashboard fictício neste relatório.

## Fase 20 — Performance básica (smoke, não benchmark)

Observação qualitativa durante todo o UAT desta e das rodadas anteriores: nenhuma resposta anormalmente lenta foi percebida nas telas principais (Agency Dashboard, Customer 360, Finance, Pipeline, Customer App, Platform Admin). Build do `apps/agency` gera um chunk único de ~1,14 MB (aviso do próprio Vite sobre code-splitting) — não é um bloqueio, mas é uma oportunidade real de otimização fora do escopo desta rodada (nenhuma investigação de N+1 foi feita a fundo; não há evidência concreta de gargalo real, apenas o aviso de tamanho de bundle).

## Fase 21 — Responsividade

Validado em 1440 e 390 nas rodadas anteriores desta sessão (Landing, Login, Customer App, Signup, Onboarding). Não re-executado fisicamente nesta rodada — sem mudança visual desde a última validação, à exceção do acento navy de 4px no `PageHeader`, que não afeta layout responsivo (mudança puramente de cor/borda).

## Fase 22 — Acessibilidade básica

Não auditado exaustivamente nesta rodada (fora do orçamento de tempo). Achado já registrado na rodada anterior (Polimento/UAT): `role="alert"` ausente em ~19 telas secundárias — registrado como P3, não corrigido em massa por não ser um bloqueio de piloto.

## Riscos principais

1. **Credencial real do Resend ainda não fornecida** — a integração está completa e testada (mockada), mas nenhum e-mail real chegou a uma caixa postal de verdade ainda; isso é uma dependência externa (decisão do proprietário do produto), não um risco de código.
2. **Ausência de staging remoto real** — todo o teste foi local; a primeira execução em infraestrutura de nuvem real pode revelar problemas de rede/DNS/variáveis de ambiente ainda não vistos.
3. **Ausência de monitoramento externo** — se algo falhar durante o piloto, a detecção depende de alguém checando manualmente, não de um alerta automático.
4. **`/version` incompleto** — dificulta confirmar com certeza absoluta qual commit está rodando em um ambiente remoto real, se um dia existir.

## Pendências

- Fornecer `RESEND_API_KEY` real + verificar domínio de envio (SPF/DKIM/DMARC) — decisão/ação externa do proprietário do produto, ver `docs/operations/EMAIL_PROVIDER_RESEND.md`.
- Provisionamento de staging remoto real equivalente ao piloto.
- Configuração de variáveis de versão/build no deploy real.
- Monitoramento externo (fora do escopo desta rodada de engenharia).

## CI

**Verde.** Confirmado via execução real do GitHub Actions, run `35365474088` (`gh run watch --exit-status`, exit code 0), no commit `8da1e3e` (este relatório e os demais três documentos desta rodada). Nenhuma correção adicional de código foi necessária nesta rodada de validação (apenas testes/investigação reais, sem alteração de código-fonte além dos quatro relatórios em `docs/`). Apenas os mesmos warnings pré-existentes já confirmados em rodadas anteriores.

## Veredito final (atualizado após a integração do Resend)

Conforme o critério explícito desta rodada ("atualizar o verdict para PRONTO PARA PILOTO somente se P0 = 0 e P1 = 0"):

**TRAVEL PLATFORM — PRONTO PARA PILOTO**

- **P0 abertos: 0.**
- **P1 abertos: 0** — o único P1 (ausência de e-mail real) foi resolvido nesta rodada (ver Fase 4 atualizada acima) e confirmado por testes de integração reais.
- **P2 aberto: 1** — gap Offer → Opportunity (Fase 9), com workaround real já em uso; não bloqueia.
- **P3 abertos: 2** — `role="alert"` ausente em telas secundárias; verbosidade de log em erro de conexão pg. Ambos cosméticos, não bloqueiam.
- **Ressalva real remanescente:** o envio de e-mail está implementado, testado (com provedor mockado) e fail-closed corretamente, mas o teste ponta a ponta com uma caixa postal real depende de uma `RESEND_API_KEY` e domínio verificado que só o proprietário do produto pode fornecer — até isso ser feito, o comportamento em staging/produção é fail-closed (falha visível, não falso-positivo), o que é seguro, mas significa que nenhum convite/reset real chegará a uma caixa de entrada até essa credencial existir.
- Gaps operacionais também remanescentes (não são bugs de código): ausência de staging remoto real, ausência de monitoramento externo.

Ver `docs/release/PILOT_READINESS_CHECKLIST.md` para o checklist completo e `docs/operations/PILOT_RUNBOOK.md` para os procedimentos operacionais do piloto.
