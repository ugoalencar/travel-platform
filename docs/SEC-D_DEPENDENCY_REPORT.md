# SEC-D — DEPENDENCY REPORT FOR SEC-AUTH

**Status:** BLOCKED ON SEC-AUTH
**Author:** Security Wave 2 Agent
**Date:** 2026-08-27
**Base SHA:** efb377cc5741e3acafcd26f589d83529108003bf

---

## Executive Summary

SEC-D (MFA for Privileged Users) cannot proceed because the repository has **no production-capable authentication implementation**. MFA is layer 6 of a 6-layer dependency chain that must be built first. This report documents the existing abstractions, current behavior, missing components, and integration points required by future MFA.

---

## 1. Existing AuthProvider Abstraction

**File:** `services/api/src/auth.ts` (lines 1-49)

```typescript
export interface AuthenticatedPrincipal {
  userId: string;
  agencyId: string;
  role: UserRole;
  email: string;
}

export interface AuthProvider {
  authenticate(request: { headers: IncomingHttpHeaders }): Promise<AuthenticatedPrincipal | null>;
}
```

**Current usage:**
- `createAuthenticateHook(authProvider)` returns a Fastify `onRequest` hook
- Sets `request.auth` with `{ sub, agency_id, role, email }` on success
- Returns `UnauthorizedError` on null
- Applied to all protected routes via `protectedHooks` array

**Key insight:** The AuthProvider interface is clean and extensible. A production implementation can be added without changing this interface.

---

## 2. Current Dev-Auth Behavior

**File:** `services/api/src/dev-auth.ts` (lines 1-171)

**Mechanism:**
- Reads `x-dev-user-id`, `x-dev-agency-id`, `x-dev-role` headers
- Validates against hardcoded allowlist of 2 principals
- Only active when `ALLOW_DEV_AUTH=true` AND `NODE_ENV !== 'production'`
- No password verification, no JWT, no session

**Production behavior:**
- When `ALLOW_DEV_AUTH` is not set or `NODE_ENV=production`, `authenticate()` returns `null`
- **All requests get 401 Unauthorized** in production
- The entire API is non-functional without the dev bypass

**Customer portal dev-auth:**
- Separate header scheme (`x-dev-customer`)
- Separate `CustomerAuthProvider` interface
- Same dual-gate (`ALLOW_DEV_AUTH` + `NODE_ENV`)

---

## 3. Staff Identity Persistence

**Prisma Schema:** `packages/database/schema.prisma` (lines 99-139)

```prisma
model User {
  id           String       @id @default(dbgenerated("(gen_random_uuid())::text"))
  agencyId     String       @map("agency_id")
  email        String
  name         String
  role         UserRole
  passwordHash String       @map("password_hash")
  status       Status       @default(ACTIVE)
  lastLoginAt  DateTime?    @map("last_login_at")
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @default(now()) @updatedAt
  // ... relations
  @@unique([agencyId, email])
  @@unique([agencyId, id])
}
```

**UserRole enum:** `OWNER | ADMIN | MANAGER | AGENT | VIEWER`

**Key observations:**
- `passwordHash` field exists but is populated with literal `'demo-only-hash'` in seed scripts
- No argon2/bcrypt library in `package.json`
- No password hashing/verification code anywhere in the codebase
- `lastLoginAt` field exists but is never written to

---

## 4. Customer Authentication Path

**File:** `services/api/src/customer-auth.ts` (lines 1-50)

```typescript
export interface AuthenticatedCustomer {
  agencyId: string;
  customerId: string;
}

export interface CustomerAuthProvider {
  authenticateCustomer(request: { headers: IncomingHttpHeaders }): Promise<AuthenticatedCustomer | null>;
}
```

**Current behavior:**
- Separate from staff auth (different interface, different hooks)
- Dev-only: reads `x-dev-customer` header
- Production: returns null (all requests get 401)
- Customer portal routes use `customerHooks` array (separate from `protectedHooks`)

---

## 5. Current Session/Token Model

**Status: NOT IMPLEMENTED**

**Evidence:**
- `.env.example` contains forward-looking placeholders:
  - `JWT_SECRET=replace-with-a-long-random-secret`
  - `JWT_EXPIRES_IN=15m`
  - `COOKIE_NAME=travel_platform_session`
  - `COOKIE_SECURE=false`
  - `COOKIE_SAME_SITE=strict`
- `env.ts` explicitly states these are "forward-looking placeholders in .env.example for unbuilt features"
- `@fastify/cookie` is in root `package.json` but unused (no `setCookie`/`getCookie` calls)
- No JWT sign/verify code exists
- No session store exists
- Frontend `api.ts` makes plain `fetch()` with NO `credentials: 'include'`

**ADR-003** (`docs/adr/ADR-003-authentication.md`) documents the accepted decision:
- JWT with httpOnly cookies
- 15-minute expiration
- Automatic renewal on request
- **NOT YET IMPLEMENTED**

---

## 6. Missing Production Components

| Component | Status | Required By |
|---|---|---|
| Password hashing (argon2) | NOT IMPLEMENTED | Login |
| JWT sign/verify | NOT IMPLEMENTED | Session management |
| httpOnly cookie handling | NOT IMPLEMENTED | Session management |
| Login endpoint (`/auth/login`) | NOT IMPLEMENTED | Frontend auth |
| Logout endpoint (`/auth/logout`) | NOT IMPLEMENTED | Frontend auth |
| Session refresh (`/auth/me`) | NOT IMPLEMENTED | Frontend auth |
| Frontend login page | NOT IMPLEMENTED | User interaction |
| Auth context/provider | NOT IMPLEMENTED | Frontend state |
| Protected route wrapper | NOT IMPLEMENTED | Frontend routing |
| Production AuthProvider | NOT IMPLEMENTED | All protected routes |

---

## 7. Files/Interfaces SEC-AUTH Would Need to Touch

### New Files Required:
| File | Purpose |
|---|---|
| `services/api/src/jwt.ts` | JWT sign/verify service |
| `services/api/src/prod-auth.ts` | Production AuthProvider (JWT + cookie) |
| `services/api/src/auth-routes.ts` | Login/logout/me endpoints |
| `apps/customer/src/contexts/AuthContext.tsx` | Frontend auth state |
| `apps/customer/src/pages/LoginPage.tsx` | Login page |
| `apps/customer/src/components/ProtectedRoute.tsx` | Route guard |

### Modified Files Required:
| File | Change |
|---|---|
| `services/api/src/app.ts` | Register auth routes, cookie plugin |
| `services/api/src/server.ts` | Wire ProdAuthProvider |
| `services/api/src/env.ts` | Read JWT_SECRET, COOKIE_* env vars |
| `services/api/package.json` | Add argon2, @fastify/jwt dependencies |
| `apps/customer/src/App.tsx` | Wrap with AuthProvider, add protected routes |
| `apps/customer/src/lib/api.ts` | Add `credentials: 'include'` to fetch |

### Dependencies Required:
```json
{
  "argon2": "^0.41.0",
  "@fastify/jwt": "^9.0.0",
  "@fastify/cookie": "^11.0.0"
}
```

---

## 8. Tenant/RBAC Semantics Preservation

**Current architecture:**
1. AuthProvider returns `AuthenticatedPrincipal` with `userId`, `agencyId`, `role`, `email`
2. `createTenantContextHook` validates user belongs to agency (DB query)
3. Stores context in `AsyncLocalStorage` via `establishTenantContext()`
4. `requireRole()` checks role hierarchy
5. `withTenantTransaction()` calls `set_tenant_context(agency_id, user_id)` for PostgreSQL RLS

**SEC-AUTH must preserve:**
- AuthProvider interface (returns same shape)
- TenantContext establishment (same validation)
- Role hierarchy enforcement (OWNER > ADMIN > MANAGER > AGENT > VIEWER)
- PostgreSQL RLS via `set_tenant_context()`
- Customer portal separation (separate hooks, separate provider)

**No changes allowed to:**
- Role hierarchy
- RLS architecture
- FORCE RLS guarantees
- Customer self-scoping
- Tenant ownership model

---

## 9. Migration Requirements

**Database migrations needed:**
1. **Password hashing:** No migration needed (existing `password_hash` field will be populated with real hashes)
2. **JWT secrets:** No migration needed (env vars)
3. **Session tokens:** No migration needed (httpOnly cookie, stateless JWT)
4. **MFA fields (future):** Will require migration (deferred to SEC-D)

**Existing migration patterns:**
- Additive only, no destructive changes
- RLS enabled for tenant-scoped tables
- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
- Runtime role gets INSERT/SELECT, no UPDATE/DELETE

---

## 10. Integration Points Required by Future MFA

**MFA will need:**
1. **AuthProvider extension:** Check MFA status after primary auth
2. **Pre-auth challenge token:** Short-lived token between primary auth and MFA verification
3. **MFA verification endpoint:** `/auth/mfa/verify` with TOTP/recovery code
4. **MFA enrollment endpoints:** `/auth/mfa/enroll`, `/auth/mfa/confirm`, `/auth/mfa/recovery-codes`
5. **Session step-up:** Final session only issued after MFA completion
6. **MFA status field:** On User model (mfaEnabled, mfaSecret, etc.)
7. **Recovery codes table:** New tenant-scoped table

**SEC-AUTH should design for MFA integration by:**
- Keeping AuthProvider interface extensible
- Supporting pre-auth challenge tokens
- Designing session model that can be step-up'd
- Documenting extension points

---

## 11. Recommended Implementation Order

1. **Phase 1: Password Hashing** (no external dependencies)
   - Add argon2 dependency
   - Create password utility functions
   - Update seed scripts to use real hashes

2. **Phase 2: JWT + Cookie Auth** (depends on Phase 1)
   - Add @fastify/jwt, @fastify/cookie
   - Create JWT service
   - Create production AuthProvider
   - Wire into Fastify

3. **Phase 3: Login Endpoints** (depends on Phase 2)
   - POST /auth/login
   - POST /auth/logout
   - GET /auth/me

4. **Phase 4: Frontend Auth** (depends on Phase 3)
   - Login page
   - Auth context
   - Protected routes
   - Token refresh

5. **Phase 5: MFA** (depends on Phase 4, separate stream)
   - TOTP enrollment
   - MFA verification
   - Recovery codes
   - Privileged role enforcement

---

## 12. Conclusion

SEC-D (MFA) is correctly blocked. The repository has a clean AuthProvider abstraction but no production implementation. SEC-AUTH must build the authentication foundation before MFA can be added.

**Estimated effort for SEC-AUTH:** 3-5 days
**Estimated effort for SEC-D after SEC-AUTH:** 2-3 days
**Total estimated effort:** 5-8 days

---

**DO NOT IMPLEMENT MFA WITHOUT SEC-AUTH FOUNDATION.**
