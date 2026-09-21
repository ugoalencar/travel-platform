# Central de Comunicação da Agência — Especificação

**Versão:** 1.0
**Data:** 2026-09-21
**Status:** Implementado (Fase 1)

---

## Visão Geral

A Central de Comunicação permite que a agência gerencie a visibilidade de suas ofertas e crie comunicações (banners, avisos, campanhas) para exibição no Customer App e no Dashboard da Agência.

---

## 1. Entidades

### 1.1 Offer — Campos de Visibilidade (Migração 084)

Novos campos adicionados à tabela `offers`:

| Campo | Tipo | Padrão | Descrição |
|-------|------|--------|-----------|
| `featured` | BOOLEAN | false | Destacada no carrossel do Agency Dashboard |
| `show_on_customer_app` | BOOLEAN | true | Visível no Customer App |
| `target_segment_id` | TEXT (FK) | NULL | Segmento de clientes elegível |
| `display_priority` | INTEGER | 0 | Prioridade de exibição (maior = primeiro) |
| `image_url` | TEXT | NULL | URL da imagem para exibição |

### 1.2 Agency Communications (Migração 085)

Nova tabela `agency_communications`:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | TEXT PK | Identificador único |
| `agency_id` | TEXT FK | Tenant (agency) |
| `type` | ENUM | OFFER, NOTICE, CAMPAIGN, INFORMATION |
| `title` | TEXT | Título da comunicação |
| `body` | TEXT | Corpo do texto |
| `image_url` | TEXT | URL da imagem |
| `cta_label` | TEXT | Texto do botão CTA |
| `cta_url` | TEXT | URL do CTA |
| `placement` | ENUM | CUSTOMER_APP_HOME, CUSTOMER_APP_OFFERS, AGENCY_DASHBOARD |
| `display_priority` | INTEGER | Prioridade de exibição |
| `target_segment_id` | TEXT FK | Segmento-alvo |
| `visible_from` | TIMESTAMPTZ | Data de início da vigência |
| `visible_until` | TIMESTAMPTZ | Data de fim da vigência |
| `status` | ENUM | DRAFT, SCHEDULED, ACTIVE, EXPIRED, ARCHIVED |
| `created_by` | TEXT FK | Usuário criador |
| `created_at` | TIMESTAMPTZ | Data de criação |
| `updated_at` | TIMESTAMPTZ | Data de atualização |

---

## 2. API

### 2.1 Agency Communications

| Método | Rota | RBAC | Descrição |
|--------|------|------|-----------|
| GET | `/api/agency-communications` | VIEWER+ | Listar comunicações |
| GET | `/api/agency-communications/:id` | VIEWER+ | Detalhe da comunicação |
| POST | `/api/agency-communications` | MANAGER+ | Criar comunicação |
| PUT | `/api/agency-communications/:id` | MANAGER+ | Atualizar comunicação |
| PATCH | `/api/agency-communications/:id/publish` | MANAGER+ | Publicar (ACTIVE) |
| PATCH | `/api/agency-communications/:id/archive` | MANAGER+ | Arquivar (ARCHIVED) |
| DELETE | `/api/agency-communications/:id` | ADMIN+ | Excluir comunicação |

### 2.2 WhatsApp (Fase 1)

| Método | Rota | RBAC | Descrição |
|--------|------|------|-----------|
| POST | `/api/whatsapp/share/offer` | AGENT+ | Link de compartilhamento de oferta |
| POST | `/api/whatsapp/share/proposal` | AGENT+ | Link de compartilhamento de proposta |
| POST | `/api/whatsapp/share/trip` | AGENT+ | Link de compartilhamento de viagem |
| GET | `/api/whatsapp/customer/:id/link` | AGENT+ | Link de conversa com cliente |

### 2.3 Customer Portal

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/customer-api/offers` | Ofertas visíveis (filtradas por show_on_customer_app + segmento) |
| GET | `/customer-api/communications?placement=X` | Comunicações visíveis no placement |

---

## 3. RBAC

| Ação | OWNER | ADMIN | MANAGER | AGENT | VIEWER |
|------|-------|-------|---------|-------|--------|
| Ver comunicações | ✅ | ✅ | ✅ | ✅ | ✅ |
| Criar/editar comunicação | ✅ | ✅ | ✅ | ❌ | ❌ |
| Publicar/arquivar | ✅ | ✅ | ✅ | ❌ | ❌ |
| Excluir comunicação | ✅ | ✅ | ❌ | ❌ | ❌ |
| Configurar destaques de oferta | ✅ | ✅ | ✅ | ❌ | ❌ |
| Compartilhar via WhatsApp | ✅ | ✅ | ✅ | ✅ | ❌ |

---

## 4. Segmentação

Ofertas e comunicações podem ser segmentadas usando `customer_segments` existente:

- Se `target_segment_id` é NULL → todos os clientes elegíveis
- Se `target_segment_id` está definido → apenas clientes no segmento
- Membership é computado em tempo de leitura via `customer_segments.filter_definition`

---

## 5. Frontend

### Agency Dashboard

- **Comunicação** (`/communications`): Lista de comunicações com filtros por status
- **Dashboard** (`/`): Carrossel "Ofertas em destaque" filtra por `featured = true`

### Customer App

- **Home** (`/`): Exibe banners/avisos ACTIVE no placement `CUSTOMER_APP_HOME`
- **Ofertas** (`/customer-portal/offers`): Exibe ofertas com `show_on_customer_app = true`

---

## 6. WhatsApp — Fase 1

### Deep Links

- Formato: `https://wa.me/{telefone}?text={mensagem}`
- Validação de telefone: mínimo 12 dígitos (55 + DD + número)
- Normalização: remove caracteres especiais, adiciona DDI 55

### Message Builder

Templates em português do Brasil:
- **Oferta**: "Olá, {nome}! 🌴 Temos uma oferta de {destino}..."
- **Proposta**: "Olá, {nome}! ✈️ Sua proposta está pronta..."
- **Viagem**: "Olá, {nome}! 🗺️ Suas informações de viagem..."

### Preparação Arquitetural

Interface `MessagingProvider` documentada para futura integração com WhatsApp Business API. Não implementada nesta fase.

---

## 7. Audit Events

| Evento | Descrição |
|--------|-----------|
| `AGENCY_COMMUNICATION_CREATED` | Comunicação criada |
| `AGENCY_COMMUNICATION_PUBLISHED` | Comunicação publicada |
| `AGENCY_COMMUNICATION_ARCHIVED` | Comunicação arquivada |
| `OFFER_VISIBILITY_CHANGED` | Flags de visibilidade da oferta alteradas |

---

## 8. Migrações

| # | Arquivo | Descrição |
|---|---------|-----------|
| 084 | `084_offer_visibility.sql` | Campos de visibilidade em offers |
| 085 | `085_agency_communications.sql` | Tabela agency_communications + RLS |

---

## 9. Gap Documentado

### LGPD / Consentimento

Não existe consentimento de marketing para clientes. Na fase 1:
- Apenas compartilhamento manual via WhatsApp (sem automação)
- Sem marketing em massa automático
- Sem disparo de mensagens automáticas

### Imagens de Ofertas

A tabela `offers` agora possui `image_url`. O carrossel do Dashboard usa `destinationGradient` (gerado a partir do nome). Para ofertas com imagem, usar `imageUrl`.

---

## 10. Não Implementado (Fase 2+)

- WhatsApp Business API completa
- Chatbot
- LLM
- Campanhas em massa
- Automação de mensagens
- Broadcast automático
- Marketplace
- Amadeus
- Billing de mensagens
- Novo sistema de Segmentação
