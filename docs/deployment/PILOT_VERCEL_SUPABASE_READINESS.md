# Travel Platform — Auditoria de Prontidão Vercel + Supabase + Centro de Implantação

**Status:** EM AUDITORIA  
**Data:** 2026-09-20  
**Escopo:** Parte A (Deploy Remoto) + Parte B (Centro de Implantação de Dados)  
**Idioma:** Português do Brasil

---

## RESUMO EXECUTIVO

A Travel Platform possui uma base técnica sólida e bem estruturada. A auditoria identificou que a maioria dos componentes necessários para o piloto remoto já existe ou está quase pronta. Os principais gaps são:

1. **Supabase Storage Adapter** — não implementado (apenas storage local)
2. **Redis para rate limiting** — requer provedor gerenciado (Upstash)
3. **Email (Resend)** — parcialmente implementado (falta wiring)
4. **MFA secret encryption** — armazenado em plaintext
5. **Hosting da API** — requer serviço Node persistente (Railway/Render)
6. **Domínios** — precisam ser configurados no Vercel

O Centro de Implantação de Dados é uma feature nova que precisa ser construída do zero, mas a infraestrutura de suporte (upload multipart, RLS, tenant isolation) já existe.

---

## MATRIZ DE AUDITORIA — COMPONENTE POR COMPONENTE

### 1. FRONTENDS

| Componente | Destino | Pronto? | Gap | Ação |
|---|---|---|---|---|
| Agency App | app.travelplataforma.com.br (Vercel) | ✅ | vercel.json já existe com rewrites | Substituir `__API_ORIGIN__` pelo domínio real da API |
| Customer App/PWA | cliente.travelplataforma.com.br (Vercel) | ✅ | vercel.json + manifest + sw.js existem | Substituir `__API_ORIGIN__`; validar PWA em domínio real |
| Platform Admin | admin.travelplataforma.com.br (Vercel) | ✅ | vercel.json já existe | Substituir `__API_ORIGIN__` |
| Marketing | travelplataforma.com.br (Vercel) | ✅ | vercel.json já existe | Substituir `__API_ORIGIN__` |
| Build Commands | Vercel | ✅ | `cd ../.. && npm install && npm run build --workspace=apps/<name>` | Configurar Root Directory por projeto |
| SPA Routing | Vercel | ✅ | rewrites para `/index.html` em todos os vercel.json | Nenhuma |
| API Proxy | Vercel → API Host | ✅ | rewrites com `__API_ORIGIN__` | Editar vercel.json com URL real |
| PWA Manifest | Customer App | ✅ | manifest.webmanifest + icons | Validar em domínio real |
| Service Worker | Customer App | ✅ | sw.js com cache apenas do shell | Validar instalação |

**Domínios propostos:**
```
travelplataforma.com.br         → Marketing (apps/marketing)
app.travelplataforma.com.br     → Agency App (apps/agency)
cliente.travelplataforma.com.br → Customer App/PWA (apps/customer)
admin.travelplataforma.com.br   → Platform Admin (apps/platform-admin)
api.travelplataforma.com.br     → Fastify API (hosting externo)
```

**DNS necessário (quando provisionar):**
```
CNAME  travelplataforma.com.br         → cname.vercel-dns.com
CNAME  app.travelplataforma.com.br     → cname.vercel-dns.com
CNAME  cliente.travelplataforma.com.br → cname.vercel-dns.com
CNAME  admin.travelplataforma.com.br   → cname.vercel-dns.com
CNAME  api.travelplataforma.com.br     → <host do API>
```

### 2. FASTIFY API

| Componente | Destino | Pronto? | Gap | Ação |
|---|---|---|---|---|
| Lifecycle | Node persistente externo | ✅ | Long-running process, graceful shutdown | Nenhuma — já implementado |
| AsyncLocalStorage/TenantContext | Qualquer host Node | ✅ | AsyncLocalStorage funciona em processos longos | Nenhuma |
| Rate Limit | Redis gerenciado | ⚠️ | Requer REDIS_URL + RATE_LIMIT_STORE=external | Provisionar Upstash Redis |
| Multipart/Uploads | Node persistente | ✅ | @fastify/multipart registrado | Nenhuma |
| Timeouts | Configurável | ✅ | connectionTimeoutMillis, idleTimeoutMillis | Configurar conforme host |
| Health/Readiness | Qualquer host | ✅ | /health, /readiness, /version, /metrics | Nenhuma |
| Background Work | Limitado | ⚠️ | Sem job queue formal | Para piloto: aceitável |
| Connection Pool | Configurável | ✅ | DB_POOL_MAX, DB_POOL_IDLE_TIMEOUT | Configurar conforme Supabase |
| Sessions | Bearer token (header) | ✅ | Não usa cookies | Nenhuma |
| CORS | Configurável | ✅ | CORS_ALLOWED_ORIGINS (fail-closed em production) | Configurar com domínios Vercel |

**Decisão de Hosting da API:**
- **NÃO** Vercel Functions — Fastify é processo longo com AsyncLocalStorage, rate limiting Redis, connection pooling, multipart uploads
- **SIM** — Serviço Node persistente externo: Railway, Render, ou Fly.io
- Dockerfile já existe na raiz e está adequado
- Para piloto: **Railway** ou **Render** (deploy simples, Dockerfile pronto)
- Futuro: migração para AWS (ECS/EKS) após validação

### 3. SUPABASE POSTGRESQL

| Componente | Destino | Pronto? | Gap | Ação |
|---|---|---|---|---|
| Versão PostgreSQL | Supabase (15+) | ✅ | Syntax compatível verificada | Nenhuma |
| Extensions | uuid, pgcrypto | ✅ | Supabase suporta | Nenhuma |
| Migrations (81+) | Supabase SQL Editor | ✅ | Arquivos numerados, aplicação manual | Criar script de aplicação ou usar Supabase CLI |
| Roles/Grants | Supabase | ⚠️ | Criar role `travel_app_runtime` não-superuser | Criar role + grants (ver 002_prepare_local_roles.sql) |
| FORCE RLS | Supabase | ✅ | Policy RLS existentes | Nenhuma |
| Tenant Context | Supabase | ✅ | set_tenant_context() via SQL | Nenhuma |
| NOBYPASSRLS | Supabase | ✅ | assertSafeDatabaseRole() valida | Criar role sem BYPASSRLS |
| Backup/Export | Supabase Dashboard | ✅ | pg_dump verificado | Validar via Supabase Dashboard |
| Connection Pooling | Supabase (port 6543) | ✅ | PgBouncer integrado | Usar pooled connection string |
| Connection Limits | Supabase | ✅ | Gerenciado pelo Supabase | Configurar DB_POOL_MAX |

**Criar projeto Supabase PILOT:**
- Região: Brasil (São Paulo) se disponível
- Criar role `travel_app_runtime` (não-superuser, sem BYPASSRLS)
- Aplicar migrations 001-081 em ordem
- Aplicar grants de `tests/integration/database/002_prepare_local_roles.sql`

### 4. CONNECTION STRATEGY

| Cenário | Tipo | Porta | Uso |
|---|---|---|---|
| Supabase Dashboard/SQL Editor | Direct | 5432 | Migrations, debugging |
| API Runtime (production) | Transaction Pooler (Supabase) | 6543 | Requests normais com RLS |
| API Runtime (development) | Direct | 5432 | Desenvolvimento local |

**Importante:** Usar connection string pooler (port 6543) para a API em produção. A API usa transações com `BEGIN/COMMIT` e `set_tenant_context()`, o que funciona com transaction pooler do Supabase. Testar isolamento de tenant antes de validar.

### 5. SUPABASE STORAGE

| Componente | Destino | Pronto? | Gap | Ação |
|---|---|---|---|---|
| Storage Abstraction | file-storage.ts | ✅ | Interface genérica existe | Nenhuma |
| SupabaseStorageAdapter | Supabase Storage | ❌ | Não implementado | Criar adapter |
| Private Buckets | Supabase Storage | ❌ | Nenhum bucket configurado | Criar buckets privados |
| Cross-tenant Security | Supabase Storage | ❌ | Não testado | Testar com RLS + policies |
| URL Strategy | Logical reference | ✅ | secureFileKey já é relativo | Nenhuma |

**Buckets necessários:**
- `documents` — documentos de clientes (passaporte, visto, etc.)
- `imports` — arquivos de importação (CSV, XLSX)
- `internal` — uploads internos da plataforma

### 6. STORAGE SECURITY

| Requisito | Status | Ação |
|---|---|---|
| Buckets privados | Pendente | Criar com policies de acesso backend |
| Service key no browser | ✅ Nunca | Nenhuma |
| Cross-tenant download | Pendente | Testar isolamento |
| MIME validation | ✅ | file-storage.ts valida |
| Size validation | ✅ | @fastify/multipart limits |

### 7. PWA / CUSTOMER APP

| Requisito | Status | Ação |
|---|---|---|
| Manifest | ✅ | manifest.webmanifest existe |
| Icons | ✅ | icon-192.png, icon-512.png |
| Service Worker | ✅ | sw.js existe, cache do shell |
| Installability | ⚠️ | Testar em domínio real com HTTPS |
| HTTPS | Pendente | Vercel fornece automaticamente |
| Login | ✅ | customer-auth routes |
| API | ✅ | /customer-api/* routes |
| Documents | ✅ | customer-documents routes |
| Offers | ✅ | offers routes |
| Trips | ✅ | trips routes |
| Logout | ✅ | customer-auth/logout |

### 8. ENVIRONMENT VARIABLES

| Variável | Classificação | Ambiente |
|---|---|---|
| DATABASE_URL | SECRET | API Host |
| REDIS_URL | SECRET | API Host |
| JWT_SECRET | SECRET | API Host |
| MFA_ENCRYPTION_KEY | SECRET | API Host |
| RESEND_API_KEY | SECRET | API Host |
| CORS_ALLOWED_ORIGINS | SERVER_ONLY | API Host |
| NODE_ENV | SERVER_ONLY | API Host |
| RATE_LIMIT_STORE | SERVER_ONLY | API Host |
| ALLOW_DEV_AUTH | SERVER_ONLY | API Host (NUNCA true em prod) |
| VITE_API_BASE_URL | PUBLIC | Vercel (vazio, usa rewrites) |
| APP_URL | SERVER_ONLY | API Host |
| API_URL | SERVER_ONLY | API Host |

**Templates:**
- `.env.example` — já existe (root)
- `.env.production.example` — já existe (root)
- `.env.staging.example` — já existe (root)

### 9. DOMÍNIOS / CORS

| Domínio | App | CORS Origin |
|---|---|---|
| travelplataforma.com.br | Marketing | https://travelplataforma.com.br |
| app.travelplataforma.com.br | Agency | https://app.travelplataforma.com.br |
| cliente.travelplataforma.com.br | Customer | https://cliente.travelplataforma.com.br |
| admin.travelplataforma.com.br | Platform Admin | https://admin.travelplataforma.com.br |
| api.travelplataforma.com.br | Fastify API | (não precisa de CORS propio) |

**CORS_ALLOWED_ORIGINS (API):**
```
https://travelplataforma.com.br,https://app.travelplataforma.com.br,https://cliente.travelplataforma.com.br,https://admin.travelplataforma.com.br
```

### 10. EMAIL (RESEND)

| Componente | Status | Ação |
|---|---|---|
| Resend Provider | ✅ | resend-provider.ts existe |
| Factory | ✅ | email/factory.ts existe |
| Templates | ✅ | email/templates.ts existe |
| Wiring nos handlers | ⚠️ | Comentários "no email provider wired yet" em local-auth.ts, customer-local-auth.ts | Conectar provider aos handlers |
| Unconfigured Provider | ✅ | unconfigured-provider.ts (fail-closed) | Nenhuma |

### 11. MFA

| Componente | Status | Ação |
|---|---|---|
| TOTP Enrollment | ✅ | mfa-provider.ts |
| MFA Verify | ✅ | Verificação de código |
| Secret Storage | ⚠️ | Armazenado em PLAINTEXT (sem encryption) | Implementar MFA_ENCRYPTION_KEY |
| Recovery Codes | ✅ | Gerados e salvos | Nenhuma |

### 12. CI/CD

| Gate | Status | Comando |
|---|---|---|
| Lint | ✅ | `npm run lint` |
| Typecheck | ✅ | `npm run typecheck` |
| Unit Tests | ✅ | `npm run test` |
| Security Tests | ✅ | `npm run test:security` |
| DB Integration Tests | ✅ | `npm run test:db` |
| Build | ✅ | `npm run build` |
| Secret Scan | ✅ | `npm run secrets:scan` |
| Migration Validate | ✅ | `npm run migrations:validate` |

---

## PARTE B — AUDITORIA DO CENTRO DE IMPLANTAÇÃO DE DADOS

### DOMÍNIOS PASSÍVEIS DE IMPORTAÇÃO

| Domínio | Tabela | Campos Obrigatórios | Constraints | Prioridade |
|---|---|---|---|---|
| Customers | customers | agency_id, name | unique(agency_id, cpf), unique(agency_id, email) WHERE active | FASE 1 |
| Suppliers | suppliers | agency_id, name | unique(agency_id, id) | FASE 1 |
| Employees/Users | users | agency_id, email, name, role, password_hash | unique(agency_id, email) | FASE 1 (cuidado) |
| Tags | (não existe tabela) | — | — | FASE 1 (criar se necessário) |
| Wishes | wishes | agency_id, customer_id | unique(agency_id, id) | FASE 2 |
| Offers | offers | agency_id, name, price | unique(agency_id, id) | FASE 2 |
| Proposals | proposals | agency_id, customer_id, proposed_price, total | unique(agency_id, id) | FASE 2 |
| Trips | trips | agency_id, customer_id, name, destination, start_date, end_date | unique(agency_id, id) | FASE 3 |
| Documents | customer_documents | agency_id, customer_id, document_type | — | FASE 3 |
| Sales | sales | agency_id, customer_id, user_id, amount, total | unique(agency_id, id) | FASE 4 |
| Receivables | receivables | agency_id, customer_id, description, amount, due_at | unique(agency_id, id) | FASE 4 |
| Payables | payables | agency_id, description, amount, due_at | unique(agency_id, id) | FASE 4 |

### PIPELINE DE IMPORTAÇÃO

```
Upload → Parse → Map → Normalize → Validate → Dry Run → Preview → Confirm → Import → Audit
```

Nunca: arquivo → INSERT direto.

### ImportJob

```sql
-- Proposta de schema para import_jobs
CREATE TABLE import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id),
  type TEXT NOT NULL, -- CUSTOMERS, SUPPLERS, etc.
  file_name TEXT NOT NULL,
  file_key TEXT NOT NULL, -- secureFileKey no storage
  source_system TEXT, -- ex: "SistemaAnterior"
  status TEXT NOT NULL DEFAULT 'UPLOADED',
  mapping JSONB,
  totals JSONB, -- { rows: 100, valid: 95, warnings: 3, errors: 2 }
  warnings JSONB,
  errors JSONB,
  uploaded_by UUID NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Status possíveis:
-- UPLOADED → ANALYZING → MAPPING_REQUIRED → READY → PROCESSING → COMPLETED | COMPLETED_WITH_WARNINGS | FAILED | CANCELLED
```

### Limites para Piloto

| Limite | Valor | Justificativa |
|---|---|---|
| Tamanho arquivo | 10 MB | Suficiente para milhares de registros |
| Linhas por arquivo | 10.000 | Piloto com poucos mil clientes |
| Jobs simultâneos | 3 | Piloto com uma agência |
| Formatos | CSV, XLSX | Cobertura máxima para planilhas |

---

## ADR — DEPLOYMENT DECISÕES

### ADR-PILOT-001: Infraestrutura de Deploy do Piloto

**Status:** ACEITA  
**Data:** 2026-09-20

**Contexto:**
A Travel Platform precisa ser implantada remotamente para um piloto com uma agência. A infraestrutura deve ser adequada à arquitetura real (Fastify long-running, AsyncLocalStorage, Redis, connection pooling) sem modificar a arquitetura para caber em um provider específico.

**Decisão:**
- **Frontends:** Vercel (4 projetos SPA, um por app)
- **API:** Serviço Node persistente externo (Railway ou Render), via Dockerfile existente
- **Banco:** Supabase PostgreSQL (região Brasil se disponível)
- **Storage:** Supabase Storage (adapters a serem implementados)
- **Redis:** Upstash (TLS, gerenciado, compatível com REDIS_URL)
- **Email:** Resend (já integrado, precisa de wiring final)
- **Domínio:** travelplataforma.com.br + subdomínios

**Não fazer:**
- Não adaptar Fastify para Vercel Functions
- Não substituir Auth por Supabase Auth
- Não migrar regras de domínio para Supabase
- Não remover RLS/RBAC/TenantContext

**Consequências:**
- API roda como processo longo (Dockerfile já pronto)
- Supabase é infraestrutura de piloto, não dependência de domínio
- Migração para AWS é opcional pós-validação

---

## PLANO DE IMPLEMENTAÇÃO — ORDEM DE EXECUÇÃO

### FASE 0: PREPARAÇÃO (sem código)

1. Criar projeto Supabase PILOT (região Brasil)
2. Criar role `travel_app_runtime` não-superuser
3. Aplicar migrations 001-081
4. Criar banco Upstash Redis
5. Provisionar Railway/Render para API
6. Registrar domínio travelplataforma.com.br
7. Configurar DNS no Vercel

### FASE 1: INFRAESTRUTURA REMOTA

1. Implementar SupabaseStorageAdapter
2. Criar buckets privados no Supabase
3. Configurar variáveis de ambiente no host da API
4. Deploy da API no Railway/Render
5. Deploy dos 4 frontends no Vercel
6. Configurar CORS_ALLOWED_ORIGINS
7. Validar health/readiness/version remotamente

### FASE 2: SEGURANÇA REMOTA

1. Validar RLS em ambiente Supabase remoto
2. Testar isolamento de tenant remotamente
3. Validar role não-superuser
4. Testar cross-tenant download (storage)
5. Implementar MFA secret encryption
6. Conectar Resend aos handlers de email

### FASE 3: PWA + DOMÍNIO

1. Validar PWA em cliente.travelplataforma.com.br
2. Testar instalação em dispositivo móvel
3. Validar login/logout no domínio real
4. Testar todas as rotas no domínio real

### FASE 4: CENTRO DE IMPLANTAÇÃO

1. Criar schema SQL para import_jobs
2. Criar migration SQL
3. Implementar upload (CSV/XLSX) via @fastify/multipart
4. Implementar parser (CSV + XLSX)
5. Implementar mapeamento de colunas
6. Implementar dry run + preview
7. Implementar importação via services/repositories existentes
8. Implementar audit trail
9. Implementar UI no Agency App (Direction A)
10. Testar com dados sintéticos

### FASE 5: QA E VALIDAÇÃO

1. QA remoto de todos os apps
2. Teste de importação de clientes (dados sintéticos)
3. Validação de PWA em dispositivo real
4. Teste de backup/restore em Supabase
5. Validação de CI verde
6. Documentação final
