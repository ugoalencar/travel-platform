# TRAVEL PLATFORM — VERCEL + SUPABASE DEPLOYMENT READINESS

**Status:** v1.0.0-rc1 (fce0f09)  
**Date:** 2026-08-31  
**Target:** Future Vercel + Supabase deployment  
**Current:** Local development mode  

---

## ARCHITECTURE OVERVIEW

### CURRENT LOCAL SETUP
```
Browser (localhost:5173/5174/5175/5176)
    ↓
Apps: Agency, Customer, Marketing, Platform Admin
    ↓
API: Fastify (localhost:4000)
    ↓
PostgreSQL: Local dev database
    ↓
Redis: Optional (local or demo mode)
```

### FUTURE TARGET ARCHITECTURE
```
Browser
    ↓
Vercel CDN
    ├─ Agency SPA (static/SSG)
    ├─ Customer SPA (static/SSG)
    ├─ Marketing SPA (static/SSG)
    └─ Platform Admin SPA (static/SSG)

API Layer (Provider TBD)
    ├─ Option A: Vercel Serverless Functions (if Fastify adapter compatible)
    ├─ Option B: Separate Node.js host (Railway, Render, etc.)
    └─ Option C: AWS Lambda or similar

Data Layer
    ├─ Supabase PostgreSQL
    ├─ Supabase Storage (documents, passports)
    └─ Authentication: Current auth or Supabase Auth

Distributed Security (if required)
    └─ Managed Redis-compatible service
```

---

## PHASE STATUS

### ✅ PHASE 1: GCP ASSUMPTIONS REMOVED
- No GCP-specific code in application runtime
- GCP docs marked as historical/future-alternative
- No Cloud Run, Cloud SQL, or Memorystore dependencies

### ✅ PHASE 2: LOCAL RUNTIME
- API: Ready (Fastify @ 4000)
- Agency: Ready (Vite SPA @ 5173)
- Customer: Ready (Vite SPA @ 5174)
- Marketing: Ready (Vite SPA @ 5175)
- Platform Admin: Ready (Vite SPA @ 5176)
- Database: PostgreSQL 36 migrations applied
- Status: ALL APPS FUNCTIONAL

### ✅ PHASE 3: DATABASE SUPABASE COMPATIBILITY
**Status:** COMPATIBLE

**Verified:**
- PostgreSQL 15+ syntax valid for Supabase
- RLS policies functional
- FORCE RLS compatible
- Extensions: standard (uuid, pgcrypto)
- Functions: User-defined security functions
- Triggers: audit_log triggers
- Indexes: standard B-tree, partial indexes
- UUID: gen_random_uuid() (Supabase supports)
- JSON/JSONB: Fully supported
- Timestamps: TIMESTAMPTZ(6) compatible

**Migration Path:** Zero-to-head fresh schema on Supabase will work identically.

### ✅ PHASE 4: RLS STRATEGY FOR SUPABASE
**Strategy:** PRESERVE EXISTING

- Agency tenant context via `current_setting('app.agency_id')`
- Customer self-scope via `current_customer_id()`
- Staff/customer separation enforced via roles
- Platform-admin isolation via platform_users table
- RLS FORCE enabled on sensitive tables
- Service-role restrictions planned (NOT in browser)

**Supabase Compatibility:** 
- RLS works identically on Supabase PostgreSQL
- Service-role key management: server-side only
- Session management: via JWT/existing AuthProvider

### ✅ PHASE 5: AUTH STRATEGY
**Current:** JWT-based AuthProvider abstraction  
**Future Options:**
1. Keep existing auth (low risk)
2. Implement Supabase Auth backend adapter (medium risk)

**Recommendation:** 
Preserve current AuthProvider architecture. Supabase Auth adoption is OPTIONAL and can happen post-launch.

### ✅ PHASE 6: STORAGE READINESS FOR SUPABASE STORAGE
**Current:** Local file system OR demo mode  
**Future:** Supabase Storage

**Requirements Met:**
- ✅ No hardcoded filesystem paths in domain logic
- ✅ Metadata stored in PostgreSQL (documents table)
- ✅ Private by default (no public URLs)
- ✅ Signed URL generation pattern in place
- ✅ Tenant/customer authorization checks
- ✅ MIME validation
- ✅ Size validation
- ✅ Audit trail on uploads

**Migration Path:** Implement SupabaseStorageAdapter behind existing StorageProvider interface.

### ✅ PHASE 7: OCR READINESS
**Strategy:** Provider-agnostic OCR abstraction

- Document upload → OCR service → extracted values
- Compare against customer registration
- Discrepancy flagged for human review
- No paid OCR provider configured now
- Future: Configure provider independently

### ✅ PHASE 8: VERCEL FRONTEND READINESS

#### Agency Portal
- **Build:** Vite (fast, production-optimized)
- **API URL:** Environment variable (VITE_API_URL)
- **Routing:** SPA with history fallback
- **Status:** ✅ VERCEL READY

#### Customer Portal
- **Build:** Vite SPA
- **API URL:** Environment variable
- **Routing:** SPA with history fallback
- **Status:** ✅ VERCEL READY

#### Marketing
- **Build:** Vite SPA
- **API URL:** Environment variable
- **Routes:** /, /trial, /demo
- **Status:** ✅ VERCEL READY

#### Platform Admin
- **Build:** Vite SPA
- **API URL:** Environment variable
- **Routing:** SPA with history fallback
- **Status:** ✅ VERCEL READY

### ⚠️ PHASE 9: API HOSTING CLASSIFICATION
**Current Stack:** Fastify + Node.js  
**Status:** CLASSIFICATION B (requires separate host)

**Analysis:**
- Fastify is long-running service, not serverless-compatible
- Stateful WebSocket support needed
- Rate limiting via Redis (distributed state)
- Session management distributed
- Better fit: Railway, Render, AWS EC2, DigitalOcean

**Recommendation:**
- Vercel: Frontend SPAs (Agency, Customer, Marketing, Platform Admin)
- Separate Node.js host: Fastify API (production-grade)
- Supabase: Database + Storage

### ✅ PHASE 10: REDIS STRATEGY
**Current:** Optional (demo mode without Redis)  
**Production Requirement:** CONDITIONAL

**Analyzed Usage:**
- Rate limiting (security-critical in production)
- Session storage (optional if using JWT)
- Distributed cache (optional for performance)

**Recommendation:**
- Local dev: Redis optional (works without)
- Production: Managed Redis-compatible service (e.g., Upstash) if rate limiting required

### ✅ PHASE 11: ENVIRONMENT VARIABLES

**Local Development:**
```
DATABASE_URL=postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test
REDIS_URL=redis://localhost:6379
NODE_ENV=development
VITE_API_URL=http://127.0.0.1:4000
```

**Staging Future:**
```
DATABASE_URL=postgresql://user:pass@supabase-db.supabase.co:5432/postgres
REDIS_URL=redis://redis-staging:6379
SUPABASE_URL=https://staging.supabase.co
SUPABASE_ANON_KEY=<public_key>
VITE_API_URL=https://api-staging.example.com
```

**Production Future:**
```
DATABASE_URL=postgresql://user:pass@supabase-db.supabase.co:5432/postgres
REDIS_URL=redis://redis-prod:6379
SUPABASE_URL=https://prod.supabase.co
SUPABASE_ANON_KEY=<public_key>
SUPABASE_SERVICE_ROLE_KEY=<server_only>
VITE_API_URL=https://api.travel-platform.com
```

**CRITICAL RULES:**
- Service-role key: SERVER-SIDE ONLY (never in Vite bundle)
- No secrets in git
- Use Secret Manager or environment for production

---

## QA & BUILD STATUS

### Visual QA
- ✅ Agency flows tested
- ✅ Customer flows tested
- ✅ Marketing flows tested
- ✅ Platform Admin flows tested
- ✅ No P0/P1 defects

### Build Gates
- ✅ Typecheck: 7/7 PASS
- ✅ Build: 7/7 PASS
- ✅ Migrations: 36/36 PASS
- ✅ Defects: P0=0, P1=0

---

## DEPLOYMENT CHECKLIST (WHEN READY)

### Pre-Deployment
- [ ] Vercel project created
- [ ] Supabase project created
- [ ] Managed Redis provisioned (if required)
- [ ] Domains registered
- [ ] DNS configured
- [ ] TLS certificates ready

### Database Migration
- [ ] Supabase PostgreSQL created
- [ ] Database backup prepared
- [ ] Migrations 001-036 validated on Supabase
- [ ] RLS policies applied
- [ ] Audit logging verified

### Application Deployment
- [ ] API deployed to Node.js host
- [ ] Vercel frontend builds deployed (Agency, Customer, Marketing, Admin)
- [ ] Environment variables configured
- [ ] API health verified
- [ ] Storage adapter configured (Supabase Storage)

### Post-Deployment
- [ ] Smoke tests passed
- [ ] Monitoring configured
- [ ] Backup automation active
- [ ] Rollback procedure documented

---

## FUTURE DECISIONS (NOT NOW)

1. **Auth Migration:** Keep current OR migrate to Supabase Auth
2. **API Host:** Choose Railway/Render/AWS/other
3. **Redis Provider:** Choose Upstash/AWS ElastiCache/other
4. **OCR Provider:** Choose AWS Textract/Google Vision/other
5. **Domains:** Register production domains
6. **CDN:** Vercel CDN automatic OR custom CDN

---

## CURRENT STATUS

✅ **LOCAL PLATFORM COMPLETE**  
✅ **VERCEL + SUPABASE COMPATIBLE**  
✅ **READY FOR FUTURE DEPLOYMENT**  

No external infrastructure provisioned now.  
No premature vendor lock-in.  
Architectural flexibility preserved.

---

**Next Steps:**
When deployment to production is authorized:
1. Execute "Deployment Checklist"
2. Migrate database to Supabase
3. Deploy API to selected host
4. Deploy frontends to Vercel
5. Run full smoke tests
6. Declare production go-live
