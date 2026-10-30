# Monopoly lens
Score: 3/10 | Vote: FUND IF

## What is strong

- There is a real wedge candidate: compliant recurring billing (Pix/boleto/cartão
  via Asaas) plus automated NFS-e issuance for Brazilian travel agencies. That
  combination is genuinely annoying to build correctly (payment provider
  integration, fiscal rules, idempotency, reconciliation), which is the kind
  of "boring but hard" know-how the Monopoly lens treats as a legitimate
  source of an edge — if it actually gets built and works.
- "Travel Lite" as a lighter entry module is a sensible way to start in a
  smaller, more winnable slice (smaller agencies, lower switching cost) before
  expanding to the full Profissional/Empresarial tiers — consistent with the
  lens's preference for owning a small market first rather than launching
  broad.
- The product is live in production (`app.travelplataforma.com.br`,
  `travellite.travelplataforma.com.br`), not just a deck. That is a precondition
  for any monopoly claim — you cannot judge durability or distribution from
  slides — even though it does not by itself prove a monopoly case.

## What would kill it (the top 3, most dangerous first)

1. **No distribution evidence at all.** There are zero confirmed paying
   customers and no landing-page conversion data recorded. The entire go-to-market
   right now is "a demo-request form." The Monopoly lens treats distribution as
   half the business — a product with no proven way to reach the first 100
   buyers, at a known cost, is not yet a business, let alone a monopoly.
2. **Competitive landscape is unknown, and this looks commodity-shaped from
   the brief alone.** "CRM + pipeline + financeiro + portal do cliente" for a
   vertical is a pattern that gets built repeatedly. Nothing in the brief rules
   out that Brazilian travel agencies already have two or three entrenched
   vertical SaaS options. If they do, this is a crowded-market fight over thin
   margins — exactly what the lens says destroys profit. This is not yet known
   either way; it is an open, high-priority question, not an invented fact.
3. **The one feature that could be the actual moat is not built.** The billing
   and NFS-e integration — the hard, defensible part — exists only as ADRs
   (`ADR-BILLING-001`, `ADR-FISCAL-001`), with no production code. Today the
   platform cannot charge anyone recurringly or issue an invoice. Until that
   ships and is proven against a real agency, the live product is a generic
   CRM/portal, which is the easiest part of this business for a competitor to
   copy.

## The questions I would ask the founder

- Who else sells agency-management software to Brazilian travel agencies today,
  and how (if at all) do they handle Pix/boleto/NFS-e? This is unanswered —
  `/founder-competitors` is the right next step before assuming a gap exists.
- What do you know about running or selling into Brazilian travel agencies, or
  about BR fiscal/compliance mechanics, that a generalist SaaS builder does not?
  That is the candidate "secret" — right now the brief does not name one.
- How do the first 100 paying agencies actually get signed, and at what
  acquisition cost? Is there a channel already identified (agency associations,
  resellers, an existing network), or is the plan only the marketing-site demo
  form?
- Why is now the right time — did something change recently (an Asaas/NFS-e
  provider capability, a regulatory shift, an incumbent's weakness) that makes
  this winnable this year rather than two years ago or two years from now?
- If a competitor with more capital copied the Asaas + NFS-e integration within
  six months of seeing it work, what would stop them from taking the agencies
  already signed? What is the compounding advantage, if any, beyond having
  built it first?

## If FUND IF: the conditions

- Run `/founder-competitors` before any further build spend, to find out
  whether this niche already has an entrenched player in Brazil. A crowded
  market changes the entire thesis and the go-to-market plan.
- Ship the Asaas billing + NFS-e integration to production and validate it
  end-to-end against at least one real agency's real invoice/charge cycle
  before treating it as a differentiator — an ADR is not a moat.
- Close the already-identified security gaps (missing captcha/validation on
  the public lead form, security headers, mandatory MFA for super-admin,
  pending CI logging/secret-scanning) before handling any real customer
  payment or fiscal data — trust is part of durability for anything adjacent
  to money, and these are known, not hypothetical, gaps.
- Name the actual "secret" explicitly — the specific insight or relationship
  that is hard for a well-resourced copycat to replicate — rather than relying
  on "we built the CRM + billing + fiscal module" as the whole position. If no
  such secret can be named, the monopoly case does not hold regardless of how
  well the software works.
