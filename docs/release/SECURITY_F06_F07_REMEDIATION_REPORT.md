# SECURITY REMEDIATION — Fable Audit (F-06 + F-07)

- **Auditoria de origem:** `docs/audit/FABLE_INDEPENDENT_AUDIT.md` (seções F-06/F-07)
- **HEAD auditado (re-auditoria F-01..F-05):** `01d730897c91be480e4a9fac01a7f730030876b0`
- **Escopo desta rodada:** exclusivamente F-06 e F-07, com migration forward-only, testes, gates, documentação e CI. Sem features novas, sem refactor amplo, sem P2/P3, sem Day-by-Day, sem deploy.
- **Data:** 2026-09-24

## Status

| Finding | Severidade | Título | STATUS |
|---------|------------|--------|--------|
| F-06 | P1 | Tabelas de plataforma legíveis/grantadas ao role de runtime tenant | **RESOLVIDO** |
| F-07 | P1 | MFA do Platform Admin em plaintext, sem enrollment | **RESOLVIDO** |

**SECURITY REMEDIATION F-06 + F-07 — PRONTA PARA REAUDITORIA.**

## Correções

### F-06 — Separação de roles: plataforma × runtime (P1)

- **`infrastructure/migrations/095_platform_role_separation.sql` (nova, forward-only):** se ambos os roles existirem, clona grants runtime→platform (tabelas via `role_table_grants`, sequences via `role_usage_grants`, funções), granta as 44 tabelas de plataforma ao platform role (31 full-CRUD + 13 insert/select) e executa `REVOKE ALL` dessas tabelas do runtime (fail-closed). Não cria roles (DDL de role permanece fora de migrations).
- **`tests/integration/database/002_prepare_local_roles.sql`:** cria `travel_app_platform_local` (LOGIN, NOINHERIT, NOBYPASSRLS); `GRANT USAGE ON SCHEMA public`; clone dinâmico de grants de tabela/sequence/função; platform tables grantadas via **DO block guardado com `to_regclass` + FOREACH** (importante: ~60 suítes rodam este arquivo com subconjuntos de migrations); `REVOKE ALL` das platform tables do runtime; SELECT final verifica ambos os roles.
- **`services/api/src/database.ts`:** `createDatabaseRuntime(tenantPool, platformPool = tenantPool)` — `withPlatformTransaction` roda no pool platform; default compatível com suítes single-pool de caminho tenant.
- **`services/api/src/server.ts`:** dual pool a partir de `PLATFORM_DATABASE_URL`; `createPlatformDatabaseRuntime(platformPool)`; readiness/shutdown cobrem ambos.
- **`services/api/src/env.ts`:** em produção, `PLATFORM_DATABASE_URL` é obrigatória e **diferente** de `DATABASE_URL` (trim); `MFA_ENCRYPTION_KEY` obrigatória e ≥32 chars (gate F-07). `.env.example` atualizado.
- **Testes de schema/RLS:** `tests/integration/database/database.integration.test.ts` — constantes de platform role + `psqlPlatform`; lista de platform tables reduzida a esperadas no runtime (7 tenant); 4 novos testes F-06 (zero grants do runtime nas 44 platform tables; SELECT negado em `platform_users`/`platform_sessions` com `set_tenant_context`; CRUD OK pelo platform role; superset clonado). `tests/integration/database/003_rls_runtime_test.sql` — 2 blocos DO F-06: runtime negado em `platform_users` e `platform_sessions` (`insufficient_privilege` registrado).
- **Testes da API (pools corretos):** `customer-platform-auth.test.ts`, `customer-platform-auth-http.test.ts`, `auth-http.test.ts`, `local-auth.test.ts`, `platform-commercial.test.ts`, `offer-growth-entitlement-isolation.test.ts` — `platformPool` (`travel_app_platform_local`) para `createPlatformDatabaseRuntime(platformPool)` e como 2º argumento de `createDatabaseRuntime(runtimePool, platformPool)`; encerramento do pool no `afterAll`.
- **`scripts/check-secrets.cjs`:** `travel_app_platform_local_password` adicionado a `KNOWN_PLACEHOLDER_VALUES` (fixture local descartável do 002, mesma categoria de `travel_app_runtime_local_password`).

### F-07 — MFA do Platform Admin cifrado + enrollment (P1)

- **`services/api/src/platform-local-auth.ts`:**
  - `resolvePlatformMfaSecret` — decifra blob AES-256-GCM; linhas legadas pré-F-07 (base32 plaintext) passam adiante.
  - `startPlatformMfaEnrollment` — gera segredo, grava **cifrado** (`encryptMfaSecret`) com `mfa_enabled=false` (staged); audita `MFA_ENROLL_STARTED`; retorna **apenas** `{ provisioningUri }` (o expõe uma única vez, no `otpauth://`); re-enrollment com MFA ativo → `ConflictError`.
  - `confirmPlatformMfaEnrollment` — valida 1 código TOTP contra o segredo staged; persiste cifrado e `mfa_enabled=true`; audita `MFA_ENABLED`; código inválido → `ValidationError` (400).
  - `verifyPlatformMfaAndCompleteLogin` — decifra antes de verificar; **re-encrypt on-successful-verification** de segredo legado em plaintext (fail-closed: falha de cifra aborta o login) e audita `MFA_SECRET_REENCRYPTED`.
  - Sem recovery codes para `platform_users` (não há tabela; lockout é break-glass/support — documentado no cabeçalho do módulo).
- **`services/api/src/routes/platform-auth.ts`:** `POST /platform-auth/mfa/enroll` (201) e `POST /platform-auth/mfa/enroll/confirm` (200 `{ enrolled: true }`), ambos com `platformProtectedHooks`; principal **sempre** de `request.platformAuth.sub` (nunca do body).
- **Testes:**
  - `services/api/tests/customer-platform-auth.test.ts` — enrollment completo (staged cifrado ≠ plaintext, `mfa_enabled=false` não força MFA, confirm inválido 400, confirm válido ativa + audit `MFA_ENROLL_STARTED`/`MFA_ENABLED`, login passa a exigir MFA); re-enrollment recusado; teste legado estendido: segredo plaintext na verificação é aceito **e re-cifrado** + audit `MFA_SECRET_REENCRYPTED`.
  - `services/api/tests/customer-platform-auth-http.test.ts` — fluxo HTTP `enroll`→`confirm` (201/200; resposta contém só `provisioningUri`; staged cifrado no banco; 400 em código inválido; audit; challenge+verify sem segredo na resposta); `enroll` sem sessão → 401.

## Quality gates (executados nesta sessão)

| Gate | Resultado |
|------|-----------|
| `npm run lint` | **PASS** (0 errors; 13 warnings pré-existentes em arquivos não alterados) |
| `npm run typecheck` | **PASS** (turbo 7/7) |
| `npm run test` (turbo completo) | **PASS** — 7/7 tasks; `services/api` **96/96 arquivos, 1649/1649 testes** |
| `npm run test:security` | **PASS** — 10 arquivos, **154 testes** |
| `npm run test:db` | **PASS** — **13/13 testes** (inclui 4 novos F-06) |
| `npm run build` | **PASS** (turbo 7/7) |
| `npm run secrets:scan` | **PASS** (inclui 24/24 testes do próprio scanner) |
| `npm run migrations:validate` | **PASS** (sequência até `095_platform_role_separation.sql`) |
| `npm run security:check` | **PASS** (sem vulnerabilidades ≥ moderate) |

**Observação de execução local:** o container fixo `travel-platform-postgres-local` × projetos compose por suíte gera conflito de nome em execuções locais non-CI quando uma suíte reuse-if-running deixa o container ativo (limitação pré-existente, já anotada no relatório F-01..F-05; não é regressão destas correções). As rodadas locais desta sessão usaram o modo desenhado para ambiente externo (`CI=true` + container compartilhado saudável), reproduzindo exatamente o serviço Postgres do workflow `ci.yml`. O CI do repositório executa os mesmos gates com service container.

## Fora de escopo (conforme briefing)

- P2/P3 (F-08..F-10) e demais findings.
- Recovery codes para Platform Admin (break-glass documentado).
- Refactor dos helpers `docker compose` das suítes de teste.
- Novas features, Day-by-Day, migrations destrutivas, deploy.

## STOP POINT

- **F-06:** RESOLVIDO — migration `095`, guards em `002`/`003`, dual pool (`database.ts`/`server.ts`/`env.ts`), testes verdes.
- **F-07:** RESOLVIDO — enrollment staged cifrado, confirm TOTP, re-encrypt de legado, rotas com principal de sessão, testes verdes.
- **Gates:** todos acima em PASS nesta sessão.
- **Commit:** nesta rodada (ver histórico); **CI:** aguardar conclusão do workflow `Quality Gates` no push.
- **Próximo passo:** reauditoria de F-06 e F-07.
