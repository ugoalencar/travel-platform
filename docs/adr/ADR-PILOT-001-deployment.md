# ADR-PILOT-001: Infraestrutura de Deploy do Piloto Remoto

**Status:** ACEITA  
**Data:** 2026-09-20  
**Decisor:** Arquiteto SaaS + Engenheiro de Plataforma

---

## Contexto

A Travel Platform precisa ser implantada remotamente para um piloto com uma
agência real. A infraestrutura deve ser adequada à arquitetura real do
sistema:

- Fastify API como processo longo (não serverless)
- AsyncLocalStorage para TenantContext
- Rate limiting com Redis distribuído
- Connection pooling com PostgreSQL
- Multipart uploads para documentos
- RLS forçado no banco de dados

Ao mesmo tempo, a infraestrutura não deve modificar a arquitetura apenas
para "caber" em um provider, nem criar dependências que impeçam futura
migração para AWS.

## Decisão

### Frontends → Vercel

Quatro projetos SPA estáticos, um por aplicação:
- Agency App → app.travelplataforma.com.br
- Customer App/PWA → cliente.travelplataforma.com.br
- Platform Admin → admin.travelplataforma.com.br
- Marketing → travelplataforma.com.br

Cada projeto usa Vite build + vercel.json com rewrites para API.
Vercel fornece CDN, HTTPS automático e preview deployments.

### API → Serviço Node Persistente

**NÃO** Vercel Functions. Razões:
1. Fastify é processo longo com lifecycle hooks
2. AsyncLocalStorage requer propagação de contexto por request
3. Rate limiting requer estado Redis compartilhado
4. Connection pooling é ineficiente em serverless (cold starts)
5. Multipart uploads precisam de streaming

Opções viáveis: Railway, Render, Fly.io.
Dockerfile já existe na raiz do repo e está validado.

### Banco → Supabase PostgreSQL

- Região Brasil (São Paulo) se disponível
- Role dedicada `travel_app_runtime` (não-superuser, sem BYPASSRLS)
- 81+ migrations aplicadas via SQL Editor
- Connection pooling via PgBouncer (porta 6543)
- RLS forçado em todas as tabelas tenant-scoped

### Redis → Upstash

- TLS, gerenciado, compatível com REDIS_URL
- Rate limiting distribuído
- Sem fallback para in-memory em produção

### Storage → Supabase Storage

- Buckets privados para documentos e imports
- Adapter a ser implementado (SupabaseStorageAdapter)
- Interface independente de provider preservada

### Email → Resend

- Já integrado (resend-provider.ts)
- Falta wiring final nos handlers de password reset
- Fail-closed se não configurado

## Não Fazer

1. **Não adaptar Fastify para Vercel Functions** — refatoração desnecessária
2. **Não substituir Auth por Supabase Auth** — auth existente é adequada
3. **Não migrar regras de domínio para Supabase** — lógica fica na API
4. **Não remover RLS/RBAC/TenantContext** — segurança não é negociável
5. **Não criar dependência de Supabase Auth ou Storage para domínio**
6. **Não implementar tudo antes do piloto** — MVP primeiro

## Consequências

### Positivas
- Deploy rápido (Dockerfile pronto, vercel.json prontos)
- Separation of concerns clara
- Flexibilidade para migração futura
- Supabase como infraestrutura, não dependência de domínio

### Negativas
- dois providers para gerenciar (Vercel + Node host)
- Custo adicional com Upstash Redis
- Necessidade de gerenciar DNS manualmente

### Riscos
- Supabase pode ter limitações de connection pooling para alta concorrência
- Railway/Render podem ter limitações de WebSocket (se necessário no futuro)
- Migração para AWS demandará trabalho adicional

## Alternativas Consideradas

1. **Vercel para tudo (incluindo API)** — Rejeitado: Fastify não é serverless-compatible
2. **AWS desde o início** — Rejeitado: complexidade desnecessária para piloto
3. **Supabase Auth** — Rejeitado: auth existente é adequada e testada
4. **Railway para tudo** — Rejeitado: Vercel é melhor para SPAs estáticas

## Referências

- docs/deployment/STAGING_DEPLOY_RUNBOOK.md
- docs/deployment/VERCEL_SUPABASE_READINESS.md
- services/api/src/env.ts (production safety gates)
- services/api/src/server.ts (lifecycle, graceful shutdown)
- services/api/src/rate-limit.ts (Redis store)
- infrastructure/migrations/ (81+ migrations)
