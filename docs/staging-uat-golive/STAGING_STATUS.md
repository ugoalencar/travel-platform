# Staging Status

**Data:** 2026-09-12
**Baseline:** fe1d3f17c983aec54d50b5870fca7e64d4207105
**App Version:** 0.1.0
**Build SHA:** fe1d3f1
**Migration Version:** 051 (invitations_permission_restrictions)

---

## INFRA

| Componente | Status | Notas |
|------------|--------|-------|
| API | ⏳ PENDENTE | Requer deploy em staging |
| Agency Frontend | ⏳ PENDENTE | Requer deploy |
| Customer Frontend | ⏳ PENDENTE | Requer deploy |
| Platform Admin | ⏳ PENDENTE | Requer deploy |
| Marketing | ⏳ PENDENTE | Requer deploy |
| Database | ⏳ PENDENTE | Requer PostgreSQL staging |
| Redis | ⏳ PENDENTE | Se necessário para rate limits |
| Storage | ⏳ PENDENTE | Para documentos |

## GATES LOCAIS (executados)

| Gate | Status | Detalhes |
|------|--------|----------|
| TYPECHECK | ✅ PASS | tsc --noEmit limpo |
| LINT | ✅ PASS | 0 erros, 9 warnings pré-existentes |
| BUILD | ✅ PASS | tsc -p tsconfig.build.json |
| UNIT TESTS | ✅ PASS | 135 testes (9 arquivos) |
| CHARACTERIZATION | ✅ PASS | 24/24 testes |
| SECURITY TESTS | ✅ PASS | 55 testes (5 arquivos) |
| SECURITY AUDIT | ✅ PASS | 0 vulnerabilities |
| SECRETS SCAN | ✅ PASS | Nenhum segredo encontrado |
| MIGRATIONS VALIDATE | ✅ PASS | 51 migrations validadas |

## GATES DE STAGING (requerem infraestrutura)

| Gate | Status | Detalhes |
|------|--------|----------|
| HTTPS | ⏳ PENDENTE | Requer certificado TLS |
| CORS | ⏳ PENDENTE | Requer configuração de origins |
| AUTH | ⏳ PENDENTE | Requer OIDC/JWT provider |
| RLS | ⏳ PENDENTE | Requer DB + testes runtime |
| CROSS-TENANT | ⏳ PENDENTE | Requer 2 tenants no DB |
| SMOKE | ⏳ PENDENTE | Requer API rodando |
| E2E | ⏳ PENDENTE | Requer DB + API + frontends |
| UAT | ⏳ PENDENTE | Requer usuários humanos |
| BACKUP/RESTORE | ⏳ PENDENTE | Requer DB |
| ROLLBACK | ⏳ PENDENTE | Requer deploy |

## MÓDULOS (31 route modules)

| Módulo | Status | Rotas |
|--------|--------|-------|
| infrastructure | ✅ | /health, /version, /metrics, /readiness, /me, /tenant-proof |
| settings | ✅ | /settings/agency, /settings/team, /settings/notifications |
| settings-expanded | ✅ | branding, onboarding, departments, invitations, permissions |
| customers | ✅ | CRUD + /customers/:id/wishes, /customers/:id/trips |
| customer-documents | ✅ | addresses, dependents, documents, OCR |
| customer-portal | ✅ | 12 endpoints /customer-api/* |
| wishes | ✅ | CRUD /wishes |
| proposals | ✅ | CRUD + send/cancel/accept/decline |
| trips | ✅ | CRUD + bookings + air/land services |
| sales | ✅ | CRUD + confirm/cancel/mark-paid |
| financial | ✅ | 25+ endpoints (receivables, payables, DRE, etc.) |
| commercial-cockpit | ✅ | 22 endpoints (opportunities, tasks, pipelines) |
| transport-suppliers | ✅ | 40+ endpoints (routes, suppliers, products) |
| operations-staff | ✅ | operations, staff, assignments |
| operations | ✅ | passengers, document alerts, occurrences |
| reports | ✅ | 9 report endpoints |
| cost-centers | ✅ | CRUD /cost-centers |
| commissions | ✅ | plans, employees, commissions, payroll |
| pescador | ✅ | captures, extract, review, approve |
| enrollment | ✅ | links, submissions, public token flow |
| support | ✅ | POST /support/tickets |
| assets | ✅ | GET/POST /assets |
| campaigns | ✅ | CRUD + offers + status |
| publications | ✅ | CRUD + snapshot + publish |
| automations | ✅ | CRUD + activate/pause |
| coupons | ✅ | CRUD + grants + redemptions |
| offers | ✅ | CRUD /offers |
| connectors | ✅ | mock + Meta/Instagram real |
| engagements | ✅ | GET /engagements |
| entitlements | ✅ | GET /entitlements |
| offer-growth-audit | ✅ | GET /offer-growth/audit-log |

## PROVIDERS

| Provider | Status | Tipo |
|----------|--------|------|
| MFA (TOTP) | ✅ Real | node:crypto HMAC |
| Captcha | ✅ Real | reCAPTCHA v3, hCaptcha, Cloudflare |
| OCR | ✅ Real | Google Vision + Tesseract (separado) |
| Social | ✅ Real | Meta/Instagram connector |
| Auth | ✅ Real | OIDC/JWT (production-auth.ts) |

## BUGS CORRIGIDOS NESTA SESSÃO

1. **splice bug** em `settings-queries.ts` — `values.splice(2, 0, ...)` → `values.push(...)` ✅
2. **Route modularization** — 6,802 LOC → 488 LOC (−93%) ✅
3. **Duplicate routes** — air/land services e bookings removidos ✅

## PENDÊNCIAS PARA STAGING

1. Provisionar PostgreSQL staging
2. Configurar secrets (DATABASE_URL, JWT, Meta token, Google Vision key)
3. Deploy API
4. Deploy frontends
5. Configurar DNS/HTTPS
6. Aplicar migrations
7. Rodar seed sintético
8. Executar testes E2E com DB
9. UAT com usuários reais
10. Backup/restore test
11. GO/NO-GO decision

## STATUS

**LOCAL:** ✅ READY (todos os gates locais passam)
**STAGING:** ⏳ BLOCKED (requer infraestrutura)
**PRODUCTION:** ⏳ BLOCKED (requer staging GO)
