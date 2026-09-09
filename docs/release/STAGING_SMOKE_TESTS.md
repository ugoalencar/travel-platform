# STAGING SMOKE TEST SUITE

## Pre-Deployment Verification

**Tag:** v1.0.0-rc1  
**Target Environment:** Staging  
**Expected Duration:** 15-20 minutes  

---

## INFRASTRUCTURE CHECKS

### API Service
- [ ] Health endpoint responds: `GET /health`
- [ ] API is listening on port 4000
- [ ] Database connection established
- [ ] Migrations applied successfully

### Agency Portal
- [ ] Vite dev/build server running on port 5173
- [ ] Assets loading (no 404s)
- [ ] Stylesheets applied (colors visible)

### Customer Portal
- [ ] Vite dev/build server running on port 5174
- [ ] Assets loading (no 404s)
- [ ] Stylesheets applied (colors visible)

---

## AUTHENTICATION FLOWS

### Agency Staff
- [ ] Login page loads (name/password form)
- [ ] Valid credentials accepted
- [ ] Invalid credentials rejected
- [ ] JWT token issued and stored
- [ ] Redirect to dashboard on successful login
- [ ] Logout clears token and redirects to login

### Customer (Portal)
- [ ] Portal login loads
- [ ] Customer credentials validate
- [ ] JWT issued for customer identity
- [ ] Redirect to home page on success
- [ ] Logout works correctly

---

## AGENCY PORTAL SMOKE TESTS

### Dashboard
- [ ] Page loads without errors
- [ ] Metrics cards display (no blank values)
- [ ] Charts/graphs render (if applicable)
- [ ] Navigation sidebar accessible

### Customer 360
- [ ] Customer list loads
- [ ] Search input accessible (aria-label present)
- [ ] Search functionality works (filters results)
- [ ] Can create new customer
- [ ] Can view customer details
- [ ] Addresses section displays
- [ ] Dependents section displays
- [ ] Documents section displays

### Pescador
- [ ] Capture UI loads
- [ ] Can input external URL
- [ ] Can save offer from capture
- [ ] Captured offers appear in offers list

### Ofertas & Marketing
- [ ] Offers list loads
- [ ] Can create new offer
- [ ] Can edit existing offer
- [ ] Can duplicate offer
- [ ] Campaigns page loads
- [ ] Can create campaign
- [ ] Coupons page loads
- [ ] Can create coupon with type selection

### Financeiro
- [ ] Dashboard with financial metrics loads
- [ ] Revenues page loads (CRUD works)
- [ ] Expenses page loads (CRUD works)
- [ ] Cash transactions page loads
- [ ] Reconciliation page loads
- [ ] Categories page allows configuration
- [ ] Reports page displays DRE, cash flow, margins
- [ ] NUMERIC calculations are decimal-accurate

---

## CUSTOMER PORTAL SMOKE TESTS

### Home Page
- [ ] Loads with welcome message
- [ ] Summary cards display (bookings, proposals, offers counts)
- [ ] Next trip card shows correctly (or empty state)
- [ ] Search input labeled with aria-label

### Trips
- [ ] My Trips page loads
- [ ] Trip cards display in grid
- [ ] Trip duration calculated and displayed
- [ ] Status badges color-coded
- [ ] Can click to view trip details

### Bookings
- [ ] My Bookings page loads
- [ ] Booking cards display in grid
- [ ] Status badges show correctly
- [ ] Departure date and time display
- [ ] Passenger count displays
- [ ] Can click to view booking details

### Proposals
- [ ] My Proposals page loads
- [ ] Proposal cards display
- [ ] Pricing displayed prominently
- [ ] Status indicators visible
- [ ] Can accept proposal (if available)

### Profile
- [ ] Profile page loads
- [ ] Personal info section displays
- [ ] Address section displays
- [ ] Agency info section displays
- [ ] Document management accessible

---

## DATA INTEGRITY CHECKS

### Cross-Tenant Isolation (RLS)
- [ ] Agency user A cannot see Agency B's customers
- [ ] Customer A cannot see Customer B's trips
- [ ] Verify database RLS policies enforced

### Financial Flow
- [ ] Create sale linked to booking
- [ ] Verify Receivable created automatically
- [ ] Verify Revenue created automatically
- [ ] Verify financial dashboard updates
- [ ] Verify reports reflect the sale

### Document Security
- [ ] Upload test document (image)
- [ ] Verify stored in secure location
- [ ] Verify document number masked in lists
- [ ] Verify full number accessible in detail view
- [ ] Verify audit log records access

---

## PERFORMANCE CHECKS

### Response Times
- [ ] Dashboard loads in <2s
- [ ] Customer list loads in <2s
- [ ] Financial reports load in <3s
- [ ] Search completes in <1s

### Error States
- [ ] Network error shows graceful error message
- [ ] Empty states styled correctly
- [ ] Loading states show spinner/indicator
- [ ] Form validation errors display clearly

---

## ACCESSIBILITY SPOT CHECKS

### Search Controls (New Fixes)
- [ ] Search inputs have `aria-label`
- [ ] Search inputs have associated `<label>` (sr-only)
- [ ] Filter buttons have `aria-pressed`
- [ ] Filter button groups have `role="group"`

### General Accessibility
- [ ] Tab navigation works through UI
- [ ] Focus visible on all interactive elements
- [ ] Screen reader announces dynamic content (aria-live)
- [ ] Form labels associated with inputs

---

## RESPONSIVE DESIGN (Manual/Automated)

### Desktop (1920px, 1366px)
- [ ] Layout optimal at desktop sizes
- [ ] No horizontal scrolling
- [ ] Tables display fully

### Tablet (834px, 768px)
- [ ] Layout adapts to tablet width
- [ ] Touch targets adequate (≥48px)
- [ ] Sidebar collapses appropriately

### Mobile (480px, 375px)
- [ ] Mobile-first layout works
- [ ] Navigation hamburger menu works
- [ ] Forms usable on small screens
- [ ] No horizontal scrolling

---

## SIGN-OFF

**Tag:** v1.0.0-rc1  
**Smoke Test Date:** [deployment date]  
**Tester:** [CI/CD automation]  
**Result:** [ ] PASS [ ] FAIL  

**Issues Found:**
```
[Document any issues here]
```

**Verdict:**
- [ ] Ready for Production Release
- [ ] Requires Fixes Before Production

---

**Next Step:** If all smoke tests pass → Approve Production Release
