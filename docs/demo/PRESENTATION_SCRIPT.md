# Travel Platform - Live Presentation Script

## 10-15 Minute Demo Flow

**Audience**: Investors, partners, C-suite executives  
**Duration**: 10-15 minutes  
**Setup**: Follow QUICK_START.md before presenting

---

## Pre-Show Checklist (5 minutes before)

- [ ] All services running: `npm run demo`
- [ ] Agency Portal open in one tab: http://localhost:5173
- [ ] Customer Portal open in second tab: http://localhost:5174
- [ ] Mouse cursor visible
- [ ] Demo account identities confirmed (see QUICK_START.md)
- [ ] Browser zoom at 100%
- [ ] Notifications disabled
- [ ] Terminal minimized or hidden
- [ ] Demo data in good state: `npm run demo:reset` if uncertain

---

## Segment 1: Welcome & Overview (1 minute)

**Speaker Notes:**
> "Today I'm showing you Travel Platform, a modern SaaS system designed specifically for travel agencies. It connects agencies, customers, and suppliers in one coordinated digital ecosystem. We'll walk through three key flows: how agencies manage customers and trips, how they capture and convert sales opportunities, and finally, how customers themselves interact with the platform."

**What you're seeing:**
- (Point to both tabs) "Two portals: one for agencies and staff, one for end customers—travelers."

---

## Segment 2: Agency Dashboard (2 minutes)

### Starting State

**Action**: Click on Agency Portal tab (5173)

**What the audience sees:**
- Clean, modern dashboard
- Key metrics cards (customers, trips, proposals, sales, revenue)
- Visual pipeline overview
- Recent activity feed

**Speaker Notes:**
> "This is where travel agency staff work. The dashboard gives them a snapshot of their business. We see:
> - How many customers and trips are active
> - Sales pipeline status across different stages (prospect, quote, proposal sent, won, post-sale)
> - Total revenue and key metrics
> - Recent actions and tasks"

### Explain the Layout

**Action**: Hover over or click on different sections

**Speaker Notes:**
> "On the left sidebar, we have the complete app navigation:
> - Dashboard (overview)
> - Customers (360-degree customer view)
> - Trips (planned and completed travel)
> - Pescador (our capture system for external offers)
> - Offers & Marketing (promotional materials)
> - Commercial Pipeline (sales opportunities)
> - Financial (revenue, expenses, receivables)
> - Reports (deep analytics)

> The design is clean and responsive. It works on desktop, tablet, and mobile because our agencies work in the field too."

---

## Segment 3: Customer 360 & Documents (2 minutes)

### Navigate to Customers

**Action**: Click "Customers" in sidebar → Click first customer in list

**What you see:**
- Full customer profile
- Personal details (name, email, phone, CPF)
- Address(es) (formatted with Brazilian postal structure)
- Dependents (family members traveling)
- Documents (passport, national ID, driver license with status)
- Document preview/OCR status

**Speaker Notes:**
> "One of Travel Platform's key features is Customer 360: a unified view of everything the agency knows about someone.

> Here we see personal information, but more importantly, we see integrated documents. Travel is heavily document-driven—passports, visas, national IDs. Many agencies still manage these as attachments or scanned PDFs. We're building intelligent document capture and verification.

> Notice the document types, expiry dates, and OCR-ready status. We're preparing the foundation for automated document recognition and compliance checking."

### Click on a Document (if available)

**Action**: Click on a document entry to show preview/details

**Speaker Notes:**
> "Each document has metadata: type, issue date, expiry, and verification status. The agency can track which documents are missing, expiring soon, or need review."

---

## Segment 4: Wishes & Trips (1 minute)

### Navigate to Customer's Wishes

**Action**: Scroll down or click "Wishes" tab

**Speaker Notes:**
> "A 'Wish' is how customers express travel desire. It's not a booking yet—just 'I want to go to Cancún in May for two weeks.' The agency uses wishes to understand customer intent before proposing solutions."

### Navigate to Trips

**Action**: Click "Trips" in sidebar → Click a trip

**What you see:**
- Trip details (destination, dates, travelers)
- Status (planned, confirmed, completed)
- Itinerary
- Associated bookings
- Financial summary

**Speaker Notes:**
> "A Trip is a confirmed journey. You see:
> - Destination and travel dates
> - Number of travelers
> - Current status in the fulfillment lifecycle
> - Linked bookings (flights, hotels, transportation)
> - Financial tracking (amount paid, balance due)"

---

## Segment 5: Pescador - Capture & Extract (2 minutes)

### Navigate to Pescador

**Action**: Click "Pescador" in sidebar

**Speaker Notes:**
> "Pescador is Portuguese for 'fisherman'—and that's exactly what this does. It 'fishes' for travel offers from suppliers across the internet.

> Travel agencies spend hours manually searching supplier websites, copying details, and reformatting data into proposals. Pescador captures that information automatically and structures it for reuse."

### Show Pescador Interface

**What you see:**
- URL input field
- Submit button
- Processing status area
- Captured offers with extracted details

**Speaker Notes:**
> "The workflow is simple:
> 1. Paste a supplier URL (hotel, tour operator, airline)
> 2. Pescador visits the page and extracts structured data (title, price, dates, inclusions)
> 3. AI-powered extraction recognizes patterns (accommodation type, meal plan, transfers)
> 4. Staff reviews and approves
> 5. Approved captures become offers reusable across the customer base"

### Show Mock External Captures (if demo-seeded)

**Action**: If available, scroll through captured offers

**Speaker Notes:**
> "Here you see real examples of captured offers. In production, these are real URLs. For this demo, we're showing realistic mock captures so you can see the data structure without external internet dependency."

---

## Segment 6: Offers & Marketing (1 minute)

### Navigate to Offers

**Action**: Click "Offers" in sidebar

**What you see:**
- List of promotional offers
- Create/Edit/Duplicate buttons
- Offer details (price, inclusions, terms)

**Speaker Notes:**
> "Offers are the products the agency sells. They can be:
> - In-house packages (curated by the agency)
> - Supplier offers (imported via Pescador)
> - Campaign offers (limited-time promotions)

> Agencies use these to build proposals and respond quickly to customer requests."

### Navigate to Marketing (if available)

**Action**: Click "Marketing" or "Campaigns" in sidebar

**What you see:**
- Campaigns
- Email templates
- Coupons
- Publication drafts

**Speaker Notes:**
> "The marketing module helps agencies promote offers:
> - Campaigns: grouped promotions with dates and targets
> - Templates: reusable email layouts
> - Coupons: discount codes with tracking
> - Publications: draft marketing materials before sending"

---

## Segment 7: Commercial Pipeline (2 minutes)

### Navigate to Commercial Pipeline

**Action**: Click "Commercial" or "Pipeline" in sidebar

**What you see:**
- Kanban board showing pipeline stages
- Opportunities in different stages
- Cards showing customer name, destination, value, next action
- Color-coded by urgency or value

**Speaker Notes:**
> "This is where the magic of sales management happens. It's a Kanban board showing the entire pipeline:

> - **PROSPECTING**: New leads
> - **INTEREST**: Customer expressed intent
> - **QUOTE**: We've prepared a quote
> - **PROPOSAL SENT**: Formal proposal delivered
> - **WAITING_CUSTOMER**: Waiting for customer decision
> - **NEGOTIATION**: Back-and-forth on price/terms
> - **WON**: Sale confirmed, moving to fulfillment
> - **POST_SALE**: Servicing the trip
> - **LOST**: Deal didn't close

> Each card shows:
> - Customer name and destination
> - Expected value
> - Responsible person
> - Next action due date (red if overdue)"

### Show an Opportunity Detail

**Action**: Click on a card (e.g., Cancún opportunity)

**What you see:**
- Full opportunity details
- Related customer
- Proposal details
- Communication history
- Tasks and follow-ups

**Speaker Notes:**
> "When you click an opportunity, you see:
> - The customer and their travel wish
> - Our proposal (price, terms, valid until date)
> - Overdue follow-ups (if any—this is a risk indicator)
> - Tasks assigned to the team
> - Next action required

> The system tracks 'next_action_at' to ensure nothing slips through the cracks."

---

## Segment 8: Financial Tracking (1 minute)

### Navigate to Financial

**Action**: Click "Financial" in sidebar

**What you see:**
- Revenue dashboard
- Expenses
- Receivables (A/R - money owed by customers)
- Payables (A/P - money owed to suppliers)
- Cash flow projections

**Speaker Notes:**
> "Every sale has financial implications:
> - Revenue: money coming in
> - Expenses: costs for flights, hotels, commissions
> - Receivables: amounts customers owe
> - Payables: amounts the agency owes suppliers

> Travel Platform tracks all of it. Agencies can see:
> - Which customers have outstanding balances
> - Which invoices are overdue
> - Which supplier payments are due
> - Overall cash position"

### Show Charts/Totals

**Action**: Point to key metrics

**Speaker Notes:**
> "The financial dashboard shows total revenue, total expenses, and key ratios. Agencies need this real-time visibility—especially in travel, where cash flow timing is critical."

---

## Segment 9: Reports & Analytics (1 minute)

### Navigate to Reports

**Action**: Click "Reports" or "Analytics" in sidebar

**What you see:**
- Sales by destination
- Revenue trends
- Customer acquisition funnel
- Performance by sales stage
- Overdue follow-up alerts

**Speaker Notes:**
> "Business intelligence is built in. Agencies can run reports on:
> - Where are customers traveling? (helps with inventory planning)
> - Which destinations generate the most revenue?
> - How many deals are stuck in negotiation? (process improvement)
> - Are we following up promptly? (quality metrics)

> All of this drives better decision-making."

---

## Segment 10: Customer Portal (2 minutes)

### Switch to Customer Portal Tab

**Action**: Click on Customer Portal tab (5174)

**Speaker Notes:**
> "Now let's look at this from the customer's perspective. They don't care about pipelines or financials. They want to book a trip."

### Home / Dashboard

**What you see:**
- Welcome message
- Upcoming trip(s)
- Key info (destination, dates, status)
- Quick action buttons

**Speaker Notes:**
> "The customer portal is deliberately different from the agency view. It's simple and focused:
> - Show me my trips
> - Show me my proposals
> - Let me book or confirm"

### Navigate to Trips

**Action**: Click "My Trips"

**What you see:**
- List of customer's trips
- Status badges (planned, confirmed, completed)
- Quick access to details

**Speaker Notes:**
> "The customer sees only their own trips. Thanks to PostgreSQL Row-Level Security, they can't see other customers' data—even if they try to hack the API."

### Click on a Trip Detail

**Action**: Click on a trip

**What you see:**
- Full trip details
- Travelers
- Dates and destination
- Itinerary (if available)
- Status timeline

**Speaker Notes:**
> "Here's the full trip context: who's going, when, where, and what's included. Customers can see their itinerary and any important documents."

### Navigate to Proposals

**Action**: Click "My Proposals" or "Proposals" in sidebar

**What you see:**
- Pending proposals
- Proposal details (price, inclusions, terms)
- Accept/Reject buttons
- Valid-until dates

**Speaker Notes:**
> "When the agency sends a proposal, the customer sees it here. They can review:
> - What's included (flights, hotels, activities)
> - The price
> - Payment terms
> - Expiration date

> Then they accept or request changes."

### Navigate to Bookings

**Action**: Click "My Bookings" or "Bookings"

**What you see:**
- Confirmed bookings
- Booking reference numbers
- Dates and status
- Ticket/confirmation details

**Speaker Notes:**
> "Once a proposal is accepted, it becomes a booking. The customer has a confirmed record of:
> - What they booked
> - When it's happening
> - Confirmation numbers for airlines, hotels, transfers
> - Next steps"

### Navigate to Profile

**Action**: Click "My Profile" or "Profile"

**What you see:**
- Personal information
- Saved addresses
- Dependents
- Saved documents

**Speaker Notes:**
> "The customer can keep their profile up to date. Documents (passport, national ID) stored here are accessible when the agency needs to verify them for visa applications or international travel."

---

## Segment 11: Closing & Vision (2 minutes)

### Return to Agency Portal

**Action**: Switch back to Agency Portal tab

**Speaker Notes:**
> "Let me tie this together.

> **What we've shown you:**
> 1. **Unified Agency Workspace** - Everything an agency needs is in one system
> 2. **Customer Intelligence** - Deep visibility into who customers are and what they need
> 3. **Sales Process** - Structured pipeline to track every deal
> 4. **Operational Efficiency** - Automated capture of supplier offers (Pescador)
> 5. **Financial Control** - Real-time revenue, receivables, and cash flow
> 6. **Customer Experience** - Simple, focused portal for end customers

> **The Vision:**
> 
> Travel agencies are going digital, but most are still using spreadsheets and email. That's inefficient and error-prone. Travel Platform is built for agencies that want to:
> - Operate at scale without adding headcount
> - Give customers a modern experience
> - Have real-time visibility into their business
> - Automate repetitive work (like offer extraction)
> - Track financial performance precisely
> 
> **Our Approach:**
> - Cloud-native SaaS (scalable, secure)
> - Built specifically for travel workflows
> - Multi-tenant isolation (data security built in)
> - Extensible architecture (add suppliers, channels, integrations)
> - Production-grade infrastructure
>
> Thank you."

---

## Q&A Talking Points

### "How do you handle security?"

> "Multi-layered:
> - Application-level tenant isolation (your data is your agency's)
> - PostgreSQL Row-Level Security (database enforces isolation)
> - API authentication and authorization
> - Audit logging (all changes tracked)
> - Regular security reviews and penetration testing"

### "Can we integrate with our suppliers?"

> "Yes. Pescador is one example—we're building API connectors for major suppliers (airlines, hotel chains, tour operators). Customers can also use webhooks to integrate their own systems."

### "What about reporting and compliance?"

> "All financial data is structured and auditable. We generate standard travel industry reports. Compliance features (document tracking, visa requirements) are built in."

### "Is the pricing data accurate?"

> "In this demo, pricing is realistic but fictional. In production, prices come live from suppliers via integrations. You set margin rules, and the system applies them automatically."

### "How do customers know about promotions?"

> "Marketing module lets you create campaigns, email templates, and discount codes. Integration with email providers is planned."

---

## Demo Tips & Tricks

**If you make a mistake:**
- "Let me reload that page" (F5)
- "Let me navigate back" (click browser back)

**If something breaks:**
- "This is a local demo, sometimes things reset. Let me restart..." (no need to actually do it if time is short)
- Switch to a different section that's definitely working

**To buy more time:**
- Click into customer details and talk through the data structure
- Click into a proposal and explain the terms
- Open the browser console to show the API calls (F12 → Network tab)

**To impress the audience:**
- Show the pipeline board and point out how it drives follow-up discipline
- Mention the RLS security model and how tenant isolation works
- Talk about document verification and OCR readiness

---

## Post-Demo Follow-Up

**Slide or Handout:**

> "Thank you for your time. Here's how to try the demo yourself:
> 
> 1. Clone: `git clone <repo>`
> 2. Install: `npm install`
> 3. Run: `npm run demo`
> 4. Navigate to http://localhost:5173
> 
> See docs/demo/QUICK_START.md for full details.
> 
> Questions? Contact: [team email]"

---

## Timing Reference

| Segment | Time | Content |
|---------|------|---------|
| Welcome | 1m | Overview & scope |
| Dashboard | 2m | Agency overview |
| Customer 360 | 2m | Customer details, documents |
| Wishes & Trips | 1m | Travel modeling |
| Pescador | 2m | Offer capture & extraction |
| Offers & Marketing | 1m | Promotional management |
| Commercial Pipeline | 2m | Sales process & tracking |
| Financial | 1m | Revenue & receivables |
| Reports | 1m | Analytics & insights |
| Customer Portal | 2m | End-customer experience |
| Closing | 2m | Vision & value prop |
| **Total** | **~15m** | (Add Q&A as time permits) |

---

## Backup Demos (if time permits)

### Advanced: Show RLS Security

**Action**: Open browser DevTools (F12) → Network tab → Inspect API calls

**Talking Points:**
> "Every API request includes tenant context. The backend independently verifies:
> - Who am I?
> - What agency do I belong to?
> - Am I authorized for this data?
> 
> PostgreSQL RLS adds an additional layer: even if the API logic had a bug, the database would still prevent cross-tenant data leakage."

### Advanced: Show Offer Capture Details

**Action**: If Pescador has captured examples, click into one

**Talking Points:**
> "Behind the scenes, this is what's happening:
> 1. Extract title, price, inclusions from the supplier's webpage
> 2. Normalize the data (convert dates, parse pricing)
> 3. Classify the offer type (flight, hotel, tour, etc.)
> 4. Flag any data quality issues
> 5. Show staff a preview to review and approve"

### Advanced: Custom Pipelines

**Action**: Click on a different pipeline (e.g., 'Pós-venda')

**Talking Points:**
> "Agencies have different workflows. A post-sale team has different stages than a sales team. Travel Platform supports custom pipelines—each agency can define their own."

---

## End of Script

**Remember**: This is a 10-15 minute script. Adjust based on audience interest and questions.
