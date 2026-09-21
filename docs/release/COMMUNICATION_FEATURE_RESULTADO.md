# 🏗️ CENTRAL DE COMUNICAÇÃO DA AGÊNCIA — RESULTADO

**Data:** 2026-09-21  
**Status:** ✅ CONCLUÍDO NO PILOTO  
**Branch:** feature/agency-communication-center

---

## 🏁 Validação do Piloto (2026-09-21)

| Condição | Status |
|----------|--------|
| Migrations 084-085 aplicadas no banco piloto | ✅ |
| API_ORIGIN real configurado nos 4 SPAs | ✅ |
| 4 SPAs (agency, customer, marketing, platform-admin) redeployados | ✅ |
| Agency Communication: criar → publicar → exibir | ✅ |
| Customer App recebe comunicação correta (banner na Home) | ✅ |
| Oferta segmentada respeita tenant/segmento | ✅ |
| WhatsApp deep link funciona em dispositivo real | ✅ |
| CI verde (lint, typecheck, build, tests) | ✅ |

---

## 📊 Quality Gates

| Gate | Resultado |
|------|-----------|
| `npm run lint` | ✅ 0 erros |
| `npm run typecheck` | ✅ 7/7 pacotes |
| `npm run build` | ✅ 7/7 pacotes |
| `npm run test:security` | ✅ 58/58 testes |
| `npm run test:db` | ✅ 9/9 testes |

---

## 📁 Arquivos Criados (14)

### Migrações SQL
| Arquivo | Descrição |
|---------|-----------|
| `infrastructure/migrations/084_offer_visibility.sql` | Campos `featured`, `show_on_customer_app`, `target_segment_id`, `display_priority`, `image_url` em offers |
| `infrastructure/migrations/085_agency_communications.sql` | Tabela `agency_communications` + RLS + grants |

### Backend
| Arquivo | Descrição |
|---------|-----------|
| `services/api/src/agency-communications.ts` | CRUD completo de comunicações da agência |
| `services/api/src/routes/agency-communications.ts` | 7 endpoints HTTP com RBAC |
| `services/api/src/whatsapp-link.ts` | Deep links, normalização de telefone, message builder |
| `services/api/src/routes/whatsapp.ts` | 4 endpoints WhatsApp (Fase 1) |

### Frontend — Agency
| Arquivo | Descrição |
|---------|-----------|
| `apps/agency/src/pages/CommunicationPage.tsx` | Página principal de Comunicação (listagem) |
| `apps/agency/src/pages/CommunicationFormPage.tsx` | Formulário de criação/edição de comunicação |

### Frontend — Customer
| Arquivo | Descrição |
|---------|-----------|
| `apps/customer/src/types/communication.ts` | Tipo `CustomerCommunication` para portal do cliente |

### Documentação
| Arquivo | Descrição |
|---------|-----------|
| `docs/product/ESTADO_ATUAL_COMUNICACAO.md` | Auditoria Fase 0 completa |
| `docs/product/CENTRAL_COMUNICACAO_AGENCIA.md` | Especificação do feature |
| `docs/product/WHATSAPP_FUTURE_INTEGRATION.md` | Arquitetura futura WhatsApp Business API |
| `docs/release/COMMUNICATION_FEATURE_REPORT.md` | Relatório de implementação |
| `docs/superpowers/plans/2026-09-21-agency-communication-center.md` | Plano de implementação |

---

## 📝 Arquivos Modificados (21)

| Arquivo | Mudança |
|---------|---------|
| `packages/domain/types.ts` | Interface `Offer` estendida com `featured`, `showOnCustomerApp`, `targetSegmentId`, `displayPriority`, `imageUrl` |
| `services/api/src/offers.ts` | `OfferRow`, `OFFER_COLUMNS`, `CreateOfferInput`, `UpdateOfferInput`, `toOffer()` atualizados |
| `services/api/src/customer-portal.ts` | `listAvailableOffers()` filtra por `show_on_customer_app` + segmento |
| `services/api/src/commercial-input-parsing.ts` | Parsing dos novos campos em `parseCreateOfferInput` e `parseUpdateOfferInput` |
| `services/api/src/app.ts` | Imports e registro de `registerAgencyCommunicationsRoutes` e `registerWhatsAppRoutes` |
| `services/api/src/audit-log.ts` | 4 novos tipos: `AGENCY_COMMUNICATION_CREATED`, `_PUBLISHED`, `_ARCHIVED`, `OFFER_VISIBILITY_CHANGED` |
| `services/api/src/pescador.ts` | `toOffer()` atualizado com campos default |
| `services/api/src/routes/customer-portal.ts` | Endpoint `GET /customer-api/communications` adicionado |
| `apps/agency/src/App.tsx` | Rotas `/communications/new` e `/communications/:id/edit` |
| `apps/agency/src/components/layout/Sidebar.tsx` | Menu "Comunicação" na seção Marketing |
| `apps/agency/src/lib/api.ts` | CRUD de comunicações + Offer type com visibilidade |
| `apps/agency/src/types/offer.ts` | Campos de visibilidade no tipo Offer |
| `apps/agency/src/components/ui/badge.tsx` | Variantes `success`, `warning`, `error` |
| `apps/agency/src/pages/OfferDetailPage.tsx` | Seção "Divulgação" no display + modal de edição |
| `apps/customer/src/types/offer.ts` | Campos de visibilidade no tipo Offer |
| `apps/customer/src/lib/customerApi.ts` | `listVisibleCommunications()` adicionado |
| `apps/customer/src/customer-portal/pages/CustomerHomePage.tsx` | `CommunicationsBanner` + busca de comunicações |
| `tests/integration/database/database.integration.test.ts` | `agency_communications` em `expectedAllTables` e `expectedTenantTables` |
| `tests/integration/database/002_prepare_local_roles.sql` | Grants para `agency_communications` |
| `apps/customer/src/customer-portal/pages/CustomerHomePage.test.tsx` | Mock de `listVisibleCommunications` |
| `apps/agency/src/pages/PescadorPage.test.tsx` | Mock Offer atualizado com campos de visibilidade |

---

## 🔌 API Implementada

### Agency Communications (7 endpoints)

```
GET    /api/agency-communications              → Listar (VIEWER+)
GET    /api/agency-communications/:id          → Detalhe (VIEWER+)
POST   /api/agency-communications              → Criar (MANAGER+)
PUT    /api/agency-communications/:id          → Atualizar (MANAGER+)
PATCH  /api/agency-communications/:id/publish  → Publicar (MANAGER+)
PATCH  /api/agency-communications/:id/archive  → Arquivar (MANAGER+)
DELETE /api/agency-communications/:id          → Excluir (ADMIN+)
```

### WhatsApp — Fase 1 (4 endpoints)

```
POST   /api/whatsapp/share/offer              → Link de oferta (AGENT+)
POST   /api/whatsapp/share/proposal            → Link de proposta (AGENT+)
POST   /api/whatsapp/share/trip                → Link de viagem (AGENT+)
GET    /api/whatsapp/customer/:id/link         → Link de conversa (AGENT+)
```

### Customer Portal (modificado)

```
GET    /customer-api/offers                    → Filtra por show_on_customer_app + segmento
GET    /customer-api/communications             → Comunicações ativas visíveis (banner)
```

---

## 🔐 RBAC

| Ação | OWNER | ADMIN | MANAGER | AGENT | VIEWER |
|------|:-----:|:-----:|:-------:|:-----:|:------:|
| Ver comunicações | ✅ | ✅ | ✅ | ✅ | ✅ |
| Criar/editar comunicação | ✅ | ✅ | ✅ | ❌ | ❌ |
| Publicar/arquivar | ✅ | ✅ | ✅ | ❌ | ❌ |
| Excluir comunicação | ✅ | ✅ | ❌ | ❌ | ❌ |
| Configurar destaques | ✅ | ✅ | ✅ | ❌ | ❌ |
| Compartilhar WhatsApp | ✅ | ✅ | ✅ | ✅ | ❌ |

---

## 📊 Modelo de Dados

### Novos campos em `offers`

```sql
featured          BOOLEAN NOT NULL DEFAULT false
show_on_customer_app  BOOLEAN NOT NULL DEFAULT true
target_segment_id TEXT (FK → customer_segments)
display_priority  INTEGER NOT NULL DEFAULT 0
image_url         TEXT
```

### Nova tabela `agency_communications`

```
id, agency_id, type, title, body, image_url, cta_label, cta_url,
placement, display_priority, target_segment_id, visible_from,
visible_until, status, created_by, created_at, updated_at
```

**Enums:** `agency_communication_type`, `agency_communication_status`, `agency_communication_placement`

**RLS:** Habilitado + FORCE RLS (padrão migração 081)

---

## 🧩 Integração com Entidades Existentes

| Entidade | Reaproveitamento |
|----------|------------------|
| `customer_segments` | Segmentação de ofertas e comunicações |
| `customer_interactions` | Histórico de compartilhamentos (estendido) |
| `engagements` | Tracking de visualizações (estendido) |
| `notification_preferences` | Preferências de notificação (existentes) |
| `platform_banners` | **NÃO reutilizado** — domínio diferente |

---

## 📱 WhatsApp — Fase 1

### O que faz
- Gera deep links `https://wa.me/{telefone}?text={mensagem}`
- Normaliza telefones (remove `( ) -`, adiciona DDI 55)
- Message builder com templates em português
- Preview antes de abrir WhatsApp

### O que NÃO faz
- ❌ WhatsApp Business API
- ❌ Envio automático de mensagens
- ❌ Chatbot
- ❌ Campanhas em massa
- ❌ Billing de mensagens

---

## 📋 Gaps Documentados

| # | Gap | Status |
|---|-----|--------|
| 1 | LGPD: Sem consentimento de marketing para clientes | ⚠️ Aberto — fase 1 é apenas compartilhamento manual |
| 2 | Formulário de criação/edição de comunicação | ✅ **Fechado** — `CommunicationFormPage` implementado |
| 3 | Customer Home: banners e comunicados | ✅ **Fechado** — `CommunicationsBanner` no `CustomerHomePage` |
| 4 | Integração Segmentação: `listAvailableOffers` usa lista simplificada | ⚠️ Aberto — necessário `customer-segmentation.ts` query builder para produção |

---

## ⏭️ Próximos Passos (pós-piloto)

1. Integrar `customer-segmentation.ts` query builder no `listAvailableOffers` (produção)
2. LGPD: implementar mecanismo de consentimento de marketing
3. WhatsApp Business API (Fase 2 — ver `WHATSAPP_FUTURE_INTEGRATION.md`)
4. Dashboard de métricas de engajamento (visualizações, cliques CTA)
5. Notificações push para comunicações urgentes

---

## 📦 Entregas da Fase 2 (Formulário + Customer Home)

### CommunicationFormPage (`apps/agency/src/pages/CommunicationFormPage.tsx`)
- Formulário completo de criação e edição de comunicações
- Campos: tipo, título, descrição, imagem, CTA (texto + URL), destino, prioridade, datas de exibição, segmento-alvo
- Modo criação (`/communications/new`) e edição (`/communications/:id/edit`)
- Validação client-side (título obrigatório)
- Navegação de volta para listagem

### Customer-api/communications (`services/api/src/routes/customer-portal.ts`)
- Endpoint `GET /customer-api/communications?placement=CUSTOMER_APP_HOME`
- Retorna apenas comunicações ACTIVE com datas de exibição válidas
- Filtra por placement (CUSTOMER_APP_HOME ou CUSTOMER_APP_OFFERS)
- Tenant-scoped via customerHooks

### CommunicationsBanner (`apps/customer/src/customer-portal/pages/CustomerHomePage.tsx`)
- Componente que exibe comunicações ativas como cards horizontais
- Ícones por tipo (🏷️ Oferta, 📢 Aviso, 📣 Campanha, ℹ️ Informação)
- Imagem de capa (quando disponível)
- CTA clicável (quando configurado)
- Posicionado no topo da Home, antes da próxima viagem

### Offer Divulgação (`apps/agency/src/pages/OfferDetailPage.tsx`)
- Seção "Divulgação" no card de detalhes da oferta
- Checkboxes: Destacada (⭐), Visível no App do Cliente
- Campos: Prioridade, Segmento-alvo, URL da Imagem
- Integrado ao modal de edição e duplicação
