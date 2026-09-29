# Runbook — Janela de produção: migrations 084..096 + roles da aplicação (RLS) + storage

> Nome do arquivo mantido (`..._084_095.md`) por ser referenciado em scripts e templates; o escopo atual é **084..096**.

- **Status:** janela **não executada** (PRODUCTION EXECUTION: NOT STARTED). Banco em **083 + 096 HOTFIX** (seção 0.1); **084..095 PENDING**. API na Render em `3512438`, `NODE_ENV=development`, conectada como `postgres` (seção 0.2).
- **Escopo da janela:** migrations 084..095 + reaplicação da 096; role `travel_app_platform`; troca da conexão da API de `postgres` (BYPASSRLS) para `travel_app_runtime` (RLS efetivo); `NODE_ENV=production`; storage no Supabase; deploy manual dos commits locais.
- **Alvo:** produção (Supabase, pooler `aws-0-us-east-1.pooler.supabase.com`, database `postgres`).
- **Migrations:** 001..096 (096 = [`096_supabase_data_api_hardening.sql`](../../infrastructure/migrations/096_supabase_data_api_hardening.sql)).
- **Arquivos operacionais (não são migrations):** em [`infrastructure/ops/`](../../infrastructure/ops/)

| Arquivo | Uso | Produção? |
|---|---|---|
| `create_platform_role.sql` | cria/valida `travel_app_platform` (senha via variável psql) | sim (T2) |
| `rotate_runtime_password.sql` | troca a senha da `travel_app_runtime` (valida atributos antes) | sim (T2) |
| `bootstrap_platform_owner.cjs` | cria o primeiro `PLATFORM_OWNER` (hashing oficial, audit) | sim (T3c) |
| `verify_084_095.sql` | schema/RLS/grants/roles de 084..095 — somente leitura | sim |
| `verify_096_data_api.sql` | privilégios efetivos de `anon`/`authenticated` + regressão dos roles da app — somente leitura | sim |
| `test_096_data_api_roles.sql` | executa SELECT/INSERT/UPDATE/DELETE/TRUNCATE como `anon`/`authenticated` | **NUNCA** (só clone; exige `-v i_am_not_production=yes`) |
| `backup_production.sh` | dump + SHA-256 + restore validado + contagem de linhas (TLS; URL só por env) | sim (T0) |
| `dump_prod_schema.sh` | dump **schema-only** de produção para o dry run (somente leitura, TLS, saída fora do repo) | sim (T0, leitura) |
| `dryrun_prod_clone.sh` | clone PG17 **local** + emulação Supabase + T1..T3b + `verify_084_095` + `verify_096` (+ `--role-test`) | **NUNCA** (só container local com portas em loopback; recusa Docker remoto) |
| `scram_verifier.cjs` | calcula localmente o verificador SCRAM-SHA-256 de uma senha (stdin → stdout) | sim (T2) |

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
| `NODE_ENV` da API na Render | inferido na época como `staging`; **confirmado depois: `development`** (seção 0.2) |
| **Exposição da Data API (P1)** | `anon`/`authenticated` com SELECT/INSERT/UPDATE/DELETE/TRUNCATE nas **170** tabelas (44 de plataforma **sem RLS**: `platform_users`, `platform_sessions`, `billing_*`, `subscriptions`, `subscriber_tenants`, `support_*`, `leads`, `feature_flags`, `platform_settings`, audit logs…), em **2** sequences e `EXECUTE` em `platform_search_agencies` (`SECURITY DEFINER` → enumeração de agências de todos os tenants via RPC). Os default privileges de `postgres` concedem o mesmo a **todo objeto novo**. |

> A tabela acima é o estado **antes** do hotfix de 2026-09-26 22:14Z. O estado atual está na seção 0.1.

## 0.1 PRODUCTION STATE ATUAL: 083 + 096 HOTFIX

| Item | Estado |
|---|---|
| **PRODUCTION STATE** | **083 + 096 HOTFIX** — não é "última migration = 096" |
| **084..095** | **PENDING** — nenhuma delas foi aplicada |
| **096** | **ALREADY APPLIED IN PRODUCTION AS SECURITY HOTFIX** (fora da ordem numérica, por decisão explícita do responsável) |
| Aplicação da 096 | 2026-09-26, início 22:13:59Z, fim 22:14:02Z; `psql --single-transaction`, exit 0; arquivo idêntico ao commit `099258b` (SHA-256 `6bdceec6…f47331b`) |
| Backup prévio | snapshot da Supabase confirmado no painel pelo responsável + `backup_production.sh` completo às 22:08Z: 1.089.138 bytes, SHA-256 `56786e69…ef6c9`, restore em PG17 OK, **170/170 tabelas e contagem de linhas idêntica tabela a tabela** (dump guardado fora do repositório) |
| Validação pós-hotfix | `anon`/`authenticated`: 0/170 tabelas, 0/2 sequences; SELECT negado em produção (teste somente leitura, 172/172 objetos); `platform_search_agencies` → permission denied; clone do schema pós-096: 1.700/1.700 DML negados; `travel_app_runtime` intacto (170/170 tabelas, 2/2 sequences, 5/5 funções); API `/health`, `/public/landing`, `/public/partners` 200 |

**`verify_096_data_api.sql` esperado neste estado: 13/15.** As 2 falhas são `travel_app_platform still reads platform_users` e `travel_app_platform can EXECUTE platform_search_agencies`, porque o role de plataforma ainda não existe (T2 pendente). Qualquer outra falha é real: PARAR. O 15/15 só é exigido na T4 da janela.

**Na janela completa:** aplicar 084..095 normalmente (T1..T3). Depois, **reaplicar a 096 em T3b**: é idempotente e não tem efeito sobre o que já foi revogado. Com os default privileges de `postgres` já corrigidos, as tabelas criadas por 084..094 devem nascer sem grant para `anon`/`authenticated`; a reaplicação garante isso mesmo que algo tenha mudado até a janela.

## 0.2 Estado real da Render (API somente leitura, 2026-09-28)

| Item | Valor |
|---|---|
| Serviço | `travel-platform` — `srv-dao8bpjtqb8s73eafr9g`, web service Docker (`./Dockerfile`, sem build/start command próprio), plano free, oregon, 1 instância |
| Branch / auto-deploy | `main` / **ON (`autoDeployTrigger: commit`)** |
| Deploy live | `3512438ff23dc3c9dd047c1e247ac65bf9424be8`, desde 2026-09-25 00:08:51Z (`dep-daqrmplg1s2s73ag9l00`) |
| `NODE_ENV` | **`development`** |
| `DATABASE_URL` | usuário **`postgres`** (dono do schema, **BYPASSRLS**): hoje o RLS **não** se aplica a nenhuma consulta da API |
| `PLATFORM_DATABASE_URL` | **ausente** |
| `STORAGE_PROVIDER` | **ausente** → uploads no disco efêmero do container |
| Buckets no Supabase Storage | **0** (o código grava em `documents/`, `media-assets/`, `trip-photos/`; o adaptador **não** cria bucket) |
| Arquivos a migrar | nenhum: `document_attachments` = 0, `trip_photos` = 0 (`media_assets` só nasce na 092) |
| `MFA_ENCRYPTION_KEY` | presente (46 caracteres) |
| `RATE_LIMIT_STORE` / `REDIS_URL` | `external` / presente (`rediss:`) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | presentes (mesmo projeto do banco) |
| `ALLOW_DEV_AUTH` | ausente |
| `CORS_ALLOWED_ORIGINS` | 8 origens explícitas (4 `*.travelplataforma.com.br` + 4 `*.vercel.app`), sem `*` |
| `platform_users` em produção | **0** — hoje não existe login de Platform Admin |
| TLS API → banco | **não cifrado**: `pg` do Node sem `sslmode` não usa TLS (teste com a mesma URL: `TLS=false`). A API em produção envia usuário `postgres`, senha e dados em claro até o pooler |

**Achado de segurança (P1):** as URLs novas (G3) incluem `?sslmode=require&uselibpqcompat=true` (TLS 1.3 confirmado; `sslmode=require` puro falha na cadeia autoassinada da Supabase com o `pg` 8.23). Não há validação de certificado: protege contra captura passiva, não contra MITM ativo. Validação completa (`verify-full` com a CA da Supabase no container) fica para uma mudança de código separada. **Depois da janela, trocar a senha do `postgres`**, que trafegou sem TLS.

**Consequências para a janela:**
- `3512438` já contém `validateProductionEnvironment` e `assertSafeDatabasePools`: com `NODE_ENV=production` e `DATABASE_URL` = `postgres`, o boot **recusa** (BYPASSRLS). A troca para `travel_app_runtime` é obrigatória.
- Os commits locais (`e092302`) recusam subir com `NODE_ENV≠production` + banco remoto. Com auto-deploy ON, qualquer push hoje dispararia um deploy que falha. Por isso **auto-deploy OFF é gate obrigatório** (G1): não basta "não fazer push".
- Enquanto a API conecta como `postgres`, a 095 **não** derruba o Platform Admin (o dono mantém acesso). O corte só acontece no deploy da T5, que já liga o pool de plataforma.
- As rotas públicas `/public/landing`, `/public/partners` e `/public/banners` usam `withPlatformTransaction` (pool de plataforma): seguem funcionando depois da 095 e servem de smoke do pool sem login.
- O rollback de variáveis para `postgres`/`development` só funciona com o código `3512438`. Depois da T7 (código novo), o rollback exige **primeiro** redeploy do `3512438`.

### Causas dos 500

| Rota | Causa | Status |
|---|---|---|
| `GET /offers`, `GET /proposals`, `GET /commercial/engagements` | colunas das migrations 084/087/088/093 inexistentes → `42703` | **CONFIRMADO** (clone real, código `3512438`) |
| `POST /settings/onboarding/complete` | `Content-Type: application/json` sem corpo → Fastify `FST_ERR_CTP_EMPTY_JSON_BODY` (um 400), convertido em **500** pelo error handler (`services/api/src/errors.ts` só trata `BODY_TOO_LARGE`). Sem o header → 200. O frontend Agency omite o header (`apps/agency/src/lib/api.ts`), então o 500 vem de chamadas de API/scripts. | **CONFIRMADO** no log da Render (2026-09-28 01:18:56Z, `errorName: FastifyError`, `errorCode: FST_ERR_CTP_EMPTY_JSON_BODY`). Bug funcional separado, **não bloqueia** a janela (T8A) |

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

## 2. Pré-requisitos e gates (bloqueantes)

**Status dos gates em 2026-09-29:** G1 **PASS** (auto-deploy `no`, trigger `off`, conferido pela API em 2026-09-28 02:48Z; nenhum deploy disparado, live segue `3512438`) · G2 **READY** · G3 **READY** (senha nova da runtime, aplicada na T2) · G4 **READY** (Docker Desktop ativo; `tp-pg17-dryrun` recriado em 2026-09-29, PostgreSQL 17.11; os papéis de emulação da Supabase são recriados pelo dry run da T0) · G5 **READY** · G6 **READY** · G7 pendente (comunicação da janela) · Acesso do operador **READY** (2026-09-29: `DATABASE_ADMIN_URL` validada como `postgres` com TLS 1.3, somente leitura; `RENDER_API_KEY` validada por GET).

> **Regressão em 2026-09-29:** o Windows da máquina do operador foi reinstalado em 2026-09-28 09:31 (local). Todas as entradas `travel-platform/*` do Credential Manager, o dump completo de produção de 2026-09-26 e o container `tp-pg17-dryrun` deixaram de existir; o Docker Desktop está parado. Nenhum desses segredos chegou a ser usado (a role de plataforma não foi criada e a Render não foi alterada), então **não há nada a revogar**: basta gerar de novo. Antes disso, decidir um cofre que sobreviva a reinstalação (gerenciador de senhas com sincronização); o Credential Manager local provou ser frágil. O `.env` da máquina não tem mais credenciais de produção nem `RENDER_API_KEY`.
>
> **Recriação em 2026-09-29:** credenciais geradas de novo e guardadas no **Bitwarden** (conta `travelplataforma@hotmail.com`, servidor `vault.bitwarden.com`, pasta `travel-platform`), com sincronização em nuvem. Senhas aleatórias (40 caracteres para roles, 32 para o owner, 24 para QA); conferidas relendo do cofre; cofre travado e sessão apagada ao final.

**Cofre:** Bitwarden, pasta `travel-platform` (itens do tipo login; a URL fica no campo senha). Nomes dos itens (os valores nunca aparecem em arquivo, log ou relatório):

| Entrada | Usuário | Uso |
|---|---|---|
| `prod/TRAVEL_APP_PLATFORM_PASSWORD` | `travel_app_platform` | T2 (40 caracteres aleatórios) |
| `prod/TRAVEL_APP_RUNTIME_PASSWORD` | `travel_app_runtime` | T2 (senha **nova**, aplicada com `ALTER ROLE`) |
| `prod/DATABASE_URL` | `travel_app_runtime.<ref>` | T2.5 (`DATABASE_URL` futura, com a senha nova e TLS; válida só depois da T2) |
| `prod/PLATFORM_DATABASE_URL` | `travel_app_platform.<ref>` | T2.5 e T3c (contém a mesma senha da primeira entrada; login testável só após a T2) |
| `prod/PLATFORM_OWNER_INITIAL_PASSWORD` | `travelplataforma@hotmail.com` | T3c e T5D |
| `qa/AGENCY_A_OWNER`, `AGENCY_B_OWNER` | `delivered+qa-janela-{a,b}-owner@resend.dev` | T5B (signup) |
| `qa/CUSTOMER_A`, `CUSTOMER_B` | `delivered+qa-janela-{a,b}-cliente@resend.dev` | T5B (ativação do portal) |

Os emails de QA são endereços de teste da Resend: aceitam entrega (o `POST /customers/:id/portal-access` envia email e responde 500 se o envio falhar), não geram bounce e não contêm dado pessoal. As agências de QA já existentes em produção (`qa-customer-uat-agency-2/3`, `qa-consolidated-…`, `demo-travel-platform`) não têm senha no cofre e não são usadas.

| Gate | Condição | Como confirmar |
|---|---|---|
| **G1** | **Auto-deploy da Render OFF** antes de qualquer passo da janela | Settings → Auto-Deploy = **No**; conferir pela API (`GET /v1/services/srv-dao8bpjtqb8s73eafr9g` → `autoDeploy: "no"`) |
| **G2** | Senha forte do `travel_app_platform` gerada e guardada no cofre | cofre; **nunca** em arquivo, log ou relatório |
| **G3** | URLs futuras no cofre (`prod/DATABASE_URL`, `prod/PLATFORM_DATABASE_URL`: pooler, session mode 5432, banco `postgres`, `sslmode=require&uselibpqcompat=true`) | Depois da T2: `psql "$RUNTIME_URL" -At -c "select current_user, (select rolbypassrls from pg_roles where rolname = current_user)"` → `travel_app_runtime\|f`; idem para a plataforma |
| **G4** | Postgres 17 tooling | container `postgres:17` local (usado pelos scripts) |
| **G5** | Contas de QA para o smoke da T5B | 4 entradas `travel-platform/qa/*` no cofre (acima). Na T5B: signup "QA Janela A" e "QA Janela B" com os emails de owner; em cada agência, criar 1 cliente e conceder portal (`POST /customers/:id/portal-access`) com o email de cliente; ativar pela página de reset com o token retornado e a senha do cofre |
| **G6** | Primeiro `PLATFORM_OWNER` | `infrastructure/ops/bootstrap_platform_owner.cjs`, executado na **T3c** (após a 095, antes do QA de plataforma). Testado no clone PG17: recusas (role errado, host remoto sem `--confirm-production`, senha < 16, senha com o email, segunda execução) + criação + login real + MFA enroll/confirm/verify |
| **G7** | Janela de manutenção comunicada | a T5 troca a role da API e liga o RLS: ~1–2 min de deploy + smoke |

Variáveis **exportadas no shell do operador a partir do cofre** (nunca gravadas em arquivo versionado): `DATABASE_ADMIN_URL` (`postgres`, session mode 5432), `TRAVEL_APP_PLATFORM_PASSWORD`, `PLATFORM_DATABASE_URL`, `RUNTIME_URL`, `RENDER_API_KEY` (conferência somente leitura).

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
# Esperado: f, f, f, t -> banco em 083 (+ 096 HOTFIX, seção 0.1). Outro resultado: PARAR.
# verify_096 esperado no precheck: 13/15 (só as 2 checagens de travel_app_platform falham).

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

## 6. Plano de janela T0–T10

Ordem obrigatória. Cada passo só começa com o critério do anterior verde. Registrar tudo na seção 9.

### Antes de T0 — G1: desligar o auto-deploy
Render → Settings → Auto-Deploy → **No**. Conferir pela API (`autoDeploy: "no"`). Sem isso, **não abrir a janela**.

### T0 — Backup + dry run do dia
1. Snapshot Supabase: anotar o horário do último backup/PITR (painel → Database → Backups).
2. `backup_production.sh` completo (seção 4): tamanho, SHA-256, `restore: OK` em PG17, contagem de linhas sem `DIVERGENTE`.
3. Dry run novo, **só com arquivos versionados** (~20 s):
   ```bash
   bash infrastructure/ops/dump_prod_schema.sh /fora/do/repo/prod_schema_t0.sql        # DATABASE_ADMIN_URL no env
   bash infrastructure/ops/dryrun_prod_clone.sh /fora/do/repo/prod_schema_t0.sql --role-test [--create-container]
   ```
   Critério: `DRY RUN: PASS` = `verify_084_095` **47/47**, `verify_096` **15/15** e 0 tentativas permitidas para `anon`/`authenticated`. Reproduzido em 2026-09-29 (Windows reinstalado, container recriado): PASS em 17 s, 1.752 tentativas negadas.

**Se qualquer item falhar: PARAR.**

### T1 — 084..094
```bash
for n in 084 085 086 087 088 089 090 091 092 093 094; do apply infrastructure/migrations/${n}_*.sql; done   # apply() roda a 086 em autocommit
```
Validar o schema: o precheck da seção 3 passa a `t, t, t, t`. **Não reiniciar a Render.** A API atual (`postgres`) passa a enxergar as colunas novas: `/offers` e `/proposals` deixam de dar 500.

### T2 — Senha nova da runtime + role de plataforma

**Senhas nunca vão em texto ao servidor.** Produção registra DDL (`log_statement = ddl`, confirmado em 2026-09-29): um `CREATE/ALTER ROLE ... PASSWORD '<senha>'` gravaria a senha nos logs da Supabase. Os dois scripts só aceitam o **verificador SCRAM-SHA-256** calculado localmente por `scram_verifier.cjs` e recusam qualquer outro valor; o log mostra apenas o verificador. Testado no PG17 com `log_statement = ddl`: 0 ocorrências das senhas no log, login com a senha certa OK, senha errada recusada.

**Runtime:** a senha antiga da `travel_app_runtime` ficou em arquivos `.env` e foi descartada. Aplicar a nova do cofre (`prod/TRAVEL_APP_RUNTIME_PASSWORD`) antes de a Render passar a usar essa role. A API atual conecta como `postgres`, então nada cai:
```bash
RUNTIME_SCRAM="$(printf '%s' "$TRAVEL_APP_RUNTIME_PASSWORD" | node infrastructure/ops/scram_verifier.cjs)"
psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -v runtime_password_scram="$RUNTIME_SCRAM" -f infrastructure/ops/rotate_runtime_password.sql
psql "$RUNTIME_URL" -At -c "select current_user"      # -> travel_app_runtime (URL do cofre, com TLS)
```
O script recusa rodar sem a variável ou se a role tiver atributos inseguros, e só troca a senha. Nenhuma sessão ativa usa essa role hoje (confirmado em 2026-09-26).

**Plataforma:**
```bash
PLATFORM_SCRAM="$(printf '%s' "$TRAVEL_APP_PLATFORM_PASSWORD" | node infrastructure/ops/scram_verifier.cjs)"
psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -v platform_password_scram="$PLATFORM_SCRAM" -f infrastructure/ops/create_platform_role.sql
psql "$PLATFORM_DATABASE_URL" -At -c "select current_user"      # -> travel_app_platform
```
O script cria o role com LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION e **aborta** se um role existente divergir. A senha entra só pela variável; nunca em log.

### T2.5 — Render com **Save only** (sem deploy/restart)
Environment → editar → **"Save only"**:

| Variável | Novo valor |
|---|---|
| `DATABASE_URL` | cofre `prod/DATABASE_URL` (runtime, com `sslmode=require&uselibpqcompat=true`) |
| `PLATFORM_DATABASE_URL` | cofre `prod/PLATFORM_DATABASE_URL` (plataforma, mesmos parâmetros TLS) |
| `NODE_ENV` | `production` |
| `STORAGE_PROVIDER` | `supabase` |

Guardar no cofre o valor anterior de `DATABASE_URL` (`postgres`) para o rollback. Conferir que seguem presentes: `MFA_ENCRYPTION_KEY`, `RATE_LIMIT_STORE=external`, `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ALLOWED_ORIGINS`; `ALLOW_DEV_AUTH` ausente ou ≠ `true`. **Não reiniciar.** Se o painel não oferecer "Save only", salvar pela API (atualizar variáveis pela API não dispara deploy, segundo a documentação da Render) ou adiar o salvamento para imediatamente antes da T5.

### T2.6 — Buckets do Supabase Storage
Supabase → Storage → criar buckets **privados**: `documents`, `media-assets`, `trip-photos`. Não expor publicamente; o acesso é sempre pela API, com a service role. Sem eles, todo upload com `STORAGE_PROVIDER=supabase` falha.

### T3 — 095
`apply infrastructure/migrations/095_platform_role_separation.sql`. Validar: `travel_app_runtime` **sem** acesso às 44 tabelas de plataforma; `travel_app_platform` com acesso; ambos NOSUPERUSER/NOBYPASSRLS (coberto pelo `verify_084_095`). A API atual segue como `postgres`, então nada cai ainda.

### T3c — Primeiro PLATFORM_OWNER (G6)

**Email do owner:** `travelplataforma@hotmail.com` (temporário; troca por um endereço corporativo é pendência pós-piloto). **Pré-condições, todas obrigatórias:** 084..094 aplicadas · `travel_app_platform` criada · 095 aplicada · 096 reaplicada · `verify_084_095` 47/47 · `verify_096` 15/15 · login com `PLATFORM_DATABASE_URL` = `travel_app_platform`. Qualquer uma falhando: **não executar o bootstrap**. A senha inicial vem só do cofre (`travel-platform/prod/PLATFORM_OWNER_INITIAL_PASSWORD`), pelo stdin.

**Validar após o bootstrap** (somente leitura, sem exibir hash, segredo ou URL):
```sql
SELECT count(*) FILTER (WHERE role = 'PLATFORM_OWNER') AS owners,
       bool_and(email = 'travelplataforma@hotmail.com') FILTER (WHERE role = 'PLATFORM_OWNER') AS email_ok,
       bool_and(status = 'ACTIVE' AND mfa_enabled = false AND mfa_secret IS NULL
                AND password_hash LIKE 'scrypt$%') FILTER (WHERE role = 'PLATFORM_OWNER') AS state_ok,
       (SELECT count(*) FROM platform_user_audit WHERE action = 'PLATFORM_OWNER_BOOTSTRAPPED') AS audit_events
  FROM platform_users;   -- esperado: 1 | t | t | 1
```
```bash
npm run build -w @travel-platform/api          # usa o hashing oficial compilado
PLATFORM_DATABASE_URL=<do cofre> PLATFORM_OWNER_EMAIL=travelplataforma@hotmail.com \
  node infrastructure/ops/bootstrap_platform_owner.cjs --confirm-production --password-stdin   # senha do cofre pelo stdin
```
Conecta **só** como `travel_app_platform` (recusa `postgres`/runtime ou role com BYPASSRLS). Cria exatamente um `PLATFORM_OWNER` ACTIVE, `mfa_enabled=false`, sem segredo de MFA; grava `platform_user_audit` `PLATFORM_OWNER_BOOTSTRAPPED`; nunca imprime senha nem hash; recusa se já houver owner. O email é gravado em minúsculas (o login compara exato). **Depois da T5** (API com o pool de plataforma): primeiro login → `POST /platform-auth/mfa/enroll` → `POST /platform-auth/mfa/enroll/confirm` com o TOTP → login seguinte exige MFA.

### T3b — Reaplicar 096
`apply infrastructure/migrations/096_supabase_data_api_hardening.sql` (idempotente). Validar: `verify_084_095` **47/47** e `verify_096` **15/15**.

### T4 — Validação pré-restart
- Variáveis salvas na Render, **sem mostrar valores** (API somente leitura, só o username): `DATABASE_URL` → `travel_app_runtime`; `PLATFORM_DATABASE_URL` → `travel_app_platform`; `NODE_ENV` = `production`; `STORAGE_PROVIDER` = `supabase`.
- Login das duas URLs com `psql`: `current_user` correto e `rolbypassrls = f`.
- Buckets da T2.6 listados.
- Se algo divergir: corrigir antes da T5.

### T5 — Restart controlado (um único)
Render → **Manual Deploy → Deploy a specific commit → `3512438`** (o mesmo código). Um deploy garante que as variáveis salvas com "Save only" entrem. Esse único passo ativa: modo produção, tenant sem BYPASSRLS, pool de plataforma separado, storage Supabase e as checagens de boot. **Se o boot falhar: não fazer push**; capturar o erro no log e ir ao rollback da T5.

### T5A — Boot smoke
- `/health`, `/readiness`, `/version` = 200; header `Strict-Transport-Security` presente (prova de `NODE_ENV=production`).
- Log: `service started`, sem `Refusing to start`. `validateProductionEnvironment` e `assertSafeDatabasePools` rodam antes do `listen`: boot OK = pools de tenant e de plataforma com roles seguras e distintas. Rate limit externo conectado ao Redis, sem erro. Nenhuma menção a dev auth.

### T5B — RLS smoke (obrigatório)
- Signup das agências de QA A e B; login Agency em cada uma.
- A cria cliente e oferta; B lista e **não** vê os itens de A; `GET` do id de A com o token de B → 404.
- Login Customer (conta de QA) → `/customer-api/offers` e `/customer-api/communications`.
- Agency: `/offers`, `/proposals`, `/commercial/engagements`, `/commercial/tasks`, `/agency-communications`, `/media-assets` = 200.
- Pool de plataforma: `/public/landing` e `/public/partners` = 200; `/platform/plans` sem sessão = 401. Platform Admin: login do owner da T3c + enrollment e confirmação do MFA.
- Sem contexto de agência: rotas protegidas sem token = 401; nenhuma rota devolve dados de outro tenant.

### T5C — Storage smoke
`POST /media-assets` (imagem de teste, agência A) → `GET /media-assets/:id/download` devolve o mesmo arquivo → confirmar o objeto no bucket `media-assets` (Supabase → Storage) → `DELETE /media-assets/:id` → apagar o objeto do bucket, se continuar lá. O arquivo **não** pode existir só no disco da Render.

### T5D — Login do Platform Admin + MFA
Só com a T5 saudável (T5A OK). No Platform Admin (`admin.travelplataforma.com.br`):
1. Login com `travelplataforma@hotmail.com` e a senha inicial do cofre → sessão sem MFA.
2. Iniciar o enrollment de MFA (`POST /platform-auth/mfa/enroll`) e cadastrar o TOTP no autenticador.
3. Confirmar com um código válido (`POST /platform-auth/mfa/enroll/confirm`).
4. Conferir no banco, sem exibir o segredo: `mfa_enabled = true` e `mfa_secret` cifrado (não é base32 puro).
5. Logout → novo login com email + senha → o app pede TOTP → acesso normal ao Platform Admin.

**Risco (sem recuperação self-service):** o Platform Admin **não tem** recuperação de senha, troca de senha, troca de email nem códigos de recuperação de MFA (`platform-local-auth.ts`: conta bloqueada é operação de break-glass/suporte). Por isso: cadastrar o TOTP num autenticador com backup cifrado ou em dois dispositivos; manter a senha inicial só no cofre; e confirmar antes do QA final que o responsável acessa a caixa `travelplataforma@hotmail.com` (hoje o app não envia email ao owner, mas ela é o identificador de login). Teste de recuperação: **não aplicável** (não há fluxo).

### Rollback da T5 (falha operacional, não de migration)
1. Render → **Save only**: `DATABASE_URL` = valor anterior (`postgres`, do cofre); `NODE_ENV` = `development`; `STORAGE_PROVIDER` removido só se o storage for a causa.
2. Manual Deploy do **`3512438`**.
3. **Não** desfazer 084..096. **Não** devolver grants a `anon`/`authenticated`. **Não** devolver tabelas de plataforma ao runtime.
4. Registrar na seção 9 (horário, sintoma, `errorCode`).

### T6 — Push dos commits locais
Só com **T5 PASS** (A, B e C). Antes: conferir pela API que o auto-deploy **continua OFF**. `git push origin main` (proteção dev/local, `/version` com `RENDER_GIT_COMMIT`, migration 096, runbook, `verify_096`). A Vercel publica os 4 frontends automaticamente, sem mudança de conteúdo (os commits não tocam `apps/`). **Nenhum deploy automático na Render.**

### T7 — Deploy manual do SHA novo
Render → Manual Deploy → commit HEAD enviado na T6. Validar `/version.buildSha` = SHA real (via `RENDER_GIT_COMMIT`) e boot em produção sem falhar nas proteções. Rollback de código: Manual Deploy do `3512438` (compatível com o schema).

### T8 — API smoke
`/offers`, `/proposals` e `/commercial/engagements` sem 500. `/settings/onboarding/complete` pela UI (sem corpo vazio) = 200.

### T8A — Onboarding com JSON vazio
`FST_ERR_CTP_EMPTY_JSON_BODY → 500` está confirmado e é um **bug funcional separado** (o error handler converte o erro 4xx do Fastify em 500). Não bloqueia a janela: o frontend não envia o header sem corpo. Correção em PR próprio.

### T9 — QA remoto completo
Tasks, Customer 360, Engagement, Proposal Visual 2.0, Media Library, Offers, Communications, Segmentation, Platform Admin (login + MFA do owner da T3c), RLS cross-tenant, Storage.

### T10 — Auto-deploy
Só depois do QA verde, decidir se volta a ON. **Recomendação para o piloto: manter OFF** e usar deploy manual até o processo de release estabilizar.

**Por que esta ordem:**
- A 096 vem em T3b porque cobre as tabelas criadas na T1 e não depende da Render.
- Todas as trocas de configuração entram num único deploy (T5) do **código que já está em produção**. Se falhar, o rollback é trocar as variáveis e redeployar o mesmo SHA.
- O código novo (T7) só sobe depois que as variáveis já foram provadas, e com o auto-deploy desligado.

## 7. Exposição atual (antes da janela)

> **Atualização 2026-09-26 22:14Z: FECHADA.** O responsável decidiu aplicar a 096 fora de ordem como hotfix (seção 0.1). O texto abaixo registra a análise que levou a essa decisão.

A exposição da Data API existia em produção independentemente da janela. Hoje a única forma registrada de fechá-la é a 096 na ordem numérica (T3b). Rodar o conteúdo da 096 antes da 084..095 seria aplicar uma migration fora de ordem; ela é idempotente, então a reaplicação na janela não teria efeito, mas isso exige **decisão explícita** do responsável e registro no log operacional. Alternativa sem SQL: no painel da Supabase → **API settings**, remover `public` dos "Exposed schemas" até a janela. Não usamos a Data API, então nada da aplicação é afetado.

## 8. Checklist Render (nunca imprimir valores)

| Item | Hoje (2026-09-28) | Alvo após T5 |
|---|---|---|
| Serviço | `travel-platform` / `srv-dao8bpjtqb8s73eafr9g` | igual |
| Branch | `main` | igual |
| Auto-deploy | **OFF** desde 2026-09-28 02:48Z (G1) | OFF até a decisão da T10 |
| Deploy live | `3512438` | T5: `3512438`; T7: HEAD dos commits locais |
| Build/start | Dockerfile; `CMD node services/api/dist/services/api/src/server.js` | igual |
| `NODE_ENV` | `development` | `production` |
| `DATABASE_URL` (usuário) | `postgres` (BYPASSRLS) | `travel_app_runtime` |
| `PLATFORM_DATABASE_URL` (usuário) | ausente | `travel_app_platform` |
| `STORAGE_PROVIDER` | ausente | `supabase` (+ buckets da T2.6) |
| `MFA_ENCRYPTION_KEY` | presente, ≥ 32 | igual (não trocar: cifra os segredos existentes) |
| `RATE_LIMIT_STORE` / `REDIS_URL` | `external` / presente | igual |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | presentes | igual |
| `CORS_ALLOWED_ORIGINS` | 8 origens, sem `*` | igual |
| `ALLOW_DEV_AUTH` | ausente | ausente |

## 9. Registro operacional (preencher na execução)

| Passo | Horário (UTC) | Operador | Resultado |
|---|---|---|---|
| **HOTFIX** backup (snapshot Supabase + `backup_production.sh`) | 2026-09-26 22:08Z | responsável + Claude Code | VALIDATED — SHA-256 `56786e69…ef6c9`, 170/170 tabelas, linhas idênticas |
| **HOTFIX** 096 isolada (084..095 **não** aplicadas) | 2026-09-26 22:13:59Z–22:14:02Z | Claude Code (autorizado) | APLICADA; `verify_096` 13/15 (esperado sem `travel_app_platform`); anon/authenticated SAFE |
| G1 auto-deploy OFF (conferido pela API) | 2026-09-28 02:48Z | Claude Code (autorizado) | PASS — `autoDeploy: no`, trigger `off`; nenhum deploy; live `3512438` |
| T0 snapshot + `backup_production.sh` (tamanho, SHA-256, restore, linhas) + dry run do dia (47/47, 15/15) | | | |
| T1 084…094 (`migration_log.txt`) | | | |
| T2 `travel_app_platform` + login | | | |
| T2.5 Render Save only (4 variáveis; `DATABASE_URL` anterior no cofre) | | | |
| T2.6 buckets `documents`, `media-assets`, `trip-photos` | | | |
| T3 095 / T3c bootstrap do owner / T3b 096 (reaplicação) + 47/47 + 15/15 | | | |
| T4 validação pré-restart | | | |
| T5 deploy do `3512438` com as novas variáveis | | | |
| T5A boot smoke (HSTS) / T5B RLS smoke / T5C storage smoke / T5D login + MFA do owner | | | |
| Rollback T5 (se houver) | | | |
| T6 push (auto-deploy ainda OFF) | | | |
| T7 deploy manual do SHA novo (`/version.buildSha`) | | | |
| T8 API smoke / T9 QA remoto | | | |
| T10 decisão de auto-deploy | | | |

## 10. Se algo der errado

- **Arquivo `--single-transaction` falhou:** nada dele foi aplicado. Corrija a causa (nunca o arquivo da migration) e reexecute o mesmo arquivo.
- **086 ou 096 falharam:** reexecute. As duas são idempotentes.
- **Platform Admin ou `/public/landing`/`/public/partners` em 42501 após a T5:** confirme o usuário de `PLATFORM_DATABASE_URL`. Não devolva grants de plataforma ao runtime.
- **Boot recusado na T5 ou T7:** o log lista o motivo (`Refusing to start: ...`). Na T5 → rollback da T5. Na T7 → Manual Deploy do `3512438` (as variáveis de produção continuam válidas para ele).
- **Upload falhando após a T5:** conferir os buckets da T2.6 e o `STORAGE_PROVIDER`.
- **Algum fluxo precisar de `anon`/`authenticated`:** não conceda privilégio na janela. Registre o fluxo e trate como exceção documentada numa migration nova (allowlist explícita).
- **Dano de dados ou schema:** restaurar do backup/PITR (seção 4).

## 10.1 Pendências pós-piloto

- **Email corporativo do `PLATFORM_OWNER`:** trocar `travelplataforma@hotmail.com` por um endereço do domínio (ex.: `admin@travelplataforma.com.br`). **Atualizar o usuário existente**, não criar um segundo owner. O app não tem rota de troca de email: definir um procedimento operacional (mesmo padrão do bootstrap: role de plataforma, audit event próprio, sem tocar em `mfa_enabled`/`mfa_secret`) e testar login + MFA depois da troca.
- **Recuperação do Platform Admin:** não existe fluxo; avaliar códigos de recuperação de MFA e um procedimento de break-glass documentado.
- **Senha do `postgres`:** trocar depois da janela (trafegou sem TLS).

## 11. `/version`

**Já no código (commit local):** `buildSha` usa `RENDER_GIT_COMMIT` → `GIT_SHA` → `BUILD_SHA` → `VERCEL_GIT_COMMIT_SHA`, ignorando valores em branco.

**Proposto (não implementado): versão real do banco.** Nova migration **097** `schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`, com backfill de `001..097` (válido após 47/47 + 15/15 provarem 084..096), `GRANT SELECT` só ao runtime e `/version` lendo `max(version)`. A partir da 098, cada migration registra a própria linha na mesma transação.
