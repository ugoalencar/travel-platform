# CENTRAL DE COMUNICAÇÃO DA AGÊNCIA — PLANO DE IMPLEMENTAÇÃO

**Data:** 2026-09-21
**Versão:** 1.0
**Depende de:** Auditoria Fase 0 (ESTADO_ATUAL_COMUNICACAO.md)

---

## Visão Geral

Implementar a Central de Comunicação da Agência em 5 frentes:

1. **Offer Visibility** — campos de visibilidade/destaque na tabela offers
2. **Agency Communications** — nova entidade tenant-scoped para banners/avisos
3. **Customer App Integration** — exibir ofertas segmentadas e comunicações
4. **WhatsApp Phase 1** — deep links e message builder
5. **History & Audit** — registro de eventos de comunicação

---

## Arquivo de Arquivos

### Novos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `infrastructure/migrations/083_offer_visibility.sql` | Campos de visibilidade em offers |
| `infrastructure/migrations/084_agency_communications.sql` | Tabela agency_communications + RLS |
| `services/api/src/agency-communications.ts` | CRUD de comunicações da agência |
| `services/api/src/routes/agency-communications.ts` | Routes HTTP para comunicações |
| `services/api/src/whatsapp-link.ts` | Deep link generation + message builder |
| `services/api/src/routes/whatsapp.ts` | Routes HTTP para WhatsApp sharing |
| `apps/agency/src/pages/CommunicationPage.tsx` | Página principal de Comunicação |
| `apps/agency/src/pages/CommunicationFormPage.tsx` | Formulário de criação/edição |
| `apps/agency/src/components/communication/CommunicationCard.tsx` | Card de comunicação |
| `apps/customer/src/customer-portal/pages/CustomerHomePage.tsx` | Home do Customer App com banners |

### Modificados

| Arquivo | Mudança |
|---------|---------|
| `services/api/src/offers.ts` | Adicionar campos visibility ao OfferRow/Query |
| `services/api/src/customer-portal.ts` | Filtrar por show_on_customer_app + segmento |
| `services/api/src/routes/offers.ts` | Aceitar campos de visibilidade no create/update |
| `services/api/src/commercial-input-parsing.ts` | Parse dos novos campos |
| `apps/agency/src/App.tsx` | Rotas de Comunicação |
| `apps/agency/src/components/layout/Sidebar.tsx` | Menu Comunicação |
| `apps/agency/src/pages/DashboardPage.tsx` | Filtrar ofertas por featured |
| `apps/customer/src/App.tsx` | Rota CustomerHomePage |
| `packages/domain/types.ts` | Tipos Offer estendidos |
| `tests/integration/database/database.integration.test.ts` | Novas tabelas |

---

## FRENTE 1: OFFER VISIBILITY

### Tarefa 1.1: Migration 083 — Campos de Visibilidade

```sql
-- infrastructure/migrations/083_offer_visibility.sql
-- Adiciona campos de controle de visibilidade à tabela offers

ALTER TABLE offers ADD COLUMN featured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE offers ADD COLUMN show_on_customer_app BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE offers ADD COLUMN target_segment_id TEXT;
ALTER TABLE offers ADD COLUMN display_priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE offers ADD COLUMN image_url TEXT;

-- FK para customer_segments (opcional)
ALTER TABLE offers ADD CONSTRAINT offers_target_segment_fk
  FOREIGN KEY (agency_id, target_segment_id)
  REFERENCES customer_segments (agency_id, id)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Índice para queries de destaque
CREATE INDEX offers_visibility_idx
  ON offers (agency_id, featured, display_priority DESC, status)
  WHERE status = 'ACTIVE';
```

### Tarefa 1.2: Estender OfferRow e Queries

**Arquivo:** `services/api/src/offers.ts`

- Adicionar ao `OfferRow`: featured, show_on_customer_app, target_segment_id, display_priority, image_url
- Adicionar ao `OFFER_COLUMNS`: novos campos
- Adicionar ao `toOffer()`: mapeamento dos novos campos
- Estender `CreateOfferInput` e `UpdateOfferInput`

### Tarefa 1.3: Estender Input Parsing

**Arquivo:** `services/api/src/commercial-input-parsing.ts`

- Adicionar parsing dos novos campos no `parseCreateOfferInput` e `parseUpdateOfferInput`

### Tarefa 1.4: Estender Types

**Arquivo:** `packages/domain/types.ts`

- Adicionar campos ao tipo `Offer`: featured, showOnCustomerApp, targetSegmentId, displayPriority, imageUrl

### Tarefa 1.5: Filtrar Ofertas no Dashboard

**Arquivo:** `apps/agency/src/pages/DashboardPage.tsx`

- Já filtra `o.status === 'ACTIVE'`
- Adicionar filtro: `o.featured === true` para o carrossel de destaques
- Manter lista completa na página de ofertas

### Tarefa 1.6: Filtrar Ofertas no Customer App

**Arquivo:** `services/api/src/customer-portal.ts`

- Na função `listAvailableOffers`:
  - Adicionar filtro: `show_on_customer_app = true`
  - Adicionar filtro de segmento: se `target_segment_id` não é NULL, verificar membership
  - Se `target_segment_id` é NULL, incluir (política: todos os clientes elegíveis)

---

## FRENTE 2: AGENCY COMMUNICATIONS

### Tarefa 2.1: Migration 084 — Agency Communications

```sql
-- infrastructure/migrations/084_agency_communications.sql

CREATE TYPE agency_communication_type AS ENUM ('OFFER', 'NOTICE', 'CAMPAIGN', 'INFORMATION');
CREATE TYPE agency_communication_status AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'ARCHIVED');
CREATE TYPE agency_communication_placement AS ENUM ('CUSTOMER_APP_HOME', 'CUSTOMER_APP_OFFERS', 'AGENCY_DASHBOARD');

CREATE TABLE agency_communications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  type agency_communication_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  cta_label TEXT,
  cta_url TEXT,
  placement agency_communication_placement NOT NULL DEFAULT 'CUSTOMER_APP_HOME',
  display_priority INTEGER NOT NULL DEFAULT 0,
  target_segment_id TEXT,
  visible_from TIMESTAMPTZ,
  visible_until TIMESTAMPTZ,
  status agency_communication_status NOT NULL DEFAULT 'DRAFT',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT agency_communications_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT agency_communications_segment_tenant_fk
    FOREIGN KEY (agency_id, target_segment_id)
    REFERENCES customer_segments (agency_id, id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT agency_communications_created_by_fk
    FOREIGN KEY (agency_id, created_by)
    REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT agency_communications_period_chk
    CHECK (visible_from IS NULL OR visible_until IS NULL OR visible_from <= visible_until),
  CONSTRAINT agency_communications_agency_id_key UNIQUE (agency_id, id)
);

-- RLS
ALTER TABLE agency_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_communications FORCE ROW LEVEL SECURITY;

-- Policies (padrão migração 081)
CREATE POLICY agency_communications_select_tenant ON agency_communications
  FOR SELECT USING (agency_id = current_setting('app.current_agency_id')::text);
CREATE POLICY agency_communications_insert_tenant ON agency_communications
  FOR INSERT WITH CHECK (agency_id = current_setting('app.current_agency_id')::text);
CREATE POLICY agency_communications_update_tenant ON agency_communications
  FOR UPDATE USING (agency_id = current_setting('app.current_agency_id')::text);
CREATE POLICY agency_communications_delete_tenant ON agency_communications
  FOR DELETE USING (agency_id = current_setting('app.current_agency_id')::text);

-- Grants
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime_local') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON agency_communications TO travel_app_runtime_local;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON agency_communications TO travel_app_runtime;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Índices
CREATE INDEX agency_communications_placement_idx
  ON agency_communications (agency_id, placement, status, display_priority DESC);
CREATE INDEX agency_communications_segment_idx
  ON agency_communications (agency_id, target_segment_id)
  WHERE target_segment_id IS NOT NULL;
```

### Tarefa 2.2: Backend — Agency Communications CRUD

**Arquivo:** `services/api/src/agency-communications.ts`

Funções:
- `createCommunication(database, input)` — criar communication
- `updateCommunication(database, id, input)` — atualizar
- `getCommunicationById(database, id)` — buscar por ID
- `listCommunications(database, filters?)` — listar (opcionalmente por placement/status)
- `deleteCommunication(database, id)` — soft delete (mudar status para ARCHIVED)
- `publishCommunication(database, id)` — mudar status para ACTIVE
- `archiveCommunication(database, id)` — mudar status para ARCHIVED

### Tarefa 2.3: Backend — Routes

**Arquivo:** `services/api/src/routes/agency-communications.ts`

Endpoints:
- `GET /agency-communications` — listar (MANAGER+)
- `GET /agency-communications/:id` — detalhe (VIEWER+)
- `POST /agency-communications` — criar (MANAGER+)
- `PUT /agency-communications/:id` — atualizar (MANAGER+)
- `PATCH /agency-communications/:id/publish` — publicar (MANAGER+)
- `PATCH /agency-communications/:id/archive` — arquivar (MANAGER+)
- `DELETE /agency-communications/:id` — excluir (ADMIN+)

### Tarefa 2.4: Customer App — Comunicacoes Visíveis

**Arquivo:** `services/api/src/customer-portal.ts`

Nova função:
- `listVisibleCommunications(database, placement)` — retorna comunicações ACTIVE no placement, dentro da vigência, compatíveis com o segmento do cliente (ou sem segmento)

Endpoint:
- `GET /customer-api/communications?placement=CUSTOMER_APP_HOME`

### Tarefa 2.5: Audit Events

**Arquivo:** `services/api/src/audit-log.ts`

Novos eventos:
- `AGENCY_COMMUNICATION_CREATED`
- `AGENCY_COMMUNICATION_PUBLISHED`
- `AGENCY_COMMUNICATION_ARCHIVED`
- `OFFER_VISIBILITY_CHANGED`

---

## FRENTE 3: CUSTOMER APP INTEGRATION

### Tarefa 3.1: Customer Home Page

**Arquivo:** `apps/customer/src/customer-portal/pages/CustomerHomePage.tsx`

Seções:
1. **Comunicados da Agência** — banners/avisos ACTIVE no placement CUSTOMER_APP_HOME
2. **Ofertas em Destaque** — ofertas com show_on_customer_app=true, ordenadas por display_priority
3. **Próxima Viagem** — se existir, mostrar resumo
4. **Tarefas Pendentes** — se existirem

### Tarefa 3.2: Customer Offers Page — Filtragem

**Arquivo:** `apps/customer/src/customer-portal/pages/CustomerOffersPage.tsx`

- Já usa `listAvailableOffers()` que filtra ACTIVE + valid_until
- Backend passará a filtrar por `show_on_customer_app=true` + segmento

### Tarefa 3.3: Communication Card Component

**Arquivo:** `apps/customer/src/customer-portal/components/CommunicationCard.tsx`

- Card com imagem, título, body, CTA
- Tipos: OFFER (destaque para oferta), NOTICE (aviso), CAMPAIGN (campanha), INFORMATION (info)
- Estilo visual distinto por tipo

### Tarefa 3.4: Navegação

**Arquivo:** `apps/customer/src/App.tsx`

- Adicionar rota `/` → `CustomerHomePage`
- Adicionar rota `/communications` → lista de comunicações (opcional)

---

## FRENTE 4: WHATSAPP PHASE 1

### Tarefa 4.1: WhatsApp Link Generator

**Arquivo:** `services/api/src/whatsapp-link.ts`

Funções:
- `normalizePhone(phone: string): string` — normalizar para formato internacional
- `isValidPhone(phone: string): boolean` — validação básica
- `generateWhatsAppLink(phone: string, message: string): string` — gerar deep link `https://wa.me/5511999999999?text=...`
- `buildOfferShareMessage(offer, customerName): string` — mensagem para oferta
- `buildProposalShareMessage(proposal, customerName): string` — mensagem para proposta
- `buildTripShareMessage(trip, customerName): string` — mensagem para viagem

### Tarefa 4.2: WhatsApp Routes

**Arquivo:** `services/api/src/routes/whatsapp.ts`

Endpoints:
- `POST /api/whatsapp/share/offer` — gerar link de compartilhamento de oferta
- `POST /api/whatsapp/share/proposal` — gerar link de compartilhamento de proposta
- `POST /api/whatsapp/share/trip` — gerar link de compartilhamento de viagem
- `GET /api/whatsapp/customer/:id/link` — gerar link de conversa com cliente

Todos retornam: `{ link: string, message: string, preview: string }`

### Tarefa 4.3: Phone Validation

- Usar `customers.whatsapp` já existente
- Normalizar formato: remover caracteres não-numéricos, adicionar código do país
- Se inválido ou ausente: retornar erro claro, não gerar link

### Tarefa 4.4: Message Templates

Templates em português do Brasil:

**Oferta:**
```
Olá, {nome}! 🌴

Temos uma oferta de {destino} que pode te interessar:

{dias} noites · {categoria}
A partir de R$ {preço}

{link}
```

**Proposta:**
```
Olá, {nome}! ✈️

Sua proposta para {destino} está pronta:

{resumo}
Validade: {validade}

{link}
```

**Viagem:**
```
Olá, {nome}! 🗺️

Suas informações de viagem para {destino}:

{detalhes}

{link}
```

### Tarefa 4.5: Preparação Arquitetural

**Arquivo:** `services/api/src/messaging-provider.ts` (documentação apenas)

```typescript
// FUTURO: WhatsApp Business API
// Interface para futura implementação
export interface MessagingProvider {
  sendMessage(to: string, message: string): Promise<MessageResult>;
  sendTemplate(to: string, templateId: string, params: Record<string, string>): Promise<MessageResult>;
  getStatus(messageId: string): Promise<MessageStatus>;
  processWebhook(payload: unknown): Promise<WebhookEvent>;
}
```

---

## FRENTE 5: HISTORY & AUDIT

### Tarefa 5.1: Communication History via Engagements

Usar tabela `engagements` existente com novos tipos:

- `OFFER_SHARED_WHATSAPP`
- `PROPOSAL_SHARED_WHATSAPP`
- `CUSTOMER_WHATSAPP_OPENED`
- `AGENCY_NOTICE_CREATED`
- `AGENCY_NOTICE_PUBLISHED`
- `COMMUNICATION_ARCHIVED`

### Tarefa 5.2: Customer Interactions Estendida

Usar tabela `customer_interactions` existente com novos canais:

- Adicionar enum value `WHATSAPP` a `InteractionChannel` (se não existir)
- Adicionar enum value `IN_APP_BANNER` a `InteractionChannel`

---

## ORDEM DE EXECUÇÃO

| # | Tarefa | Frente | Dependências |
|---|--------|--------|--------------|
| 1 | Migration 083 (offer visibility) | 1 | Nenhuma |
| 2 | Estender OfferRow/queries/types | 1 | #1 |
| 3 | Estender input parsing | 1 | #2 |
| 4 | Filtrar Dashboard por featured | 1 | #2 |
| 5 | Filtrar Customer App por visibility | 1 | #2 |
| 6 | Migration 084 (agency communications) | 2 | Nenhuma |
| 7 | Backend agency communications CRUD | 2 | #6 |
| 8 | Backend routes agency communications | 2 | #7 |
| 9 | Customer App communications endpoint | 2 | #7 |
| 10 | Audit events | 2 | #7 |
| 11 | Customer Home Page | 3 | #5, #9 |
| 12 | Communication Card component | 3 | #9 |
| 13 | WhatsApp link generator | 4 | Nenhuma |
| 14 | WhatsApp routes | 4 | #13 |
| 15 | Message templates | 4 | #13 |
| 16 | Communication history via engagements | 5 | #7 |
| 17 | Testes | Todas | #1-#16 |
| 18 | Quality gates | Todas | #17 |
| 19 | Documentação | Todas | #18 |

---

## TESTES

| # | Teste | Tipo |
|---|-------|------|
| 1 | Offer aparece no Agency Dashboard quando featured=true | Integration |
| 2 | Offer não aparece quando featured=false | Integration |
| 3 | Offer não aparece quando show_on_customer_app=false | Integration |
| 4 | Offer com vigência futura não aparece | Integration |
| 5 | Offer com vigência expirada não aparece | Integration |
| 6 | Offer com prioridade maior aparece primeiro | Integration |
| 7 | Customer App respeita tenant (cliente de outro tenant não vê) | Security |
| 8 | Customer App respeita segmentação | Integration |
| 9 | Communication DRAFT não aparece no Customer App | Integration |
| 10 | Communication ACTIVE aparece | Integration |
| 11 | Communication segment-scoped respeita membership | Integration |
| 12 | RBAC: MANAGER pode criar communication | Integration |
| 13 | RBAC: AGENT não pode criar communication | Security |
| 14 | WhatsApp link com número válido gera link correto | Unit |
| 15 | WhatsApp link com número inválido retorna erro | Unit |
| 16 | WhatsApp link sem número retorna erro | Unit |
| 17 | Audit events são registrados | Integration |
| 18 | Reload/persistence funciona | E2E |

---

## GATES

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:security
npm run test:db
npm run build
```

CI verde obrigatório.
