# Product lens
Score: 4 | Vote: FUND IF
## What is strong
- There is a real product in production, not a deck: two live apps (`app.travelplataforma.com.br`, `travellite.travelplataforma.com.br`) with real domains responding. The Product lens treats "ship something real a customer can touch" as a baseline test, and this clears it.
- Multi-tenant isolation (data isolation per agency, role-based access, 2FA, audit trail) was designed up front rather than bolted on later. That is evidence of thinking about the whole experience, including the part a customer never sees directly but silently depends on — the "taste in parts nobody sees" idea.
- The architecture decisions for billing and fiscal emission were written down as ADRs before being coded. That is the right order of operations even though the thing described in them is not built yet.
- A "Travel Lite" variant exists, which at least gestures toward the discipline of asking "what is the smaller, focused version of this" — whether it is actually that smaller focused thing is a separate, open question below.

## What would kill it (the top 3, most dangerous first)
1. **The landing page promises a transaction the product cannot complete.** Marketing says recurring billing (Pix/boleto/cartão) and automatic NFS-e issuance. In production today, neither is implemented — only the ADR exists. The Product lens says every touchpoint from the first ad to the receipt is the product, and the receipt is exactly where this breaks: a real prospect who signs up and tries to pay or get an invoice hits a dead end. That is not a missing feature, it is a broken promise at the single moment trust matters most, and it will be discovered by the first serious buyer, not by an internal test.
2. **The product tries to be seven things at once with no stated "one thing."** CRM, sales pipeline, trip/operations tracking, full financial module, team/role management, a client-facing portal, and a separate Travel Lite tier — all announced together. The brief gives no evidence anyone has decided what this product must do brilliantly before anything else. Lack of focus is not a cosmetic problem under this lens; it is the mechanism by which quality gets thin everywhere at once, which is consistent with finding #3 below.
3. **The craft gaps already found are in the parts customers can't see until something goes wrong.** A security audit (not yet acted on) found: no captcha/validation on the public lead form, security headers not configured, MFA not required for a super-admin account, and CI secret-scanning (gitleaks) not wired up. The lens's claim is that a business which cuts corners where customers can't look will cut them where they can — this is the leading indicator of exactly that pattern, on a product whose core sell to a B2B buyer is "trust us with your client data and your money."

## The questions I would ask the founder
- If a travel agency owner uses this for five minutes on day one, what is the one thing that happens that makes them stop using a spreadsheet or WhatsApp group? Can you say it in one sentence, without "and"?
- Of CRM, pipeline, operations, financial, team management, client portal, and Travel Lite — if you had to cut four and keep the rest live, which three stay?
- Have you personally walked the path a real prospect walks — landing page, demo form, signup, first login, first attempt to get billed or get an invoice — end to end, right now, as they would experience it?
- Today, when someone actually tries to subscribe and pay, what do they see, given billing isn't wired up? Is that moment hidden from prospects, or will they hit it?
- Is Travel Lite the focused, cut-down version of the product you'd bet the business on, or is it dilution — a second thing to maintain instead of a sharper first thing?
- The login incident the founder reported (recusado, resolved via password reset) — is there any reason to believe that was a one-off, or is it a crack in a seam nobody has looked at yet?

## If FUND IF: the conditions
- Before adding any more features: pick the one thing this product must do brilliantly, and either remove or clearly mark as "coming soon" anything the landing page promises that production cannot yet deliver — starting with recurring billing and NFS-e.
- Close the promise/reality gap on billing and invoicing — either ship the ADR'd implementation or stop advertising it — before spending more on acquisition, since every new signup currently walks into that dead end.
- Fix the already-identified craft gaps (public form validation/captcha, security headers, mandatory MFA for super-admin, CI secret scanning) before layering on new modules; these are foundational trust items, not polish.
- Open questions this lens cannot answer and should not guess at: market size and competitive crowding (/founder-competitors), whether real agencies actually want this and would pay at the stated prices (/founder-consumer), and whether the unit economics work at all (/founder-cfo). Fund conditional on those being run before scaling spend.
