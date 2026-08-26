# Commercial Batch 02

Batch 02 extends Commercial Cockpit and Customer 360 without implementing any
chat or WhatsApp integration.

Implemented scope:

- Dashboard indicators for proposal lifecycle, sale lifecycle, overdue
  receivables, cancelled bookings, and Pescador review queue.
- Customer 360 staff aggregation now includes opportunities, wishes,
  proposals, sales, bookings, trips, interactions, tasks, and financial data
  only when the caller is authorized for the existing financial route.
- Reusable bot-readiness query functions in `commercial-queries.ts` for
  follow-ups, proposals awaiting response, overdue receivables, upcoming trips,
  cancelled bookings, customer proposal status, customer bookings, and next
  departure.
- PipelineAccess behavior remains enforced by existing Commercial Cockpit
  access rules.

Deferred scope:

- WhatsApp/bot runtime.
- Message sending, conversation state, templates, or customer chat UI.
- Any bypass of staff/customer authorization boundaries.
