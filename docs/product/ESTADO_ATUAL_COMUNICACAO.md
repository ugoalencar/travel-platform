# CENTRAL DE COMUNICAÇÃO DA AGÊNCIA — FASE 0: AUDITORIA

**Data:** 2026-09-21
**Status:** Auditoria concluída

---

## 1. ENTIDADES EXISTENTES — MAPA COMPLETO

### 1.1 Offers (migração 001)

**Tabela:** `offers`
**Colunas:** id, agency_id, name, description, price, valid_from, valid_until, status, created_at, updated_at
**RLS:** Habilitado, tenant-scoped

**O que falta:**
- `featured` (boolean) — para controlar destaque no Dashboard
- `show_on_customer_app` (boolean) — para controlar visibilidade no Customer App
- `target_segment_id` (TEXT FK → customer_segments) — para segmentação
- `display_priority` (integer) — para ordenação
- `image_url` (TEXT) — imagem da oferta para exibição

**O que já existe e pode ser reaproveitado:**
- `valid_from` / `valid_until` — controle de vigência
- `status` (ACTIVE/INACTIVE/EXPIRED) — controle de status
- `price` — preço (nunca expor ao cliente via campo separado)
- RLS completo com tenant isolation

### 1.2 Customer Segments (migração 081)

**Tabela:** `customer_segments`
**Colunas:** id, agency_id, name, description, scope, owner_employee_id, is_shared, filter_definition (JSONB), created_by_user_id, created_at, updated_at, archived_at
**Backend:** `services/api/src/customer-segmentation.ts` — query builder completo
**Routes:** CRUD completo em `services/api/src/routes/customer-segments.ts`

**Reutilizável para:**
- Segmentação de ofertas (`target_segment_id`)
- Segmentação de comunicações (`target_segment_id`)
- Membership dinâmico via `filter_definition`

### 1.3 Platform Banners (migração 078)

**Tabela:** `platform_banners`
**Colunas:** id, title, subtitle, image_url, cta_label, cta_url, placement, starts_at, ends_at, status, sort_order, created_by
**Escopo:** PLATFORM-LEVEL (não tenant-scoped)

**NÃO reutilizar para comunicação da agência.** É um domínio diferente — banners globais da plataforma.

### 1.4 Customer Interactions (migração 008)

**Tabela:** `customer_interactions`
**Colunas:** id, agency_id, customer_id, opportunity_id, proposal_id, sale_id, user_id, channel, direction, occurred_at, summary, next_action_at
**RLS:** Habilitado, tenant-scoped

**Reutilizável para:**
- Histórico de comunicações (offer_shared_whatsapp, etc.)
- Criar novos InteractionChannel values: WHATSAPP, IN_APP_BANNER

### 1.5 Engagements (migração 014)

**Tabela:** `engagements`
**Colunas:** id, agency_id, type, channel, campaign_id, publication_id, offer_id, external_user_id, customer_id, opportunity_id, content, occurred_at, raw_payload
**RLS:** Habilitado, tenant-scoped

**Reutilizável para:**
- Registro de compartilhamentos WhatsApp
- Registro de visualizações de banners
- Integração com Offer & Growth existente

### 1.6 Notification Preferences (migração 037)

**Tabela:** `notification_preferences`
**Colunas:** agency_id, user_id, email_notifications, push_notifications
**RLS:** Habilitado, tenant-scoped

**Gap:** Não existe consentimento de marketing ou preferência de contato do cliente (apenas do staff interno). Ver enrollment_submissions (migração 049) que tem consent_given para inscrição.

### 1.7 Customer WhatsApp Fields

**Tabela:** `customers` (migração 001)
**Campos:** whatsapp, emergency_contact_whatsapp

**Já existe:** Dados de WhatsApp do cliente cadastrados.
**Falta:** Normalização de formato, validação de número, deep link generation.

### 1.8 Enrollment Consent (migração 049)

**Tabela:** `enrollment_submissions`
**Campos:** consent_given, consent_text_version, consent_given_at, consent_ip

**Escopo:** Apenas para inscrição em viagens. Não é consentimento de marketing.

---

## 2. BACKEND — O QUE JÁ EXISTE

| Área | Arquivo | Status |
|------|---------|--------|
| Offers CRUD | `services/api/src/offers.ts` | ✅ Completo |
| Offers Routes | `services/api/src/routes/offers.ts` | ✅ Completo |
| Customer Offers | `services/api/src/customer-portal.ts` (listAvailableOffers) | ✅ Filtra ACTIVE + valid_until |
| Customer Segments | `services/api/src/customer-segmentation.ts` | ✅ Completo |
| Customer Interactions | `services/api/src/customer-interactions.ts` | ✅ Completo |
| Engagements | `services/api/src/engagement.ts` | ✅ Completo |
| Audit Log | `services/api/src/audit-log.ts` | ✅ Completo |
| RBAC | `packages/domain/tenant-context.ts` | ✅ OWNER/ADMIN/MANAGER/AGENT/VIEWER |

---

## 3. FRONTEND — O QUE JÁ EXISTE

### Agency Dashboard (`apps/agency`)

| Componente | Caminho | Status |
|------------|---------|--------|
| Dashboard Page | `pages/DashboardPage.tsx` | ✅ Carrossel "Ofertas em destaque" |
| Offer Cards | `components/commercial/OfferCard.tsx` | ✅ Exibe imagem/destino/preço/período |
| Offers Page | `pages/OffersPage.tsx` | ✅ Lista de ofertas |
| Offer Detail | `pages/OfferDetailPage.tsx` | ✅ Detalhe da oferta |

**Observação:** O carrossel já se chama "Ofertas em destaque" mas exibe TODAS as ofertas ativas. Não há filtro por `featured`.

### Customer App (`apps/customer`)

| Componente | Caminho | Status |
|------------|---------|--------|
| Customer Offers | `customer-portal/pages/CustomerOffersPage.tsx` | ✅ Lista ofertas ativas |
| Customer Offer Detail | `customer-portal/pages/CustomerOfferDetailsPage.tsx` | ✅ Detalhe |
| InstallAppBanner | `customer-portal/InstallAppBanner.tsx` | ⚠️ PWA install, não comunicação |
| EntitlementNotice | `components/offer-growth/EntitlementNotice.tsx` | ⚠️ Feature flag, não banner |

**Observação:** Não existe área de banners/avisos da agência no Customer App. Apenas lista de ofertas.

---

## 4. O QUE NÃO EXiste (GAPS CONFIRMADOS)

| Item | Status | Impacto |
|------|--------|---------|
| Agency Communication (entidade) | ❌ Não existe | Novo domínio necessário |
| Agency Banners/Avisos | ❌ Não existe | Nova tabela necessária |
| Offer featured/priority flags | ❌ Não existe | Migration adicional em offers |
| Offer image_url | ❌ Não existe | Migration adicional em offers |
| Offer show_on_customer_app | ❌ Não existe | Migration adicional em offers |
| Offer target_segment_id | ❌ Não existe | FK para customer_segments |
| WhatsApp deep link generation | ❌ Não existe | Nova lógica no backend |
| WhatsApp message builder | ❌ Não existe | Nova utilidade |
| Marketing consent | ❌ Não existe | Gap documentado (LGPD) |
| Communication history | ⚠️ Parcial | customer_interactions pode ser estendido |
| Channel settings | ❌ Não existe | Configuração futura |

---

## 5. O QUE É PLATFORM-GLOBAL vs TENANT-SCOPED

| Entidade | Escopo | Reutilizável? |
|----------|--------|---------------|
| platform_banners | Platform-global | ❌ NÃO — domínio diferente |
| offers | Tenant-scoped | ✅ SIM — estender com campos de visibilidade |
| customer_segments | Tenant-scoped | ✅ SIM — reusar para segmentação |
| customer_interactions | Tenant-scoped | ✅ SIM — estender para comunicação |
| engagements | Tenant-scoped | ✅ SIM — reusar para tracking |
| notification_preferences | Tenant-scoped | ⚠️ Apenas staff, não cliente |

---

## 6. DECISÕES DE IMPLEMENTAÇÃO

### 6.1 Não criar domínio paralelo

- **Ofertas em destaque:** Estender tabela `offers` com campos de visibilidade (não criar tabela separada)
- **Segmentação:** Reusar `customer_segments` existente (novo motor de filtros)
- **Histórico:** Reusar `customer_interactions` com novos canais (não criar tabela de log duplicada)
- **Tracking:** Reusar `engagements` existente

### 6.2 Criar novo domínio apenas onde necessário

- **Agency Communications:** Nova tabela `agency_communications` (tenant-scoped) — não há equivalente
- **WhatsApp Message Builder:** Nova utilidade (não há equivalente)

### 6.3 RBAC

| Ação | OWNER | ADMIN | MANAGER | AGENT | VIEWER |
|------|-------|-------|---------|-------|--------|
| Configurar destaques de oferta | ✅ | ✅ | ✅ | ❌ | ❌ |
| Criar/editar comunicação | ✅ | ✅ | ✅ | ❌ | ❌ |
| Publicar comunicação | ✅ | ✅ | ✅ | ❌ | ❌ |
| Compartilhar oferta via WhatsApp | ✅ | ✅ | ✅ | ✅ | ❌ |
| Compartilhar proposta via WhatsApp | ✅ | ✅ | ✅ | ✅ | ❌ |
| Ver histórico de comunicações | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 7. RISCOS E GAPS

1. **LGPD/Consentimento:** Não existe consentimento de marketing para clientes. Gap documentado. Na fase 1, não haverá marketing em massa automático — apenas compartilhamento manual via WhatsApp.

2. **Imagens de ofertas:** A tabela `offers` não possui `image_url`. O carrossel do Dashboard usa `destinationGradient` (gerado a partir do nome). Para ofertas em destaque no Customer App, será necessário adicionar `image_url`.

3. **WhatsApp Business API:** Fase 1 é apenas deep link. A arquitetura para futura integração será documentada mas não implementada.

4. **Placements futuros:** Inicialmente apenas CUSTOMER_APP_HOME, CUSTOMER_APP_OFFERS, AGENCY_DASHBOARD. Non-used placements não serão adicionados.
