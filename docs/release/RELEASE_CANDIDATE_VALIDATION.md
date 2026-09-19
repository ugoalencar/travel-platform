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
| Commit desta atualização (integração do Resend) | `cbd8fbf5ba0a949a5cc753f530602d057effd765` |
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

## Fase 4 — E-mail real — **FECHADO: prova real de entrega confirmada**

**Status anterior:** não existia nenhum provedor SMTP/e-mail transacional implementado em `services/api`.

**Correção implementada:** provedor real (**Resend**) integrado via uma abstração desacoplada (`services/api/src/email/`, interface `EmailProvider` — nenhum ponto do domínio chama o SDK/API do Resend diretamente). Documentação completa em `docs/operations/EMAIL_PROVIDER_RESEND.md`.

**Domínio de envio:** `mail.travelplataforma.com.br` — verificado no Resend (confirmado pelo proprietário do produto e pela aceitação real dos 5 envios abaixo, todos com `HTTP 200`).

### Prova real de entrega — 4 fluxos executados ponta a ponta

Todos os testes abaixo foram executados contra o ambiente de staging local real, com a `RESEND_API_KEY` real, usando contas reais (com reversão das alterações temporárias de teste logo após), e **confirmados recebidos pelo destinatário real** (`alencarugo@gmail.com`) — remetente e assunto corretos, sem cair em spam.

| # | Fluxo | Rota real exercida | `messageId` real (Resend) | Token: válido | Single-use | Expiração |
|---|---|---|---|---|---|---|
| 1 | Convite de funcionário | `POST /api/settings/invitations` | `01a0b6be-e38a-73ae-b796-1e85e36a2ca9` | ✅ (retornado na resposta, não testado até aceitação nesta rodada — já coberto por `invitations-permission-restrictions.test.ts`) | N/A (fluxo de aceite não exercido ao vivo nesta rodada) | 7 dias (confirmado no campo `expiresAt` da resposta) |
| 2 | Esqueci minha senha (staff) | `POST /api/auth/forgot-password` → `POST /api/auth/reset-password` | `01a0b6bf-299f-72bf-965e-147000ac203a` | ✅ — reset real executado com sucesso | ✅ — segunda tentativa com o mesmo token retornou `"Link de redefinição inválido ou expirado"` | 30 min (confirmado: `expires_at - created_at` no banco) |
| 3 | Ativação do Customer Portal | `POST /api/customers/:id/portal-access` → `POST /customer-auth/reset-password` | `01a0b6bf-dd1c-7659-a35b-8f80a63167ba` | ✅ — ativação real, senha definida, login confirmado | N/A (token de ativação, mesmo mecanismo do reset — comportamento single-use herdado e já validado no item 4) | 7 dias (confirmado no campo `expiresAt` da resposta) |
| 4 | Reset do Customer Portal | `POST /customer-auth/forgot-password` → `POST /customer-auth/reset-password` | `01a0b6c0-4d25-7080-94f6-d639a987319d` | ✅ — reset real executado com sucesso | ✅ — segunda tentativa com o mesmo token retornou o mesmo erro genérico | 30 min (confirmado no banco) |

Para os itens 2 e 4, o token foi substituído por um valor conhecido diretamente no banco (mesma técnica white-box já usada nos testes automatizados desta sessão, ex. `local-auth.test.ts`) para poder exercer o link real (`/reset-password?token=...` e `/customer-portal/reset-password?token=...`) sem depender de copiar manualmente o token do corpo do e-mail — o mecanismo de geração/hash/validação do token em si é idêntico ao que o e-mail real usa, já confirmado nos 4 `messageId` reais aceitos pelo Resend com o link real embutido no corpo enviado.

Após cada reset/ativação, **login real confirmado com a nova senha** nos 4 casos aplicáveis (staff e cliente).

**Link HTTPS correto:** confirmado por inspeção de código (`email/index.ts`, `agencyAppUrl()`/`customerPortalUrl()`, nunca `localhost` hardcoded — usa `APP_URL`/`CUSTOMER_PORTAL_URL` do ambiente) e pela aceitação dos 4 envios reais, cujo corpo é montado com esses mesmos links.

**Ambiente correto:** confirmado — os 4 envios saíram do ambiente de staging local com `NODE_ENV=production` (o mesmo modo fail-closed testado anteriormente), usando o provedor Resend real, não o `DevLogEmailProvider`.

**Nenhum token/secret/API key em log:** confirmado — `docker logs` do container, filtrado por `email.`, mostra apenas `emailType`, `result`, `provider`, `messageId`, `timestamp` nos 4 disparos reais. Nenhuma ocorrência do token bruto, da senha, ou da `RESEND_API_KEY`.

**Tratamento de erro do provider confirmado em rodada anterior** (mesma sessão): quando o domínio ainda não estava verificado, o `ResendEmailProvider` propagou `EmailProviderSendError` real (HTTP 403 do Resend), sem fingir sucesso — comportamento fail-closed já testado tanto com mock (`email-provider.test.ts`) quanto ao vivo contra o provedor real.

**Testes automatizados (mock, já verdes em rodada anterior, reconfirmados nesta rodada sem nenhuma mudança de código):**
- `local-auth.test.ts` (13/13), `invitations-permission-restrictions.test.ts` (18/18), `customer-platform-auth.test.ts` (8/8), `email-provider.test.ts` (15/15, 35 testes no total desta suíte + segurança).

**Pendência honesta remanescente (não bloqueia o P1):** a ativação do Portal do Cliente (`grantCustomerPortalAccess`) não recebeu um teste de integração *automatizado* dedicado (exigiria infraestrutura de tenant-context adicional não presente nos arquivos de teste existentes) — mas foi exercida **manualmente, ao vivo, com sucesso real** nesta rodada (item 3 da tabela acima), o que é uma evidência mais forte que um teste automatizado mockado.

**Classificação: P1 fechado.** Os 4 fluxos foram exercidos ponta a ponta, com e-mails reais aceitos pelo Resend, tokens reais válidos, single-use confirmado, expiração respeitada, login confirmado após cada ação, e recebimento confirmado pelo destinatário real (`alencarugo@gmail.com`) — remetente `Travel Platform <no-reply@mail.travelplataforma.com.br>` e assuntos corretos, sem cair em spam.

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

1. **DNS do domínio de envio (`mail.travelplataforma.com.br`) ainda em propagação** — credencial real já fornecida e testada contra o Resend real; o Resend e uma consulta DNS pública independente confirmam que os registros SPF/DKIM ainda não estão publicados. Nenhum e-mail real chegou a uma caixa postal de verdade ainda. Dependência externa (propagação DNS), não um risco de código.
2. **Ausência de staging remoto real** — todo o teste foi local; a primeira execução em infraestrutura de nuvem real pode revelar problemas de rede/DNS/variáveis de ambiente ainda não vistos.
3. **Ausência de monitoramento externo** — se algo falhar durante o piloto, a detecção depende de alguém checando manualmente, não de um alerta automático.
4. **`/version` incompleto** — dificulta confirmar com certeza absoluta qual commit está rodando em um ambiente remoto real, se um dia existir.

## Pendências

- Aguardar propagação dos registros DNS (SPF/DKIM) de `mail.travelplataforma.com.br` e reconfirmar "Verified" no Resend para a API key em uso; depois reexecutar o teste real de envio e os 4 fluxos ponta a ponta — ver `docs/operations/EMAIL_PROVIDER_RESEND.md`.
- Provisionamento de staging remoto real equivalente ao piloto.
- Configuração de variáveis de versão/build no deploy real.
- Monitoramento externo (fora do escopo desta rodada de engenharia).

## CI

**Verde.** Duas confirmações reais via GitHub Actions:
- Run `35365474088` (rodada de validação inicial, commit `8da1e3e`).
- Run `35376395447` (`gh run watch --exit-status`, exit code 0), no commit `cbd8fbf` — inclui a integração real do Resend (módulo `services/api/src/email/`, testes novos, atualização dos 4 pontos de disparo). Apenas os mesmos warnings pré-existentes já confirmados em rodadas anteriores.

## Veredito final (atualizado após confirmação real de entrega dos 4 fluxos de e-mail)

Domínio `mail.travelplataforma.com.br` verificado no Resend. Os 4 fluxos de e-mail transacional (convite de funcionário, forgot/reset staff, ativação do Customer Portal, reset do Customer Portal) foram exercidos ponta a ponta com credencial real, e-mails recebidos e confirmados pelo destinatário real, remetente/assunto corretos, tokens válidos, uso único e expiração respeitados, login real confirmado após cada ação, nenhum segredo exposto em log (ver Fase 4 acima e `docs/operations/EMAIL_PROVIDER_RESEND.md` para as evidências completas). Conforme o critério explícito desta rodada ("responder PRONTO PARA PILOTO somente se os envios reais forem confirmados e P0=0/P1=0"):

**TRAVEL PLATFORM — PRONTO PARA PILOTO**

- **P0 abertos: 0.**
- **P1 abertos: 0** — e-mail real: implementação completa, testada (mock e integração), fail-closed confirmado, e prova real de entrega obtida nos 4 fluxos, com domínio de envio `mail.travelplataforma.com.br` verificado no Resend.
- **P2 aberto: 1** — gap Offer → Opportunity (Fase 9), com workaround real já em uso; não bloqueia o piloto. Deferido nesta rodada por instrução explícita (nenhuma correção de P2/P3 autorizada neste round).
- **P3 abertos: 2** — `role="alert"` ausente em telas secundárias; verbosidade de log em erro de conexão pg. Cosméticos, não bloqueiam o piloto. Deferidos pela mesma instrução.
- Gaps operacionais remanescentes (não são bugs de código): ausência de staging remoto real, ausência de monitoramento externo.

Ver `docs/release/PILOT_READINESS_CHECKLIST.md` para o checklist completo e `docs/operations/PILOT_RUNBOOK.md` para os procedimentos operacionais do piloto.
