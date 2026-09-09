# Travel Platform - Demo Failsafe & Troubleshooting

## Emergency Procedures

Use this guide if something goes wrong during or before a live presentation.

---

## Quick Health Check (60 seconds)

Run this before every demo to verify all systems are green:

```bash
# Check services are running
echo "Checking services..."
curl -s http://127.0.0.1:4000/health && echo "✅ API"
curl -s http://localhost:5173 >/dev/null && echo "✅ Agency Portal"
curl -s http://localhost:5174 >/dev/null && echo "✅ Customer Portal"

# Check database
echo "Checking database..."
psql -h 127.0.0.1 -p 55432 -U travel_test -d travel_platform_test -c "SELECT COUNT(*) FROM agencies;" && echo "✅ Database"
```

---

## Common Issues & Solutions

### 1. "Port Already in Use" ❌

**Symptoms:**
```
EADDRINUSE: address already in use :::5173
```

**Quick Fix (30 seconds):**

**On macOS/Linux:**
```bash
# Kill the process using port 5173
lsof -i :5173 | grep LISTEN | awk '{print $2}' | xargs kill -9
lsof -i :5174 | grep LISTEN | awk '{print $2}' | xargs kill -9
lsof -i :4000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Restart
npm run demo
```

**On Windows (PowerShell):**
```powershell
# Kill processes using ports
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Stop-Process -Force
Get-NetTCPConnection -LocalPort 5174 -ErrorAction SilentlyContinue | Stop-Process -Force
Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue | Stop-Process -Force

# Restart
npm run demo
```

**Alternative:** Start on different ports:
```bash
# Terminal 1: Start API on custom port
PORT=4001 npm run dev --prefix services/api

# Terminal 2: Start Agency Portal on custom port
PORT=5175 npm run dev --prefix apps/agency
# (then manually update vite.config to point to 4001)

# Terminal 3: Start Customer Portal
PORT=5176 npm run dev --prefix apps/customer
```

---

### 2. Database Connection Refused ❌

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:55432
```

**Root Causes & Fixes:**

**A) Docker Not Running**
```bash
# Check if Docker is running
docker ps

# If it fails, start Docker
# macOS: Open Docker Desktop app
# Windows: Open Docker Desktop app
# Linux: sudo systemctl start docker

# Try again
npm run demo
```

**B) PostgreSQL Container Not Started**
```bash
# Check container status
docker ps | grep postgres

# If not running, start it
docker-compose -f infrastructure/docker-compose.local-postgres.yml up -d

# Verify health
docker ps -a

# Then restart demo
npm run demo
```

**C) Container Exists but Won't Start**
```bash
# Clean up and restart
docker-compose -f infrastructure/docker-compose.local-postgres.yml down -v
docker-compose -f infrastructure/docker-compose.local-postgres.yml up -d

# Wait ~10 seconds for health check to pass
sleep 10

# Restart demo
npm run demo
```

**D) Port 55432 Blocked**
```bash
# Check if another PostgreSQL is using it
netstat -tulpn | grep 55432  # Linux
netstat -ano | findstr :55432  # Windows

# Change Docker port in docker-compose.local-postgres.yml:
# Change "127.0.0.1:55432:5432" to "127.0.0.1:55433:5432"
# Update .env.local: DATABASE_URL=postgresql://...@127.0.0.1:55433/...

# Restart
npm run demo
```

---

### 3. API Server Won't Start ❌

**Symptoms:**
```
Failed to start local API build
npm ERR! code 1
```

**Root Causes & Fixes:**

**A) Missing Dependencies**
```bash
npm install
npm run build
npm run dev --prefix services/api
```

**B) TypeScript Build Error**
```bash
# Check for build errors
npm run typecheck --prefix services/api

# Fix errors or skip if non-critical
npm run build --prefix services/api
```

**C) .env.local Missing or Wrong**
```bash
# Verify .env.local exists in project root
cat .env.local

# Should look like:
# DATABASE_URL=postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test
# NODE_ENV=development
# PORT=4000
# HOST=127.0.0.1
# ALLOW_DEV_AUTH=true

# If missing, create it
cat > .env.local << 'EOF'
DATABASE_URL=postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test
NODE_ENV=development
PORT=4000
HOST=127.0.0.1
ALLOW_DEV_AUTH=true
EOF

npm run demo
```

---

### 4. "Page Blank" or "Cannot GET /" ❌

**Symptoms:**
- Agency Portal (5173) is blank
- Shows "Cannot GET /"
- No error in terminal

**Root Cause:** Vite dev server crashed

**Quick Fix:**

```bash
# Stop (Ctrl+C)

# Clear Vite cache
rm -rf apps/agency/.vite apps/agency/dist
rm -rf apps/customer/.vite apps/customer/dist

# Restart
npm run demo
```

---

### 5. "Vite Error: Cannot Find Module" ❌

**Symptoms:**
```
[vite] Error parsing url: Cannot find module
```

**Root Cause:** Dependencies not installed properly

**Quick Fix:**

```bash
# Clean and reinstall
rm -rf node_modules apps/*/node_modules services/*/node_modules
npm install

# Restart
npm run demo
```

---

### 6. API Returns 500 Errors ❌

**Symptoms:**
```
Internal Server Error
Error in /api/customers
```

**Root Causes & Fixes:**

**A) Database Migrations Not Applied**
```bash
# Check if migrations ran
psql -h 127.0.0.1 -p 55432 -U travel_test -d travel_platform_test -c "\dt"

# If tables are missing, apply migrations
npm run demo:reset
```

**B) Database Connection String Wrong**
```bash
# Verify in terminal logs:
# Should see something like "Database connected: postgresql://..."

# If wrong, update .env.local and restart
npm run demo
```

**C) RLS Policy Issue**
```bash
# Disable RLS temporarily (demo-only, unsafe in production)
# Edit .env.local, add:
# DISABLE_RLS=true

# Restart and test
npm run demo
```

---

### 7. "Cannot Read Property X of Undefined" (Frontend) ❌

**Symptoms:**
- Page crashes
- Browser console shows `TypeError: Cannot read property 'X' of undefined`

**Root Cause:** API not responding, data is null

**Quick Fixes:**

**A) Check API is Running**
```bash
# Terminal should show API logs
# If not, restart: npm run demo
```

**B) Reload the Page**
```bash
# Press F5 in browser
# Or Ctrl+Shift+R to hard-refresh (clear cache)
```

**C) Check Network Tab (F12)**
```bash
# Open DevTools (F12) → Network tab
# Try clicking a button
# Look for failed API requests (red)
# Click to see response → error details
```

**D) Restart Everything**
```bash
# Stop: Ctrl+C
# Clean: npm run clean
# Restart: npm run demo
```

---

### 8. "Demo Data Not Found" ❌

**Symptoms:**
- Agency Portal shows "No customers"
- Commercial opportunities list is empty
- Proposals/Trips missing

**Root Cause:** Seeding didn't run or failed

**Quick Fix:**

```bash
# Reset and re-seed
npm run demo:reset

# Verify data exists
psql -h 127.0.0.1 -p 55432 -U travel_test -d travel_platform_test << 'EOF'
SELECT COUNT(*) as agencies FROM agencies;
SELECT COUNT(*) as customers FROM customers;
SELECT COUNT(*) as proposals FROM proposals;
SELECT COUNT(*) as opportunities FROM commercial_opportunities;
EOF

# Restart demo
npm run demo
```

---

### 9. "Auth Not Working" (Customer Portal) ❌

**Symptoms:**
- Customer Portal shows "Unauthorized" or blank
- Console shows `401 Unauthorized`

**Root Cause:** Dev-auth headers not being injected

**Check:**

```bash
# Open DevTools (F12) → Console tab
# Look for logs like:
# [DEV-CUSTOMER-AUTH] Intercepted request: GET /customer-api/...
# [DEV-CUSTOMER-AUTH] Setting header: x-dev-customer=agency-a

# If you see these, auth is working
# If you don't see them, check:
```

**Fix:**

```bash
# Verify .env.local has ALLOW_DEV_AUTH=true
cat .env.local | grep ALLOW_DEV_AUTH

# Verify vite.config in apps/customer has dev auth middleware
grep -A5 "DEV_CUSTOMER_AUTH" apps/customer/vite.config.ts

# Restart
npm run demo
```

---

### 10. "Redis Connection Failed" ⚠️

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Note:** Redis is optional in demo mode.

**Fix:**

```bash
# Option A: Ignore (if not needed)
# Redis is for caching/rate-limiting in production

# Option B: Install Redis
# macOS: brew install redis
# Windows: Use WSL + redis-server
# Docker: docker run -p 6379:6379 redis:7

# Restart demo
npm run demo
```

---

## Preventive Measures

### Before Every Live Presentation

**1 Hour Before:**
```bash
# Fresh reset
npm run demo:reset

# Let it settle for 30 seconds
sleep 30

# Quick health check
curl http://127.0.0.1:4000/health
curl http://localhost:5173 >/dev/null
curl http://localhost:5174 >/dev/null
```

**15 Minutes Before:**
```bash
# Open both portals in tabs
# Click through a few pages to "warm up"
# Check browser console for errors (F12)
# Verify demo data is visible
```

**5 Minutes Before:**
```bash
# Minimize/hide terminal
# Set browser zoom to 100%
# Close all other browser tabs (reduces noise)
# Put phone on silent
# Position camera/projection for visibility
```

---

## Live Presentation Fallbacks

### If Something Breaks During Demo

**Scenario 1: Page Won't Load**
- **Say:** "Let me refresh that..." (F5)
- **Backup Plan:** Click to a different section (you know works)

**Scenario 2: API Timeout**
- **Say:** "Sometimes the local demo takes a moment..." (wait 5 seconds)
- **Backup Plan:** Show the presentation script slides instead
- **Recovery:** "Let me restart services" and switch to customer portal while it restarts in background

**Scenario 3: Data Missing**
- **Say:** "This demo resets regularly, let me check the current state..."
- **Backup Plan:** Show the code (open `scripts/seed-demo-data.cjs`) to prove the data definition is there

**Scenario 4: Database Down**
- **Say:** "The database sometimes needs to reconnect..." (true, with RLS policy heavy operations)
- **Backup Plan:** Switch to customer portal (different database context)
- **Recovery:** After demo, run `npm run demo:reset` to fully recover

**Scenario 5: Complete Failure**
- **Say:** "Let me restart the services—this takes about 30 seconds..."
- **Show:** The presentation script content while restarting
- **Or:** Share your screen to show code/architecture if time runs out

---

## Advanced Debugging

### Enable Full Logging

```bash
# Terminal 1: Start services with verbose logging
DEBUG=* npm run demo
```

### Check Database State Directly

```bash
# Connect directly to PostgreSQL
psql -h 127.0.0.1 -p 55432 -U travel_test -d travel_platform_test

# Useful queries:
SELECT COUNT(*) FROM agencies;
SELECT COUNT(*) FROM customers;
SELECT COUNT(*) FROM proposals;
SELECT COUNT(*) FROM commercial_opportunities;

# Check RLS is enforced:
SELECT * FROM pg_policies;

# Check user sessions:
SELECT pid, usename, datname, state FROM pg_stat_activity;
```

### Inspect API Requests

**In Browser (F12):**
1. Open DevTools (F12)
2. Click Network tab
3. Click on a button in the app
4. Look for API calls (requests starting with `/api` or `/customer-api`)
5. Click request to see:
   - Request headers (look for `x-dev-user-id`, `x-dev-customer`, etc.)
   - Response status (200 OK, 401 Unauthorized, 500 Error, etc.)
   - Response body (error details)

### Check Docker Container Logs

```bash
# View PostgreSQL container logs
docker logs travel-platform-postgres-local

# Watch logs in real-time
docker logs -f travel-platform-postgres-local

# Check container health
docker inspect --format='{{.State.Health.Status}}' travel-platform-postgres-local
```

---

## Recovery Drill Script

```bash
#!/bin/bash
# Complete demo recovery (nuclear option)

echo "🔄 Complete Demo Recovery..."

# 1. Stop everything
echo "Stopping services..."
pkill -f "npm run demo"
pkill -f "vite"
pkill -f "node.*server.js"

sleep 2

# 2. Clean up Docker
echo "Resetting Docker containers..."
docker-compose -f infrastructure/docker-compose.local-postgres.yml down -v
sleep 2

# 3. Clean dependencies
echo "Cleaning dependencies..."
npm run clean

# 4. Reinstall
echo "Reinstalling dependencies..."
npm install

# 5. Fresh reset
echo "Resetting demo database..."
npm run demo:reset

# 6. Restart
echo "Starting demo..."
npm run demo

echo "✅ Demo ready!"
```

Save as `scripts/recovery.sh` and run with:
```bash
bash scripts/recovery.sh
```

---

## When to Admit Defeat (Gracefully)

If you've tried all steps and services won't start with 10 minutes until showtime:

**Option A: Recorded Demo**
- Pre-record a screen capture of the demo running
- Play during presentation
- "Here's a recording from earlier today, showing..."

**Option B: Live Code Review**
- Open the codebase in IDE
- Walk through the architecture
- "Here's how the customer portal works..." (show code)
- Explain the data model and API

**Option C: Slides + Time for Q&A**
- Use your presentation script as slides
- Answer deep questions about the system
- Offer follow-up hands-on demo
- "Thank you, we have a full deployment guide at [docs link]"

**Option D: Apologize & Reschedule**
- "We had a technical issue with the local environment. Can we follow up tomorrow with a live demo?"
- Send recording + quick-start guide

All of these are professional fallbacks. Never force a broken demo on an audience.

---

## Post-Demo Checklist

After a successful presentation:

- [ ] Save browser history (who clicked what)
- [ ] Note any questions for product team
- [ ] Export demo database state (if interesting scenario)
- [ ] Run `npm run demo:reset` to clean up for next demo
- [ ] Update PRESENTATION_SCRIPT.md with any new talking points

---

## Support

If you get stuck:

1. **Check this guide** (you're reading it)
2. **Check QUICK_START.md** for setup basics
3. **Check logs** in the running terminal
4. **Restart services** (`npm run demo:reset` + `npm run demo`)
5. **Ask the team** or open an issue

Last resort: Full clean install
```bash
git clean -fd
git reset --hard
npm install
npm run demo:reset
npm run demo
```
