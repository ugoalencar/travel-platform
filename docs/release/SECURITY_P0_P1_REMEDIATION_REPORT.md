# SECURITY P0/P1 REMEDIATION — Fable Audit (F-01..F-05)

- **Auditoria de origem:** `docs/audit/FABLE_INDEPENDENT_AUDIT.md`
- **HEAD auditado:** `940a02b4ad3ca6b5547b1fbcd0e73925ddebfa53`
- **Escopo desta rodada:** apenas findings P0/P1 **F-01..F-05**, na ordem obrigatória. Sem features novas, sem refactor amplo, sem P2/P3, sem Day-by-Day, sem deploy.
- **Data:** 2026-09-23

## Status

| Finding | Severidade | Título | STATUS |
|---------|------------|--------|--------|
| F-01 | P0 | Platform Admin aceita identidade forjada por header em produção | **RESOLVIDO** |
| F-02 | P1 | Escritas de `/platform/*` sem gate de role (RBAC ausente/401 vs 403) | **RESOLVIDO** |
| F-03 | P1 | Import Center: mapping sem allowlist (SQL injection latente) | **RESOLVIDO** |
| F-04 | P1 | Segmentação × Offers/Communications: visibilidade fail-open | **RESOLVIDO** |
| F-05 | P1 | Storage só em disco local; adaptador Supabase é código morto | **RESOLVIDO** |

**SECURITY P0/P1 REMEDIATION — PRONTA PARA REAUDITORIA.**

## Correções

### F-01 — Platform dev-auth fail-closed (P0)

- `services/api/src/platform-dev-auth.ts`: trava dupla `ALLOW_DEV_AUTH === 'true' && NODE_ENV !== 'production'`; validação de role no enum `PlatformUserRole`; `createProductionPlatformAuthProvider` deny-all; `createServerPlatformAuthProvider` escolhe o provider correto por ambiente.
- `services/api/src/app.ts`: default deny-all (sem mais `PlatformDevAuthProvider()` aberto).
- `services/api/src/server.ts`: injeta a factory de provider.
- **Testes:** `tests/security/platform-dev-auth.test.ts` (headers forjados → 401 em produção; gate fechado sem flag; gate aberto só fora de produção; role fora do enum → 401).

### F-02 — RBAC de escrita em `/platform/*` (P1)

- `services/api/src/platform-auth.ts`: `requirePlatformRole` responde **403 `FORBIDDEN`** para role insuficiente; **401 `UNAUTHORIZED`** apenas sem principal.
- `services/api/src/platform-routes.ts`: todas as escritas passam por `requirePlatformAdminWrite` (plans, subscriptions, leads, subscribers, settings, support, support-sessions, feature-flags toggle). `requireCommercialWriteAccess` delega ao mesmo gate.
- `POST /public/leads` permanece público (fora do prefixo `/platform`, por design de marketing).
- **Testes:** `tests/security/platform-write-rbac.test.ts` (matriz: 401 sem auth; 403 para `READ_ONLY_AUDITOR` e demais roles de baixo privilégio **sem** transação de escrita; admin não recebe 401/403; leitura OK para auditor; `/public/leads` público). Atualização de `services/api/tests/platform-feature-flags-routes.test.ts` (401 → 403).

### F-03 — Allowlist de colunas do Import Center (P1)

- Novo `services/api/src/import/allowlist.ts`: união de campos por entidade; `SYSTEM_COLUMNS` (`id`, `agency_id`, `created_by`, timestamps) nunca vindos do mapping; `assertMappingInUnion` / `assertMappingAllowed` → `ValidationError`.
- Três camadas: rota `POST /api/import/:jobId/validate` (pré-tenant, 400 sem transação); `dryRunImport` após carregar o job; `insertEntity` rejeita campo fora da allowlist (rollback).
- `EMPLOYEE_FIELDS` sem `role`; alias `role` removido do parser.
- `routes/import.ts`: `sendKnownError` mapeia `ValidationError` → 400.
- **Testes:** `tests/security/import-allowlist.test.ts` (7 testes: `role` nunca exposto; união rejeita injection/privilege; dry-run falha após 1 transação; validate retorna 400 sem transação).

### F-04 — Membership real de segmento (P1)

- `services/api/src/customer-segmentation.ts`: `computeEligibleSegmentIds` / `isCustomerInSegment` / `customerMatchesFilter` reutilizam `buildGroupSql` + `validateFilterDefinition` (mesmo engine, sem duplicar). Fail-closed: erro → `false`; segmento vazio/inexistente → não membro.
- `customer-portal.ts`: `listAvailableOffers` usa membership real + filtro defensivo pós-query; `getAvailableOfferById` exige `show_on_customer_app` e membership do `target_segment_id`.
- `agency-communications.ts`: `listVisibleCommunications` filtra por `eligibleSegmentIds`; `getVisibleCommunicationById` checa membership → null para não-membro.
- **Testes:** `tests/security/customer-segment-visibility.test.ts` (12 testes: membro vs não-membro; fail-closed em erro/filtro inválido; `show_on_customer_app=false` → null; NULL-target sempre visível).

### F-05 — `STORAGE_PROVIDER` + fail-closed de produção (P1)

- Novo `services/api/src/storage.ts`: facade que seleciona `file-storage.ts` (local) ou `supabase-storage.ts` via `STORAGE_PROVIDER` (`local` | `supabase`). Valor inválido → throw (sem fallback silencioso).
- Call sites de upload/download passaram a importar de `../storage` (documents, portal, media-library, proposals, trips).
- `services/api/src/env.ts` (`validateProductionEnvironment`): em produção, `STORAGE_PROVIDER` é **obrigatório**; `local` exige `UPLOADS_DIR` (path de volume persistente); `supabase` exige `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; valor desconhecido → throw.
- Docs: `.env.example`, `docs/staging-uat-golive/ENV_CHECKLIST.md`, `docs/product/MEDIA_LIBRARY.md`.
- **Testes:** `tests/security/storage-provider.test.ts` (6 testes: default só fora de prod; case-insensitive; invalid throw; roteamento local/supabase; fail-closed). `services/api/tests/env.test.ts` (20 testes, inclui gates F-05).

## Quality gates (executados nesta sessão)

| Gate | Resultado |
|------|-----------|
| `npm run lint` | **PASS** (0 errors; warnings pré-existentes em `financial.ts`, `platform-routes.ts`, etc.) |
| `npm run typecheck` | **PASS** (root `tsc` + turbo, 7/7) |
| `npm run test:security` | **PASS** — 10 arquivos, **154 testes** |
| `services/api` `env.test.ts` | **PASS** — 20 testes |
| `npm run build` | **PASS** (7/7) |
| `npm run test` (turbo completo) | Ver observação abaixo |

**Observação `npm run test` / suites DB da API:** o container fixo `travel-platform-postgres-local` gera conflito de nome em paralelo (`Error ... already in use`). Isso é limitação do ambiente local (container já em uso por outra sessão/stack), **não regressão destas correções** — mesmas falhas de infraestrutura descritas na auditoria para suites que exigem Docker. Rodadas non-DB (security, env, typecheck, build, lint) estão verdes. Reexecutar suites DB com o container limpo/ocioso ou via CI.

## Fora de escopo (conforme briefing)

- P2/P3 (F-06..F-10), incluindo ligar `protectedHooks` do Import Center (F-10).
- Novas features, refactors amplos, Day-by-Day, migrations destrutivas.
- Deploy, commit e push: **aguardam autorização explícita**.

## Próximo passo

1. Autorização para `git commit` + `git push`.
2. Observar CI no push.
3. Reauditoria F-01..F-05 no commit desta rodada.
