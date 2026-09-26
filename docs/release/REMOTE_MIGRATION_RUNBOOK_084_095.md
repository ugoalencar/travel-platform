# Runbook — Migrations remotas 084..096 + role de plataforma + hardening da Data API

> Nome do arquivo mantido (`..._084_095.md`) por ser referenciado em scripts e templates; o escopo atual é **084..096**.

- **Status:** preparado, **não executado**. Nenhuma migration foi aplicada no banco remoto.
- **Alvo:** produção (Supabase, pooler `aws-0-us-east-1.pooler.supabase.com`, database `postgres`).
- **Migrations:** 001..096 (096 = [`096_supabase_data_api_hardening.sql`](../../infrastructure/migrations/096_supabase_data_api_hardening.sql)).
- **Arquivos operacionais (não são migrations):** em [`infrastructure/ops/`](../../infrastructure/ops/)

| Arquivo | Uso | Produção? |
|---|---|---|
| `create_platform_role.sql` | cria/valida `travel_app_platform` (senha via variável psql) | sim (T2) |
| `verify_084_095.sql` | schema/RLS/grants/roles de 084..095 — somente leitura | sim |
| `verify_096_data_api.sql` | privilégios efetivos de `anon`/`authenticated` + regressão dos roles da app — somente leitura | sim |
| `test_096_data_api_roles.sql` | executa SELECT/INSERT/UPDATE/DELETE/TRUNCATE como `anon`/`authenticated` | **NUNCA** (só clone; exige `-v i_am_not_production=yes`) |
| `backup_production.sh` | dump + SHA-256 + restore validado + contagem de linhas | sim (T0) |

## 0. Estado remoto verificado (2026-09-26, somente leitura)

| Item | Resultado |
|---|---|
| Última migration aplicada | **083** (082 e 083 presentes; 084 ausente; enum da 086 ausente) |
| Migrations faltando | 084..096 |
| Tabela de histórico de migrations | **não existe** (estado inferido pelo schema) |
| `travel_app_runtime` | LOGIN, NOSUPERUSER, NOBYPASSRLS ✓ — SELECT/INSERT/UPDATE/DELETE nas 170 tabelas, concedidos por `postgres` |
| `travel_app_platform` | **não existe** |
| Tabelas e funções que a 095 referencia | todas presentes |
| Colunas novas `NOT NULL` sem default | nenhuma |
| `NODE_ENV` da API na Render | **provavelmente `staging`** (padrão do `Dockerfile`; a API não envia HSTS, que só sai com `NODE_ENV=production`) |
| **Exposição da Data API (P1)** | `anon`/`authenticated` com SELECT/INSERT/UPDATE/DELETE/TRUNCATE nas **170** tabelas (44 de plataforma **sem RLS**: `platform_users`, `platform_sessions`, `billing_*`, `subscriptions`, `subscriber_tenants`, `support_*`, `leads`, `feature_flags`, `platform_settings`, audit logs…), em **2** sequences e `EXECUTE` em `platform_search_agencies` (`SECURITY DEFINER` → enumeração de agências de todos os tenants via RPC). Os default privileges de `postgres` concedem o mesmo a **todo objeto novo**. |

### Causas dos 500

| Rota | Causa | Status |
|---|---|---|
| `GET /offers`, `GET /proposals`, `GET /commercial/engagements` | colunas das migrations 084/087/088/093 inexistentes → `42703` | **CONFIRMADO** (clone real, código `3512438`) |
| `POST /settings/onboarding/complete` | `Content-Type: application/json` sem corpo → Fastify `FST_ERR_CTP_EMPTY_JSON_BODY` (um 400), convertido em **500** pelo error handler (`services/api/src/errors.ts` só trata `BODY_TOO_LARGE`). Sem o header → 200. O frontend Agency omite o header (`apps/agency/src/lib/api.ts`), então o 500 vem de chamadas de API/scripts. | **PROVÁVEL** — confirmar no log da Render (`errorCode: FST_ERR_CTP_EMPTY_JSON_BODY`) |

O mesmo bug converte em 500 os erros `FST_ERR_CTP_INVALID_JSON_BODY` (JSON inválido) e `FST_ERR_CTP_INVALID_MEDIA_TYPE` (content-type não suportado), reproduzidos no clone. Correção proposta, fora desta janela: o error handler deve responder com o `statusCode` 4xx do erro do Fastify e uma mensagem genérica.

## 1. Dry run com o schema REAL de produção — PASS (2026-09-26)

Procedimento: `pg_dump 17 --schema-only --schema=public` de produção (somente leitura, 0 linhas de dados, 170 tabelas) → restaurado em `postgres:17` local. Os objetos passaram a pertencer a um dono **não superuser** com `CREATEROLE`/`CREATEDB`/`BYPASSRLS`, que emula o `postgres` da Supabase, com os mesmos default privileges para `anon`/`authenticated`/`service_role`.

| Etapa | Resultado |
|---|---|
| Precheck | `f|f|f|t` → estado 083 |
| Baseline `verify_096_data_api.sql` | 12 FAIL (exposição confirmada) |
| Baseline `test_096_data_api_roles.sql` | `anon` e `authenticated`: SELECT/UPDATE/DELETE/TRUNCATE permitidos em 170/170 tabelas; INSERT em 44 (as 126 com RLS bloqueiam no `WITH CHECK`); RPC `platform_search_agencies` permitida |
| 084..094 | OK (086 em autocommit, demais `--single-transaction`) |
| `create_platform_role.sql` + login | OK |
| 095 | OK — `verify_084_095.sql` **47/47** |
| Tabelas novas antes da 096 | **expostas** (ex.: `anon` SELECT `media_assets` = true), pelos default privileges |
| 096 (e reaplicada: idempotente) | OK |
| `verify_084_095.sql` após 096 | **47/47 PASS** |
| `verify_096_data_api.sql` após 096 | **15/15 PASS** |
| `test_096_data_api_roles.sql` após 096 | **1.750/1.750 tentativas negadas** (175 tabelas × SELECT/INSERT/UPDATE/DELETE/TRUNCATE × 2 roles) + RPC negada; runtime, plataforma e role de migração OK |

**Regressão de aplicação** (API `3512438` + trava local, contra o clone na 096, com `DATABASE_URL` = runtime e `PLATFORM_DATABASE_URL` = plataforma): signup público, login staff, onboarding (sem o header), `GET/POST /offers`, `POST /customers`, `/proposals`, `/commercial/engagements`, `/commercial/tasks`, `/agency-communications`, `/media-assets`, login do cliente, `/customer-api/offers`, `/customer-api/communications`, tracking de view, login do Platform Admin, `/platform/plans`, `/platform/subscribers`, `/platform/agencies/search` → todos **200/201**.

**Local/CI:** `npm run test:db` 13/13 e `platform-commercial.test.ts` 46/46 com a 096 (os roles `anon`/`authenticated` não existem localmente; roda só o `REVOKE ... FROM PUBLIC` da `platform_search_agencies`).

**Observação (P3):** a policy `agency_communications_select_tenant` (085) usa `current_setting('app.current_agency_id')` sem `missing_ok`, diferente das demais, que usam `current_agency_id()`. Para quem não tem contexto, isso gera erro `42704` em vez de "0 linhas". Não vaza dados, mas é inconsistente.

## 2. Pré-requisitos (bloqueantes)

1. **Acesso à Render** do serviço da API (seção 8).
2. **Postgres 17 tooling:** container `postgres:17` local (usado pelos scripts) ou cliente 17 instalado.
3. **Janela de manutenção** curta: o Platform Admin fica indisponível entre a T3 e a T4.
4. Variáveis **exportadas no shell do operador** (nunca gravadas em arquivo versionado):
   - `DATABASE_ADMIN_URL` — `postgres` em **session mode, porta 5432** (não usar o transaction pooler 6543).
   - `TRAVEL_APP_PLATFORM_PASSWORD` — senha nova e forte do role de plataforma.
5. **Dry run da seção 1 repetido no mesmo dia** com dump de schema novo: exigir 47/47, 15/15 e 0 permitidos.

> As travas locais recusam hosts remotos só nos scripts de dev e no boot da API fora de produção. Os comandos `psql` deste runbook são manuais e explícitos por design.

## 3. PRECHECK — somente leitura

```bash
psql "$DATABASE_ADMIN_URL" -At -c "SELECT current_user, current_database(), version();"
psql "$DATABASE_ADMIN_URL" -At -c "
  SELECT 'offers.featured (084)', EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_name='offers' AND column_name='featured')
  UNION ALL SELECT 'agency_communications (085)', to_regclass('public.agency_communications') IS NOT NULL
  UNION ALL SELECT 'EngagementType.OFFER_VIEWED (086)', EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
           WHERE t.typname='EngagementType' AND e.enumlabel='OFFER_VIEWED')
  UNION ALL SELECT 'customer_protocol_seq (083)', to_regclass('public.customer_protocol_seq') IS NOT NULL;"
# Esperado: f, f, f, t -> banco em 083. Outro resultado: PARAR.

V=(-v ON_ERROR_STOP=1 -v runtime_role=travel_app_runtime -v platform_role=travel_app_platform)
psql "$DATABASE_ADMIN_URL" "${V[@]}" -f infrastructure/ops/verify_084_095.sql     > precheck_verify_084_095.txt
psql "$DATABASE_ADMIN_URL" "${V[@]}" -f infrastructure/ops/verify_096_data_api.sql > precheck_verify_096.txt
```

## 4. BACKUP — obrigatório antes de qualquer escrita (T0)

1. Painel da Supabase → **Database → Backups**: anote o horário do último backup diário e se o PITR está disponível.
2. `backup_production.sh` (dump + SHA-256 + tamanho + `pg_restore --list` + restore num banco descartável + contagem de linhas produção × restaurado):
   ```bash
   docker run -d --name tp-pg17-dryrun -e POSTGRES_PASSWORD=<local> -p 127.0.0.1:55717:5432 postgres:17
   BACKUP_DIR=/caminho/fora/do/repo bash infrastructure/ops/backup_production.sh
   ```
   Os dumps contêm dados pessoais: guarde-os em local criptografado (o script recusa `BACKUP_DIR` dentro do repo). Rode com tráfego baixo. **Critério:** `restore: OK` e nenhuma linha `DIVERGENTE`.

## 5. Regras de aplicação

- Arquivo com `ALTER TYPE ... ADD VALUE` (só a **086**): em autocommit, sem `--single-transaction`. É idempotente.
- Todos os demais (084, 085, 087..096): `--single-transaction`. Se falhar, nada daquele arquivo foi aplicado: corrija a causa (nunca o arquivo da migration) e reexecute o mesmo arquivo. Nunca pule um número.

```bash
set -e
apply() {
  if grep -qiE "ADD VALUE" "$1"; then
    psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -f "$1"
  else
    psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 --single-transaction -f "$1"
  fi
  echo "$(date -u +%FT%TZ) APLICADA $(basename "$1")" | tee -a migration_log.txt
}
```

## 6. Plano de janela T0–T8

Pré-condição: checklist da seção 8 **100% confirmado** e dry run (seção 1) repetido no mesmo dia.

| T | Ação | Critério para seguir | Se falhar |
|---|---|---|---|
| **T0** | Backup validado (seção 4) | `restore: OK`, sem `DIVERGENTE`, SHA-256 registrado | Não abrir a janela |
| **T1** | `for n in 084 085 086 087 088 089 090 091 092 093 094; do apply infrastructure/migrations/${n}_*.sql; done` | todos `APLICADA`; `/offers` e `/proposals` sem 500 | Single-tx: nada aplicado → corrigir e reexecutar; 086: reexecutar |
| **T2** | `psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -v platform_password="$TRAVEL_APP_PLATFORM_PASSWORD" -f infrastructure/ops/create_platform_role.sql` + `psql "$PLATFORM_DATABASE_URL" -At -c "SELECT current_user"` | atributos exigidos; login = `travel_app_platform` | Corrigir antes da 095 |
| T2.5 | Render: cadastrar `PLATFORM_DATABASE_URL` (usuário `travel_app_platform.<project-ref>`) com **"Save" sem restart** | variável salva; serviço ainda rodando | — |
| **T3** | `apply .../095_platform_role_separation.sql` | `APLICADA` | Nada aplicado; Platform Admin intacto |
| **T3b** | **Na sequência:** `apply .../096_supabase_data_api_hardening.sql` | `APLICADA` | Nada aplicado → corrigir e reexecutar (idempotente) |
| **T4** | **Imediatamente:** Render → restart/deploy do **mesmo** commit, para carregar `PLATFORM_DATABASE_URL` | `/health` 200; login no Platform Admin OK | Corrigir a URL ou o role. Não devolver grants ao runtime |
| **T5** | Validar hardening + schema: `verify_096_data_api.sql` **15/15** e `verify_084_095.sql` **47/47** | `total_failures = 0` em ambos | PARAR e analisar antes de seguir |
| **T6** | `NODE_ENV=production` + restart | boot OK (`validateProductionEnvironment` + `assertSafeDatabasePools`) | O log lista o que falta: corrigir e reiniciar |
| **T7** | Promover os commits locais (trava + `/version`; 096 + runbook) após CI verde | deploy concluído; `/version.buildSha` = SHA promovido | Redeploy do commit anterior (compatível com o schema 096) |
| **T8** | Smoke/QA: `/health`, `/readiness`, `/version`; `/offers`, `/proposals`, `/commercial/engagements`, onboarding pela UI; Customer App; Platform Admin | nenhum 500 inesperado | Log com `errorCode` → classificar |

**Por que a 096 vem em T3b, antes da T4 (ajuste da ordem proposta):**
- A 096 não depende da configuração da Render nem afeta os roles da aplicação: ela só revoga `anon`/`authenticated` e o `EXECUTE` de `PUBLIC` na função `SECURITY DEFINER`.
- A T1 cria 5 tabelas e as colunas novas, e as tabelas nascem com grant para `anon`/`authenticated` por causa dos default privileges. Rodar a 096 logo após a 095 **encurta a exposição** para minutos e respeita a ordem numérica. A validação formal dela continua na **T5**.

**Minimizar T3→T4:** a variável é pré-cadastrada na T2.5, então o intervalo é só o tempo do restart (~1–2 min), afetando apenas o Platform Admin. Com o checklist 100% verde, T4 e T6 podem ser **um único restart** (`PLATFORM_DATABASE_URL` + `NODE_ENV=production`). Isso encurta a janela, mas junta dois riscos num passo.

**Auto-deploy:** enquanto estiver ON ou UNKNOWN, nenhum push na `main` antes da T7. O commit da trava local recusa subir com `NODE_ENV≠production` apontando para a Supabase.

## 7. Exposição atual (antes da janela)

A exposição da Data API existe **hoje** em produção e independe da janela. Hoje a única forma registrada de fechá-la é a 096 na ordem numérica (T3b). Rodar o conteúdo da 096 antes da 084..095 seria aplicar uma migration fora de ordem; ela é idempotente, então a reaplicação na janela não teria efeito, mas isso exige **decisão explícita** do responsável e registro no log operacional. Alternativa sem SQL: no painel da Supabase → **API settings**, remover `public` dos "Exposed schemas" até a janela. Não usamos a Data API, então nada da aplicação é afetado.

## 8. Checklist de acesso à Render (nunca imprimir valores)

| Item | Como confirmar | Esperado |
|---|---|---|
| Serviço correto | Dashboard → serviço da API | id `srv-dao8bpjtqb8s73eafr9g` (visto no `deploymentId`) |
| Commit deployado | **Events/Deploys** | SHA e horário do último deploy |
| Branch | Settings | `main` |
| Auto-deploy | Settings → Auto-Deploy | registrar ON/OFF (define quando o push é seguro) |
| Build/start command | Settings | build via `Dockerfile`; start `node services/api/dist/services/api/src/server.js` |
| `RENDER_GIT_COMMIT` | automática em deploy via git | presente |
| `NODE_ENV` | Environment | `production` (hoje provavelmente ausente → `staging` do Dockerfile) |
| `DATABASE_URL` | Environment (só host/usuário) | pooler, usuário `travel_app_runtime.<ref>` |
| `PLATFORM_DATABASE_URL` | Environment | usuário `travel_app_platform.<ref>`, **diferente** de `DATABASE_URL` |
| `MFA_ENCRYPTION_KEY` | Environment (só tamanho) | ≥ 32 caracteres, mesmo valor usado para cifrar os segredos existentes |
| `STORAGE_PROVIDER` | Environment | `supabase` + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |
| `RATE_LIMIT_STORE` / `REDIS_URL` | Environment | `external` + URL |
| `CORS_ALLOWED_ORIGINS` | Environment | 4 domínios explícitos, sem `*` |
| `ALLOW_DEV_AUTH` | Environment | ausente ou `false` |
| Log do 500 do onboarding | Logs → `API request failed` | `errorCode` (esperado: `FST_ERR_CTP_EMPTY_JSON_BODY`) |
| Supabase → API settings | Exposed schemas | registrar se `public` está exposto |

## 9. Registro operacional (preencher na execução)

| Passo | Horário (UTC) | Operador | Resultado |
|---|---|---|---|
| T0 snapshot Supabase + `backup_production.sh` (SHA-256) | | | |
| Dry run do dia (47/47, 15/15, 0 permitidos) | | | |
| T1 084…094 (`migration_log.txt`) | | | |
| T2 role de plataforma + login | | | |
| T2.5 `PLATFORM_DATABASE_URL` salva | | | |
| T3 095 / T3b 096 | | | |
| T4 restart | | | |
| T5 verify 15/15 + 47/47 | | | |
| T6 `NODE_ENV=production` | | | |
| T7 SHA promovido | | | |
| T8 smoke/QA | | | |

## 10. Se algo der errado

- **Arquivo `--single-transaction` falhou:** nada dele foi aplicado. Corrija a causa (nunca o arquivo da migration) e reexecute o mesmo arquivo.
- **086 ou 096 falharam:** reexecute. As duas são idempotentes.
- **Platform Admin em 42501 após a 095:** confirme `PLATFORM_DATABASE_URL` e o restart. Não devolva grants de plataforma ao runtime.
- **Algum fluxo precisar de `anon`/`authenticated`:** não conceda privilégio na janela. Registre o fluxo e trate como exceção documentada numa migration nova (allowlist explícita).
- **Dano de dados ou schema:** restaurar do backup/PITR (seção 4).

## 11. `/version`

**Já no código (commit local):** `buildSha` usa `RENDER_GIT_COMMIT` → `GIT_SHA` → `BUILD_SHA` → `VERCEL_GIT_COMMIT_SHA`, ignorando valores em branco.

**Proposto (não implementado): versão real do banco.** Nova migration **097** `schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`, com backfill de `001..097` (válido após 47/47 + 15/15 provarem 084..096), `GRANT SELECT` só ao runtime e `/version` lendo `max(version)`. A partir da 098, cada migration registra a própria linha na mesma transação.
