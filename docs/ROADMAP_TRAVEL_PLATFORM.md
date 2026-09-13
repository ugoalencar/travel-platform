# Roadmap Oficial — Travel Platform

## Objetivo

Levar o Travel Platform do estado atual — produto funcional, modularizado, com hardening de segurança e Mega Pack avançado — até um ambiente de staging validado e, posteriormente, produção.

---

## Fase 0 — Consolidar `main`

**Objetivo:** transformar o estado atual em um baseline confiável.

### Ações
- Integrar correções de lint/DB-RLS.
- Separar arquivos untracked e mudanças paralelas.
- Deixar `main` limpo.
- Rodar:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run security:check`
  - `npm run secrets:scan`
  - `npm run test:security`
  - `npm run test:db`
  - `npm run build`
- Registrar:
  - `main HEAD`
  - `appVersion`
  - `buildSha`
  - `migrationVersion`

### Gate
`main` limpo e todos os gates verdes.

---

## Fase 1 — Fechar Mega Pack

**Objetivo:** garantir que tudo o que já foi implementado esteja efetivamente integrado.

### Já concluído ou praticamente concluído
- SaaS Admin.
- Onboarding.
- Convites.
- Restrições de permissão.
- MFA.
- CAPTCHA.
- OCR providers.
- Social connector.
- API Docs.
- Integration tests.
- Modularização da API.
- Segurança/ops hardening.

### Pendência principal
- Revisar se ainda existe implementação válida fora do `main`.
- Garantir que nenhum worktree contenha feature pronta não integrada.

### Gate
Nenhuma feature prevista no Mega Pack permanece apenas em branch/worktree.

---

## Fase 2 — Freeze do Produto

**Objetivo:** parar de aumentar escopo.

### Regras
- Nenhuma feature nova.
- Nenhuma nova refatoração grande.
- Nenhuma reorganização arquitetural.
- Apenas:
  - bugs;
  - segurança;
  - integração;
  - staging;
  - testes;
  - observabilidade.

### Gate
Baseline congelado.

---

## Fase 3 — Infraestrutura de Staging

Provisionar:

```text
Frontend Agency
Frontend Customer
Platform Admin
Marketing
API Fastify
PostgreSQL
Storage
Redis
```

### Domínios de staging sugeridos

```text
agency.staging...
customer.staging...
admin.staging...
marketing.staging...
api.staging...
```

### Requisitos
- HTTPS.
- Banco isolado de produção.
- Storage isolado.
- Redis quando aplicável.
- CORS explícito.

### Gate
Todos os serviços acessíveis e isolados de produção.

---

## Fase 4 — Secrets e Providers

Configurar somente ambiente de staging:

- Database.
- Redis.
- Auth/OIDC.
- Email provider.
- Google Vision/OCR.
- Meta.
- CAPTCHA.
- Storage.
- Assinatura digital, quando aplicável.
- Monitoring.
- Webhooks.

### Regra
Nunca armazenar secrets no Git.

### Gate
Providers necessários funcionando em sandbox/staging.

---

## Fase 5 — Banco Real de Staging

### Ações
- Criar PostgreSQL limpo.
- Aplicar SQL migrations oficiais.
- Validar migration history.
- Rodar RLS runtime tests.
- Criar seed sintético.
- Criar pelo menos 2 tenants.
- Criar usuários OWNER, ADMIN, AGENT e VIEWER.
- Criar dados comerciais e financeiros sintéticos.

### Gate

```text
Migrations PASS
RLS PASS
Cross-tenant PASS
DB smoke PASS
```

---

## Fase 6 — Deploy Completo

### Ordem

```text
Database
   ↓
API
   ↓
Platform Admin
   ↓
Agency
   ↓
Customer
   ↓
Marketing
```

### Validar
- `/health`
- `/readiness`
- `/version`
- CORS
- HTTPS
- cookies
- callbacks de autenticação
- logs
- metrics
- correlation IDs

### Gate
Plataforma navegável em staging.

---

## Fase 7 — Smoke Test

Executar os fluxos essenciais:

```text
Criar agência
→ onboarding
→ convidar usuário
→ login equipe
→ criar cliente
→ Wish
→ Offer
→ Proposal
→ Booking
→ Trip
→ Sale
→ Finance
→ Portal do cliente
```

Também validar:
- OCR.
- Email.
- CAPTCHA.
- Suporte.
- Feature flags.

### Gate
Nenhum P0/P1.

---

## Fase 8 — E2E Real

### SaaS

```text
Agency creation
→ OWNER
→ onboarding
→ invite
→ staff login
```

### Comercial

```text
Customer
→ Wish
→ Offer
→ Proposal
→ Booking
→ Trip
```

### Financeiro

```text
Sale
→ Receivable
→ Payment
→ Payable
→ Reconciliation
→ Margin
```

### Segurança

```text
Tenant A
✕
Tenant B
```

### Portal

```text
Customer
→ Trip
→ Documents
→ Booking
→ Payments
```

### Gate

```text
Critical E2E = PASS
```

---

## Fase 9 — Security Validation

Rodar novamente:

- SQL Injection.
- SSRF.
- XSS.
- CSRF.
- IDOR/BOLA.
- RLS.
- RBAC.
- Tenant isolation.
- Uploads.
- Tokens públicos.
- Webhooks.
- Secrets.
- Rate limiting.
- CORS.
- HTTPS.
- Security headers.

### Gate

```text
P0 = 0
P1 = 0
```

---

## Fase 10 — Backup / Restore / DR

### Ações
- Criar backup de staging.
- Restaurar em banco efêmero.
- Validar schema.
- Validar registros.
- Executar smoke após restore.

### Meta provisória

```text
RPO <= 1 hora
RTO <= 4 horas
```

### Gate
Restore comprovado.

---

## Fase 11 — UAT Humano

### Perfis

#### Platform Admin
- agência;
- planos;
- suporte;
- configuração;
- status.

#### OWNER/ADMIN
- onboarding;
- equipe;
- restrições;
- CRM;
- financeiro;
- relatórios.

#### AGENT
- tarefas do dia;
- clientes;
- comercial;
- operações.

#### Customer
- portal;
- viagem;
- documentos;
- proposta;
- booking;
- pagamentos.

### Registrar problemas com
- severidade;
- página;
- usuário;
- requestId;
- correlationId;
- screenshot.

### Gate

```text
UAT PASS
P0 = 0
P1 = 0
```

---

## Fase 12 — Correções Finais

Somente:
- P0.
- P1.
- bugs de staging.
- bugs E2E.
- problemas de UX que bloqueiem operação.
- security findings.

Depois de cada correção:

```text
targeted test
→ regression test
→ smoke
```

---

## Fase 13 — Go-Live Readiness

Confirmar:

```text
Main clean                  PASS
Build                       PASS
Migrations                  PASS
HTTPS                       PASS
Auth                        PASS
RLS                         PASS
Tenant isolation            PASS
Critical E2E                PASS
Security                    PASS
Backup/Restore              PASS
UAT                         PASS
Observability               PASS
Rollback                    READY
P0                          0
P1                          0
```

### Resultado
Só então emitir decisão **GO**.

---

## Fase 14 — Produção

### Decisões humanas finais
- domínio;
- DNS;
- secrets de produção;
- provider production credentials;
- política de backup;
- retenção;
- RPO/RTO definitivo;
- contatos de incidente;
- responsável pelo rollback.

### Deploy inicial sugerido

```text
Production deploy
→ smoke
→ primeira agência piloto
→ monitorar
→ ampliar acesso
```

---

# Fluxo Resumido

```text
MAIN LIMPO
   ↓
MEGA PACK FECHADO
   ↓
FREEZE
   ↓
STAGING
   ↓
DATABASE + MIGRATIONS
   ↓
DEPLOY
   ↓
SMOKE
   ↓
E2E
   ↓
SECURITY
   ↓
BACKUP / RESTORE
   ↓
UAT
   ↓
CORRIGIR P0/P1
   ↓
GO / NO-GO
   ↓
PRODUÇÃO
```

---

## Estado Estratégico Atual

O Travel Platform já não está mais em fase de construção fundamental.

A prioridade agora é:

**integração → staging → validação real → UAT → segurança final → produção.**
