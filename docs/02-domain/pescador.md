# Pescador

Batch 02 implements the manual external offer capture foundation, not a
production crawler.

Implemented scope:

- `external_offer_captures` in `013_pescador_foundation.sql`.
- Staff API for create, list, review, approve, reject, and explicit publish.
- Duplicate `sourceUrl` protection per agency.
- Publishing creates a clean internal Offer only after approval and explicit
  publish action.
- `/pescador` staff UI for the manual queue.

Deferred scope:

- Automated scraping/crawling.
- Supplier login/session automation.
- Background refresh jobs.
- Automatic publishing without human approval.
