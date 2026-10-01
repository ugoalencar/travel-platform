# Travel Lite Costs and Margin

## Decision

`sale_cost_items` is the operational source for direct sale costs.

`sales.cost_amount` and `sales.margin_amount` remain as materialized summary fields for compatibility with existing sales, reports, and commission code.

## Rule

- `total_cost = sum(sale_cost_items.amount)` for a sale with cost items.
- `sales.cost_amount` is recalculated server-side after each cost item change.
- `sales.margin_amount = sales.gross_amount - sales.cost_amount`.
- Frontend calculations are display-only and are never authoritative.
- Existing sales without cost items keep their legacy `sales.cost_amount` until a cost-item migration or manual cost entry is performed.

## Constraints

- Direct costs can only be added to `DRAFT` sales.
- Direct cost total cannot exceed `gross_amount`.
- Confirming a sale still uses the existing official sale confirmation flow.
- Commission rules are unchanged; margin-based commissions read the server-side `sales.margin_amount`.
- Optional payables generated from sale costs link back through:
  `payment -> payable -> sale_cost_item -> sale -> financial_party`.
