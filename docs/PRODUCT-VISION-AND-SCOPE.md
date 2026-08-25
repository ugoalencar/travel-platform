# Travel Platform — Visão do Produto e Escopo

> **Nota para agentes de IA:** Este documento descreve a visão e o escopo do
> produto. Não substitui ADRs, schema, migrations ou documentação específica de
> domínio. Em conflito sobre comportamento implementado, consultar as fontes
> técnicas específicas: `packages/database/schema.prisma`,
> `infrastructure/migrations/*.sql`, `docs/02-domain/*.md`, `docs/adr/*.md` e
> código-fonte em `services/api/src/`.
>
> **Nota de proveniência (2026-08-24):** Este documento foi reconstruído a
> partir do estado REAL de `origin/main` (verificado via `git fetch` e leitura
> direta de `packages/database/schema.prisma`, `services/api/src/*`,
> `apps/customer/src/*`, `gh pr list --state all`, `git branch -r` e
> `git log`). Uma versão anterior deste arquivo existia apenas em um branch
> `main` local não sincronizado com `origin/main` (divergente desde o commit
> `bb0e2b3`) e continha status desatualizados para as áreas Sale, Commercial
> Cockpit e Configurable Pipeline; esses status foram corrigidos aqui.
>
> **Categorias de status usadas neste documento (apenas estas):** MERGED,
> PR READY, LOCAL IMPLEMENTED, IN DEVELOPMENT, PLANNED, DEFERRED, DECISION
> REQUIRED.

> **Adendo Batch 02 (2026-08-25):** no branch atual, Financial Foundation,
> Booking cancellation, Pescador manual capture, Proposal lifecycle, Sale
> lifecycle/Sale-to-Receivable, Commercial Cockpit indicators, Customer 360
> aggregation, and bot-query readiness are LOCAL IMPLEMENTED. This does not
> implement WhatsApp, production crawling/scraping, payment provider flows,
> refunds, passenger-level cancellation, Driver/Guide identity (D2), or the
> broader D3/D4 future work.

---

## Sumário Executivo

Travel Platform é uma plataforma SaaS de gestão para agências e operadores de
turismo que centraliza o ciclo completo do relacionamento com o cliente e da
operação de viagens — da captação da intenção até o pós-venda, incluindo
reservas, transportes e operações de campo.

O produto atende três públicos distintos por meio de interfaces separadas que
compartilham o mesmo domínio e backend:

1. **Agency Admin** — gestão interna da agência (equipe, clientes, comercial,
   operações, financeiro).
2. **Customer Portal** — canal direto do cliente com a agência (viagens,
   propostas, reservas, perfil).
3. **Field Operations** — experiência operacional para motoristas, guias e
   operadores em campo (check-in, cronograma, pontos monitorados).

---

## 1. Problema que o Produto Resolve

Agências de viagem operam com fluxos fragmentados: clientes em planilhas,
desejos perdidos em WhatsApp, ofertas/propostas sem rastreabilidade, vendas
registradas tarde, reservas operacionais fora do sistema, operações de campo
sem acompanhamento, dados comerciais e operacionais em silos.

```
PROSPECÇÃO → INTENÇÃO → OFERTA → PROPOSTA → VENDA → RESERVA → VIAGEM
→ OPERAÇÃO → PÓS-VENDA
```

---

## 2. Arquitetura do Produto

### 2.1 Stack (verificado em `package.json` / `packages/database/schema.prisma`)

| Camada | Tecnologia |
|--------|-----------|
| Backend | Fastify (`services/api`) |
| Database | PostgreSQL, RLS forçado |
| ORM | Prisma — gerado por introspecção; SQL (`infrastructure/migrations/*.sql`) é fonte de verdade (ADR-005) |
| Frontend | React + TypeScript + Vite, Tailwind CSS |
| Testes | Vitest |

### 2.2 Estrutura do Monorepo (real, em `origin/main`)

```
apps/customer/         # Um único app Vite contendo:
  src/pages/*           # Staff/Admin (rotas de topo)
  src/customer-portal/  # Customer Portal (CustomerPortalShell.tsx)
services/api/src/       # Handlers Fastify por domínio (customers.ts,
                         # wishes.ts, offers.ts, proposals.ts, trips.ts,
                         # bookings.ts, transport-*.ts, transport-operations.ts,
                         # customer-portal.ts, customer-auth.ts, dev-auth.ts)
packages/database/      # schema.prisma (derivado por introspecção)
packages/domain/        # types.ts, tenant-context.ts
infrastructure/migrations/*.sql   # fonte de verdade do schema
```

`apps/customer` contendo tanto o admin/staff quanto o Customer Portal no
mesmo bundle é um achado arquitetural registrado e ainda não resolvido — ver
`docs/adr/ARCH-CUSTOMER-APP-01-findings.md` e a entrada correspondente no
`docs/adr/ARCHITECTURAL-FINDINGS-REGISTRY.md`.

---

## 3. Estado das Áreas (fonte da verdade deste documento)

Status verificados em 2026-08-24 via `git fetch origin`, `git log
origin/main`, `gh pr list --state all`, `git branch -r`, e leitura direta do
código em `origin/main` / branches de feature ainda não integradas.

| Área | Status | Evidência |
|------|--------|-----------|
| Customer (CRUD) | MERGED | `services/api/src/customers.ts`, PR #4 merged |
| Wish | MERGED | `services/api/src/wishes.ts`, PR #5 merged |
| Trip | MERGED | `services/api/src/trips.ts`, PR #6 merged |
| Offer | MERGED | `services/api/src/offers.ts`, PR #7 merged |
| Proposal | MERGED | `services/api/src/proposals.ts`, PR #8 merged. No accept/decline endpoints found — status field is read/write via generic update only, no lifecycle transition logic in the handler. |
| Transportation (Route/RoutePoint/TransportProduct/Supplier/ScheduledDeparture) | MERGED | PR #9 merged, `services/api/src/transport-*.ts` present on `origin/main` |
| Booking | MERGED | PR #10 merged, `services/api/src/bookings.ts` present. Handler exports only `listBookings`, `getBookingById`, `createBooking` — **no cancellation endpoint exists** despite the `cancelled` boolean column. |
| Field Operations (TransportOperation/OperationCheckpoint) | MERGED | PR #11 merged, `services/api/src/transport-operations.ts` present |
| Commission (structural repair) | MERGED | PR #12 merged. `UNIQUE(agency_id, id)` added on `commissions`. **No `services/api/src/commissions.ts` handler exists on `origin/main`** — schema only, no API, no calculation logic. |
| Customer Portal (Customer App) | MERGED | PR #14 merged (`feature/customer-app`). `apps/customer/src/customer-portal/` present with `CustomerPortalShell.tsx`; both staff and customer-portal UIs share one Vite app (see ARCH-CUSTOMER-APP-01). |
| Sale | MERGED | PR #13 merged in this integration batch. `services/api/src/sales.ts`, Sale API routes, staff UI pages, tests, and docs are on main after the batch. |
| Commercial Cockpit | MERGED | PR #16 merged in this integration batch. Contains `services/api/src/commercial-cockpit.ts`, `services/api/src/commercial-queries.ts`, `services/api/src/commercial-cockpit-parsers.ts`, migrations `008_commercial_cockpit.sql` and `009_configurable_pipelines.sql`, frontend pages under `apps/customer/src/pages/commercial/`, and real-Postgres security tests. |
| Configurable Pipeline | MERGED | Included in PR #16 via `009_configurable_pipelines.sql`, `services/api/src/pipeline-config.ts`, PipelineAccess enforcement, and `/settings/pipelines` UI. |
| Financial model | DECISION REQUIRED | No financial tables in `schema.prisma`. See `docs/decisions/D4-FINANCIAL-DISCOVERY.md`. |
| Pescador (external offer capture) | DEFERRED | No code anywhere in the repo (verified: no `pescador`, `scraping`, `external-capture` files found). See `docs/decisions/PESCADOR-READINESS.md`. |
| Driver/Guide identity | PLANNED | No dedicated model; Field Operations currently attributes all actions to `User`. See `docs/decisions/D2-DRIVER-GUIDE-DISCOVERY.md`. |
| Booking cancellation | DEFERRED | `cancelled` boolean exists on `Booking`/`ScheduledDeparture`, no cancellation flow/endpoint. See `docs/decisions/D3-BOOKING-CANCELLATION-DISCOVERY.md`. |
| Location/IBGE autocomplete | DEFERRED | No `LocationAutocomplete.tsx` or IBGE-related file found anywhere in the repo (`find . -iname "LocationAutocomplete*"` returns nothing). Any earlier claim that it exists as an unwired component could not be verified and is treated as not present. |
| WhatsApp / Bots | DEFERRED | No code. See `docs/decisions/BOT-QUERY-READINESS.md` for a readiness audit against the (unmerged) `commercial-queries.ts`. |

---

## 4. Domain Notes (grounded in `packages/database/schema.prisma`, `origin/main`)

### 4.1 Customer
Tenant-scoped by `agencyId`; technical identity is `id` (UUID); `cpf`/`email`
unique per agency via partial indexes (not representable in `schema.prisma`,
enforced in SQL — see file header comment, lines 26-34). Soft delete via
`deletedAt`.

### 4.2 Wish → Offer → Proposal → Sale → Trip
`Wish.status`: ACTIVE, MATCHED, PROPOSED, FULFILLED, EXPIRED, CANCELLED
(schema + CRUD only, no automated transitions).
`Offer.status`: ACTIVE, INACTIVE, EXPIRED — `validUntil` expiry is computed
at read time in application code, not persisted (per prior ADR-004 notes;
not independently re-verified line-by-line in this pass).
`Proposal.status`: DRAFT, SENT, ACCEPTED, DECLINED, EXPIRED, CANCELLED —
**field exists in schema, but no accept/decline transition logic was found
in `services/api/src/proposals.ts` or `services/api/src/customer-portal.ts`
in this pass.** This is a real gap, tracked in the findings registry.
`Sale.status`: PENDING, CONFIRMED, PAID, CANCELLED, REFUNDED — defined only
on the unmerged `feature/sale-vertical` branch's use of the schema; the
`SaleStatus` enum itself is present in `packages/database/schema.prisma` on
`origin/main` (schema/migration merged ahead of the API vertical), but no
lifecycle transition endpoints exist yet on either `origin/main` or the
open PR.

### 4.3 Transportation
`Route` → `RoutePoint` → `TransportProduct` → `ScheduledDeparture` →
`TransportOperation` → `OperationCheckpoint`. Capacity is a hard limit
(`CHECK (capacity >= 0)`), enforced with `SELECT ... FOR UPDATE` in booking
creation (`services/api/src/bookings.ts`) — no overbooking path exists.

### 4.4 Booking
`Booking` (with `BookingPassenger`) is deliberately separate from `Sale`
(ADR-004) — no pricing fields, only operational reservation data. Round-trip
bookings reference two `ScheduledDeparture` rows belonging to the same
`TransportProduct`. `cancelled` boolean exists on both `Booking` and
`ScheduledDeparture`, but only `createBooking`/`getBookingById`/
`listBookings` are implemented — no cancel action, no capacity-release path.

### 4.5 Commission
`Commission` has a `saleId`, `brokerId`/`userId` (nullable), `amount`,
`percentage`, `status` (PENDING/PAID/CANCELLED). PR #12 repaired
`UNIQUE(agencyId, id)` for composite-FK compatibility. No calculation logic,
no API handler exists on `origin/main`.

---

## 5. Non-Goals / Not Ready (unchanged categories, re-verified)

| Capability | Status |
|------------|--------|
| Payment provider integration | DEFERRED |
| GPS tracking | DEFERRED — no location capture beyond a free-text `location` field on `OperationCheckpoint` |
| WhatsApp integration | DEFERRED |
| Pescador production crawler | DEFERRED |
| Financial accounting | DECISION REQUIRED |
| Booking cancellation flow | DEFERRED |
| Proposal accept/decline | DEFERRED (real code gap, not just unbuilt UI) |
| Sale/Payment lifecycle | DEFERRED — pending merge of `feature/sale-vertical` (PR #13) plus lifecycle design |

---

## 6. References

| Documento | Caminho |
|-----------|---------|
| Architectural Findings Registry | `docs/adr/ARCHITECTURAL-FINDINGS-REGISTRY.md` |
| ARCH-CUSTOMER-APP-01 | `docs/adr/ARCH-CUSTOMER-APP-01-findings.md` |
| D2 Driver/Guide Discovery | `docs/decisions/D2-DRIVER-GUIDE-DISCOVERY.md` |
| D3 Booking Cancellation Discovery | `docs/decisions/D3-BOOKING-CANCELLATION-DISCOVERY.md` |
| D4 Financial Discovery | `docs/decisions/D4-FINANCIAL-DISCOVERY.md` |
| Bot Query Readiness | `docs/decisions/BOT-QUERY-READINESS.md` |
| Pescador Readiness | `docs/decisions/PESCADOR-READINESS.md` |
| ADR-004 (Domain Model) | `docs/adr/ADR-004-domain-modeling-wish-customer-sale-booking.md` |
| ADR-005 (Schema Source of Truth) | `docs/adr/ADR-005-database-schema-source-of-truth.md` |
| Schema (derived) | `packages/database/schema.prisma` |
| Migrations (source of truth) | `infrastructure/migrations/` |
