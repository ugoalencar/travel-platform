# Travel Platform - Demo Quick Start

## Overview

This guide will get you started with the Travel Platform demo in 5 minutes. The demo runs entirely locally with no cloud dependencies.

## Prerequisites

- **Node.js**: v24+ (check: `node --version`)
- **npm**: v11+ (check: `npm --version`)
- **Docker**: Latest version (check: `docker --version`)
- **Git**: Latest version (check: `git --version`)

## Local Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Travel Platform Demo                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Browser (Your Machine)                                        │
│  ├─ http://localhost:5173   (Agency Portal)                   │
│  └─ http://localhost:5174   (Customer Portal)                 │
│         ↓ proxy & auth headers                                 │
│  ├────────────────────────────────────────────────────────────┤
│  │ Node.js Process (Vite Dev Server + API Proxy)              │
│  └────────────────────────────────────────────────────────────┘
│         ↓ HTTP                                                  │
│  ┌─ http://127.0.0.1:4000 (Fastify API)                      │
│  │  - Authentication (dev mode: injected via headers)         │
│  │  - Business logic                                          │
│  │  - Database connection                                     │
│  └────────────────────────────────────────────────────────────┘
│         ↓ PostgreSQL                                           │
│  ┌─ Docker Container                                          │
│  │  postgres:15 @ 127.0.0.1:55432                             │
│  │  (RLS + Multi-tenant isolation)                            │
│  └────────────────────────────────────────────────────────────┘
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 5-Minute Setup

### 1. Clone & Install Dependencies

```bash
# Clone the repository (or navigate to existing clone)
cd /path/to/travel-platform

# Install all dependencies
npm install
```

### 2. Start the Demo

```bash
# Single command starts everything:
npm run demo
```

**What happens automatically:**
1. ✅ Verifies you're in development mode (not production)
2. ✅ Spins up PostgreSQL container (if not running)
3. ✅ Applies all database migrations
4. ✅ Seeds realistic demo data
5. ✅ Starts API server (port 4000)
6. ✅ Starts Agency Portal (port 5173)
7. ✅ Starts Customer Portal (port 5174)

### 3. Open in Browser

**Agency Portal (Staff View):**
- URL: http://localhost:5173
- Identity: Demo Admin (User A)
- Agency: Agency A (Demo)
- Role: ADMIN

**Customer Portal (Traveler View):**
- URL: http://localhost:5174
- Identity: Cliente Demo
- Agency: Agency A (Demo)

### 4. Walk Through the Demo

See `PRESENTATION_SCRIPT.md` for the full 10-15 minute flow.

### 5. Stop Everything

Press `Ctrl+C` in the terminal where you ran `npm run demo`.

## Demo Identities

### Agency Portal (Default)

| Field | Value |
|-------|-------|
| **User ID** | `11000000-0000-4000-8000-000000000001` |
| **Agency ID** | `10000000-0000-4000-8000-000000000001` |
| **Role** | ADMIN |
| **Name** | Demo Admin |
| **Email** | user-a@example.test |
| **Agency** | Agency A (Demo) |

> Note: Dev auth is header-based, not username/password. The Vite proxy automatically injects headers.

### Customer Portal (Default)

| Field | Value |
|-------|-------|
| **Customer ID** | `31000000-0000-4000-8000-000000000001` |
| **Agency ID** | `10000000-0000-4000-8000-000000000001` |
| **Name** | Cliente Demo |
| **Email** | cliente-demo-agency-a-demo@example.test |

## Demo Data

The database is seeded with realistic fictional data:

- **2 Agencies** (Agency A, Agency B)
- **2 Staff Users** (one per agency)
- **1 Primary Customer** per agency (Cliente Demo)
- **4 Commercial Cockpit Scenarios** (Cancún, Gramado, Buzios, Porto de Galinhas)
- **Trips, Wishes, Proposals, Bookings**
- **Transportation (Bus routes & schedules)**
- **Sales, Receivables, Expenses**
- **Pipelines** (Comercial, Pós-venda, Terrestre, Internacional)
- **External Offers** (mock Pescador captures)

All data is 100% fictional and demo-only.

## Reset Demo Data

If you want a fresh start (e.g., after testing changes):

```bash
# Stop the services (Ctrl+C if running)

# Reset demo database to pristine state
npm run demo:reset

# Restart services
npm run demo
```

## Troubleshooting

### Port Already in Use

**Error:** `EADDRINUSE: address already in use :::5173`

**Solution:**
```bash
# Kill existing processes
# On macOS/Linux:
lsof -i :5173 | grep LISTEN | awk '{print $2}' | xargs kill -9

# On Windows (PowerShell):
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Stop-Process -Force

# Then restart
npm run demo
```

### Database Container Won't Start

**Error:** Docker container fails to start

**Solution:**
```bash
# Check Docker is running
docker ps

# Clean up old containers
docker-compose -f infrastructure/docker-compose.local-postgres.yml down -v

# Restart demo
npm run demo
```

### PostgreSQL Connection Failed

**Error:** `connect ECONNREFUSED 127.0.0.1:55432`

**Solution:**
```bash
# Verify Docker container is running
docker ps | grep postgres

# Manually start PostgreSQL
npm run dev:db --prefix services/api

# Then in another terminal:
npm run demo
```

### API Not Responding

**Error:** 502 Bad Gateway or `API_URL` errors in browser

**Solution:**
1. Check API server is running in the terminal
2. Verify port 4000 is not blocked
3. Check .env.local exists with correct DATABASE_URL
4. Restart everything: stop (Ctrl+C), then `npm run demo`

## Development Workflow

### Make Changes, Keep Demo Running

The dev servers support hot reload:

- **Frontend changes** (React): Auto-reload in browser
- **Backend changes** (Node.js): Restart required (stop & `npm run demo`)

### Check Health

```bash
# Quick health check
curl http://127.0.0.1:4000/health

# Should return: {"status":"ok"}
```

### View Logs

All services log to the terminal. Look for:

- **[dev-server]**: Vite logs
- **[Fastify]**: API logs
- **[DEV-AUTH]**: Auth header injection logs
- **Error traces**: Show in red

## Production Deployment

The demo configuration is **NOT** for production:
- Dev-only authentication (no passwords)
- Local PostgreSQL (not managed database)
- Hot-reload enabled
- Debug logging
- CORS permissive

See `docs/deployment/` for production setup.

## Performance Notes

- **Initial start**: ~30-45 seconds (migrations, seeding, server startup)
- **Migrations**: ~10-15 seconds (applies 24 migrations)
- **Seeding**: ~5-10 seconds (realistic demo data)
- **Hot reload**: <500ms (React changes)

## Documentation

For more details, see:

- **Presentation Flow**: `docs/demo/PRESENTATION_SCRIPT.md`
- **Troubleshooting**: `docs/demo/DEMO_FAILSAFE.md`
- **Architecture**: `docs/01-architecture/`
- **API**: `docs/05-api/`
- **Database**: `docs/04-database/`

## Questions?

All demo infrastructure is defined in:
- `scripts/demo-orchestrate.cjs` - Orchestration
- `scripts/demo-reset.cjs` - Data reset
- `scripts/seed-demo-data.cjs` - Demo data
- `infrastructure/docker-compose.local-postgres.yml` - PostgreSQL container
- `infrastructure/migrations/*.sql` - Database schema
