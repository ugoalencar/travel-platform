# Travel Platform Demo Documentation

Welcome to the Travel Platform presentation-ready demo. This directory contains everything you need to prepare for and deliver a successful live demonstration.

## Documents

### Quick Start (5 minutes)
📖 **[QUICK_START.md](./QUICK_START.md)**
- Prerequisites
- Installation & setup
- Starting the demo
- Demo identities & credentials
- Troubleshooting basics

### Presentation Script (10-15 minutes)
📖 **[PRESENTATION_SCRIPT.md](./PRESENTATION_SCRIPT.md)**
- Full demonstration flow (11 segments)
- Talking points for each section
- Q&A preparation
- Timing reference
- Backup demos for extra time

### Demo Failsafe & Troubleshooting
📖 **[DEMO_FAILSAFE.md](./DEMO_FAILSAFE.md)**
- Pre-demo health check (60 seconds)
- 10 common issues with solutions
- Preventive measures
- Fallback strategies for live emergencies
- Advanced debugging

## Quick Commands

```bash
# Install dependencies (one-time)
npm install

# Start the complete demo (everything at once)
npm run demo

# Reset demo data to pristine state
npm run demo:reset

# Stop services (Ctrl+C in terminal)
```

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Browser                             │
│  Agency Portal (5173) | Customer Portal (5174)              │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTP + Dev-Auth Headers
                   ↓
┌──────────────────────────────────────────────────────────────┐
│         Node.js Dev Servers (Vite + Proxies)                │
│    Hot-reload, dev-auth injection, API proxy config         │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTP
                   ↓
┌──────────────────────────────────────────────────────────────┐
│  Fastify API (port 4000)                                     │
│  - Authentication & authorization                            │
│  - Business logic (customers, trips, proposals, etc.)        │
│  - Row-Level Security (RLS) enforced per tenant              │
└──────────────────┬──────────────────────────────────────────┘
                   │ PostgreSQL Driver
                   ↓
┌──────────────────────────────────────────────────────────────┐
│  PostgreSQL (Docker, port 55432)                             │
│  - Multi-tenant data isolation via RLS                       │
│  - Demo data (agencies, customers, trips, sales, etc.)       │
└──────────────────────────────────────────────────────────────┘
```

## Demo Identities

### Agency Portal (Staff)
- **URL**: http://localhost:5173
- **User**: Demo Admin (User A)
- **Agency**: Agency A (Demo)
- **Role**: ADMIN
- **Auth**: Dev-mode header injection (no password)

### Customer Portal (Traveler)
- **URL**: http://localhost:5174
- **Customer**: Cliente Demo
- **Agency**: Agency A (Demo)
- **Auth**: Dev-mode header injection (no login)

## Demo Data

All data is realistic but **100% fictional**:
- 2 Agencies
- 2 Staff Users (one per agency)
- Multiple Customers per agency
- 4 Commercial Cockpit Scenarios (Cancún, Gramado, Buzios, Porto de Galinhas)
- Trips, Wishes, Proposals, Bookings
- Transportation routes & departures
- Sales, Receivables, Expenses
- Custom pipelines (Comercial, Pós-venda, Terrestre, Internacional)
- External offer captures (mock Pescador)

## Preparation Checklist

### 1 Hour Before Demo
- [ ] Run `npm run demo:reset`
- [ ] Verify all services start: `npm run demo`
- [ ] Check both portals load (5173 and 5174)
- [ ] Verify demo data is visible
- [ ] No console errors (F12)

### 30 Minutes Before
- [ ] Review PRESENTATION_SCRIPT.md
- [ ] Mentally walk through each segment
- [ ] Identify which demo scenario to highlight

### 15 Minutes Before
- [ ] Open both portals in browser tabs
- [ ] Click through a few pages to "warm up"
- [ ] Check browser zoom is 100%
- [ ] Close unnecessary browser tabs & windows

### 5 Minutes Before
- [ ] Terminal minimized or hidden
- [ ] Phone on silent
- [ ] Camera/projection positioned
- [ ] Script printout or notes visible
- [ ] Ready to start!

## During Presentation

### Helpful Hotkeys

| Action | Hotkey |
|--------|--------|
| Reload page | F5 |
| Hard refresh | Ctrl+Shift+R |
| Browser DevTools | F12 |
| Zoom in | Ctrl+Plus |
| Zoom out | Ctrl+Minus |
| Zoom reset | Ctrl+0 |
| Toggle fullscreen | F11 |

### Common Phrases

- **If something lags**: "Let me refresh that..." (F5)
- **If data missing**: "Let me check the current state..." (click around)
- **If API fails**: "The demo sometimes needs a moment..." (wait 5 seconds)
- **If unsure about timing**: "Let me show you this instead..." (switch section)

## After Demo

- [ ] Save browser history (interesting clicks/interactions)
- [ ] Note audience questions for product team
- [ ] Run `npm run demo:reset` to clean up
- [ ] Update PRESENTATION_SCRIPT.md with lessons learned

## File Organization

```
docs/demo/
├── README.md                      ← You are here
├── QUICK_START.md                 ← Installation & setup
├── PRESENTATION_SCRIPT.md         ← Full demo walkthrough
└── DEMO_FAILSAFE.md              ← Emergency procedures

scripts/
├── demo-orchestrate.cjs           ← Starts all services
├── demo-reset.cjs                 ← Resets database
├── seed-demo-data.cjs             ← Creates demo data
└── apply-all-migrations.cjs       ← Database migrations

infrastructure/
├── docker-compose.local-postgres.yml   ← PostgreSQL container
└── migrations/                         ← SQL migration files
    ├── 001_initial_schema.sql
    ├── 002_rls_policies.sql
    ├── ... (22 more)
    └── 024_extended_financial_module.sql
```

## Key Concepts for Q&A

### Multi-Tenancy & Security
> "Each agency has completely isolated data via PostgreSQL Row-Level Security. Even if someone tries to hack the API, the database layer enforces tenant isolation."

### Pescador (Offer Capture)
> "Pescador automatically extracts structured data from supplier websites—prices, terms, availability—saving agencies hours of manual data entry."

### Commercial Pipeline
> "This Kanban board manages the entire sales process. Each stage represents a milestone, and the system automatically tracks due dates to ensure nothing slips."

### Customer 360
> "We bring together everything the agency knows about a customer: personal data, documents, trip history, proposals, bookings, and preferences—all in one place."

### Customer Portal
> "Customers see a simple, modern interface focused on their own trips and proposals. They never see financial data, pipelines, or other agency operations."

## Advanced Topics (If Audience is Technical)

### Row-Level Security (RLS)
Show in DevTools (F12 → Network):
- Every API request includes tenant context
- Backend enforces authorization twice: app layer + database layer
- PostgreSQL RLS prevents cross-tenant leakage even with app bugs

### Custom Pipelines
"Agencies have different workflows. Our pipeline system lets each team define their own stages and rules."

### Document Verification
"We're building OCR and automated document verification. Currently the system tracks document types, expiry dates, and verification status."

### Extensibility
"The API is RESTful and fully documented. Agencies can integrate with their own suppliers, CRMs, and accounting systems via webhooks."

## Resources

- **API Documentation**: `docs/05-api/`
- **Database Schema**: `docs/04-database/`
- **Architecture Guide**: `docs/01-architecture/`
- **Security Model**: `docs/03-security/`
- **Testing Guide**: `docs/07-testing/`

## Support

If you need help:

1. Check **QUICK_START.md** for setup issues
2. Check **DEMO_FAILSAFE.md** for troubleshooting
3. Check **PRESENTATION_SCRIPT.md** for demo flow
4. Check logs in running terminal
5. Run `npm run demo:reset` for a fresh start

Last resort: `bash scripts/recovery.sh` (complete clean reset)

---

**Good luck with your presentation! 🚀**
