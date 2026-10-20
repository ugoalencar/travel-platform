# Offers lens
Score: 3 | Vote: FUND IF

## What is strong

- The pain itself is plausible and specific: agencies juggling CRM, sales
  pipeline, operations and finance across spreadsheets/WhatsApp is a real,
  nameable problem, not a vague one. The stack of promised modules (CRM,
  pipeline, operations, finance, team roles, client portal) maps cleanly onto
  stages a travel agency actually goes through — that is the right shape for
  an offer, even if the content underneath some stages is not built yet.
- The buyer is easy to *identify* even if not yet validated: travel agencies
  in Brazil are a bounded, findable population (associations, trade
  groups, existing software vendors' customer lists), which is a precondition
  the Offers lens cares about (easy to find and reach) even though "has money
  to spend" and "market growing" are still unknown.
- There is a cheaper, lighter entry point ("Travel Lite") sitting inside the
  same platform, which is the right instinct for lowering the effort/time
  side of the value equation for a first-time buyer who does not want to
  commit to the full Profissional tier immediately.

## What would kill it (the top 3, most dangerous first)

1. **The offer promises something the product cannot currently do.** The
   landing page advertises a financial module "including emissão de nota
   fiscal" and recurring billing — but per the brief, Asaas billing and NFS-e
   are only ADRs/specs, with zero implemented code. In the value equation,
   this is not a weak "likelihood of achieving the outcome" — it is a false
   one. A buyer who signs up expecting automatic invoicing and recurring
   charging will discover mid-onboarding that the core financial promise does
   not exist. That is not a soft objection to overcome with better copy; it is
   a offer-buyer trust break that no stack of bonuses fixes, and in a
   regulated area (fiscal/NFS-e) it is also a reputational and possibly legal
   exposure, not just a marketing one.
2. **Zero proof behind the offer.** No paying customer, no case study, no
   pilot result, no testimonial — nothing that answers "why would they believe
   it works?" Worse, a security audit already found the public lead-capture
   form (the mouth of the funnel) has no validation/captcha, and super-admin
   MFA is optional. An offer with no proof is already fighting the hardest
   battle in the value equation (likelihood); an offer whose own intake form
   is unhardened adds a second, self-inflicted wound right at the point where
   a skeptical first buyer forms their opinion of the whole company.
3. **The pricing is commodity-shaped, not offer-shaped.** The three tiers
   differ by seats, GB and generic "support level" (R$99/299/sob consulta).
   That is a software-vendor price list, not a Hormozi-style offer — there is
   no guarantee, no named stack of solved problems, no urgency/scarcity, no
   reason a buyer could not get the same shape from any generic SaaS. "More
   users and more storage for more money" invites exactly the price
   comparison this lens says to avoid; nothing here would survive a
   doubled price.

## The questions I would ask the founder

- Who, specifically, is the first agency you will sell to — size (solo
  agent vs. 10-person agency), current tool (spreadsheet, another SaaS,
  nothing), and who inside the agency decides and pays?
- Today, with billing and NFS-e not built, what do you actually tell a
  prospect who asks "can this agency bill my clients and issue nota fiscal
  through your platform"? What happens if they say yes before you've fixed
  that gap?
- What is the one proof point you could get in the next 30 days — one pilot
  agency actually using it, even unpaid — to replace "trust us" with a
  result you can show the next ten prospects?
- If you had to strip the three-tier, seats-and-GB pricing and instead sell
  one guaranteed outcome (e.g., "your commercial pipeline organized and your
  team onboarded in 2 weeks, or it's free"), what would that outcome be, and
  could you actually guarantee it today?
- Market size, how much agencies actually spend on this category today, and
  who else already sells a competing CRM/ops tool to Brazilian travel
  agencies are open questions nobody has answered yet — `/founder-competitors`
  would answer the competitive-landscape half, and `/founder-consumer` would
  tell you whether agencies would actually buy at the stated pain/price
  before you spend more on the offer itself.

## If FUND IF: the conditions

1. Stop advertising emissão de nota fiscal / cobrança recorrente as a live
   capability on the public landing page until the Asaas/NFS-e code actually
   ships — either remove the claim or mark it explicitly as a roadmap item,
   so the offer never promises what the product cannot yet deliver.
2. Close the already-identified security gaps on the public lead form
   (validation/captcha) before spending any money driving traffic to it —
   the top of the funnel should not be the weakest point of the offer.
3. Get at least one real agency (paid or pilot) using the product end to end
   and turn that into a concrete proof point before building more pricing
   tiers or marketing spend around "likelihood" claims that currently have
   no evidence behind them.
4. Redesign pricing around a named, guaranteed outcome and a problem-stack
   (per the Offers lens) rather than seats/GB/support-tier scaling, so the
   three plans stop reading as a generic SaaS price list.
