# Travel Platform — Reconciliação Fase 0: Estado Real vs Relatório Anterior

**Data:** 2026-09-20  
**HEAD:** 338f187

---

## MATRIZ DE RECONCILIAÇÃO

| Item | Relatório Anterior | Estado Real do Código | Ação Necessária |
|---|---|---|---|
| **Resend Email** | "Wiring final nos handlers pendente" | ✅ COMPLETO — `sendStaffPasswordResetEmail`, `sendCustomerPasswordResetEmail`, `sendCustomerActivationEmail`, `sendEmployeeInvitationEmail` todos conectados em `forgotPassword()`, `customerForgotPassword()`, `grantCustomerPortalAccess()`, `createInvitation()` | NENHUMA — já validado com entrega real |
| **MFA Encryption** | "Secret armazenado em plaintext" | ⚠️ CONFIRMADO — `secret_encrypted` armazena base32 plaintext, sem MFA_ENCRYPTION_KEY, sem encrypt/decrypt | IMPLEMENTAR |
| **Storage Adapter** | "SupabaseStorageAdapter não implementado" | ⚠️ CONFIRMADO — apenas `file-storage.ts` (local disk), nenhuma referência a SupabaseStorage | IMPLEMENTAR |
| **__API_ORIGIN__** | "Substituir pelo domínio real" | ⚠️ CONFIRMADO — placeholder `__API_ORIGIN__` em todos os 4 vercel.json | RESOLVER no deploy |
| **Import Center** | "Não existe" | ⚠️ CONFIRMADO — nenhuma referência a import_job ou ImportJob no código | IMPLEMENTAR (MVP) |
| **Redis** | "Provisionar Upstash" | ✅ IMPLEMENTADO — `RedisRateLimitStore` em `rate-limit.ts`, `createRedisRateLimitStore()` conecta via REDIS_URL | SOMENTE provisionar Upstash + configurar REDIS_URL |
| **Deploy Configs** | "Prontos para Vercel" | ✅ PRONTO — vercel.json em todos os 4 apps, Dockerfile na raiz | SOMENTE deploy |
| **Migrations** | "81 migrations" | ✅ CONFIRMADO — `081_customer_segments.sql` é a mais recente | NENHUMA |
| **Rate Limiting** | "Implementado" | ✅ CONFIRMADO — `RequestRateLimiter`, `LoginAbuseProtector`, `RedisRateLimitStore` | NENHUMA |
| **CORS** | "Implementado" | ✅ CONFIRMADO — `security-config.ts`, fail-closed em production | SOMENTE configurar CORS_ALLOWED_ORIGINS |
| **Health/Readiness** | "Implementado" | ✅ CONFIRMADO — `/health`, `/readiness`, `/version`, `/metrics` | NENHUMA |
| **PWA** | "Manifest + SW existem" | ✅ CONFIRMADO — `manifest.webmanifest` + `sw.js` em `apps/customer/public/` | VALIDAR em domínio real |

---

## CORREÇÕES AO RELATÓRIO ANTERIOR

1. **Resend NÃO está pendente** — está completamente implementado e validado com entrega real. Não reimplementar.
2. **O domínio já foi registrado** — não registrar novamente.
3. **mail.travelplataforma.com.br já foi verificado** no Resend — não reconfigurar.

---

## O QUE REALMENTE PRECISA SER FEITO

### Crítico (bloqueia deploy)
1. Provisionar Supabase PILOT (projeto + role + migrations)
2. Provisionar Upstash Redis
3. Deploy API via Railway (Dockerfile pronto)
4. Deploy 4 frontends via Vercel
5. Configurar DNS (CNAME records)
6. Configurar CORS_ALLOWED_ORIGINS com domínios reais
7. Configurar variáveis de ambiente no Railway

### Funcionalidade Nova
8. Implementar SupabaseStorageAdapter
9. Implementar Import Center MVP (schema + API + UI)
10. Implementar MFA encryption at rest

### Validação
11. QA remoto de todos os apps
12. Teste de importação sintética
13. Validar PWA em domínio real
