# Staging Deploy Runbook — Execução

**Data:** 2026-09-12
**Baseline:** fe1d3f1

---

## Pré-requisitos

```bash
# Verificar que estamos no commit correto
git log --oneline -1
# Deve mostrar: fe1d3f1 fix(tests): financial-http.test.ts missing migrations for permission_restrictions

# Verificar que gates passam
cd services/api
npx tsc --noEmit && echo "✅ tsc OK"
npm run build && echo "✅ build OK"
npx vitest run tests/characterization/leaf-modules.test.ts && echo "✅ characterization OK"
```

## FASE 1 — Database

```bash
# 1.1 Backup staging (antes de qualquer coisa)
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# 1.2 Validar migrations
npm run migrations:validate

# 1.3 Aplicar migrations (via SQL oficial)
# Copiar migrations de packages/database/migrations/ para o servidor
# Aplicar em ordem: 001 → 051

# 1.4 Confirmar schema
psql $DATABASE_URL -c "\dt" # listar tabelas
psql $DATABASE_URL -c "SELECT count(*) FROM schema_migrations;" # 51 migrations

# 1.5 RLS runtime tests (executar testes de segurança)
npm run test:security

# 1.6 Seed sintético
# Criar: 2 tenants, 4 roles, customers, wishes, offers, proposals,
# bookings, trips, sales, receivables, payables, commissions
# Usar scripts/seed-staging.sql (a ser criado)

# 1.7 Smoke DB
psql $DATABASE_URL -c "SELECT count(*) FROM agencies;" # ≥2
psql $DATABASE_URL -c "SELECT count(*) FROM users;" # ≥8 (4 roles × 2 tenants)
```

## FASE 2 — API Deploy

```bash
# 2.1 Build
cd services/api
npm run build

# 2.2 Deploy (varia por infraestrutura)
# Exemplo: copiar dist/ para servidor, ou docker build

# 2.3 Health check
curl -k https://api.staging.domain/health
# Deve retornar: {"status":"ok"}

# 2.4 Readiness check
curl -k https://api.staging.domain/readiness
# Deve retornar: {"status":"ready"}

# 2.5 Version check
curl -k https://api.staging.domain/version
# Deve retornar: {"appVersion":"0.1.0","buildSha":"fe1d3f1",...}

# 2.6 Verificar CORS
curl -k -H "Origin: https://agency.staging.domain" -I https://api.staging.domain/health
# Deve ter: Access-Control-Allow-Origin: https://agency.staging.domain

# 2.7 Verificar HTTPS
curl -v https://api.staging.domain/health 2>&1 | grep "SSL connection"
# Deve mostrar TLS handshake
```

## FASE 3 — Frontends

```bash
# Para cada frontend (agency, customer, admin, marketing):
# 3.1 Build
cd apps/agency && npm run build
# 3.2 Deploy (copiar dist/ ou docker)
# 3.3 Verificar que API URL está configurada
# 3.4 Verificar auth callback
# 3.5 Browser smoke — abrir URL, verificar render
```

## FASE 4 — Smoke Tests

```bash
# 4.1 Login
curl -k -X POST https://api.staging.domain/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"..."}'
# Deve retornar JWT

# 4.2 Me
curl -k https://api.staging.domain/me \
  -H "Authorization: Bearer $TOKEN"
# Deve retornar dados do usuário

# 4.3 CRUD básico
curl -k -X GET https://api.staging.domain/customers \
  -H "Authorization: Bearer $TOKEN"
# Deve retornar lista de clientes
```

## FASE 5 — E2E Critical Flows

```bash
# Executar testes E2E contra staging real
# (requer DATABASE_URL apontando para staging)

# Flow A: New Agency
# provision → OWNER → onboarding → invite → staff login

# Flow B: Commercial
# Customer → Wish → Offer → Proposal → Booking → Trip

# Flow C: Finance
# Sale → Receivable → Payment → Payable → Reconciliation → Margin

# Flow D: Customer Portal
# Portal → Trip → Documents → Proposal/Booking

# Flow E: Security
# Tenant A cannot access Tenant B

# Flow F: Providers
# OCR/email/social sandbox
```

## FASE 6 — UAT

```bash
# Coordenar com usuários reais por perfil:
# - Platform Admin: provisionar agência, configurações
# - Agency OWNER: onboarding, convidar equipe
# - Agency AGENT: CRUD customers, wishes, proposals
# - Customer: portal, documentos, pagamentos

# Registrar em UAT_ACCEPTANCE.md:
# - Esperado vs Observado
# - Severidade (P0/P1/P2)
# - Evidência (screenshot, log, correlation ID)
```

## FASE 7 — Segurança

```bash
# 7.1 RLS runtime
npm run test:security

# 7.2 Cross-tenant
# Tentar acessar dados de outro tenant → deve falhar

# 7.3 Backup/Restore
pg_dump $DATABASE_URL > backup_final.sql
# Restaurar em ambiente efêmero
psql $DATABASE_URL_RESTORE < backup_final.sql
# Verificar dados

# 7.4 Rollback
# Reverter API para versão anterior
# Verificar health
# Verificar tenant isolation
```

## FASE 8 — GO/NO-GO

```bash
# Preencher FINAL_GO_NO_GO_REPORT.md com resultados reais
# Todos os gates devem ser PASS
# Decisão humana obrigatória para produção
```
