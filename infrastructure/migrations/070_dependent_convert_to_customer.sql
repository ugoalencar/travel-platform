-- ============================================================
-- CONVERT A DEPENDENT/COMPANION INTO A REAL CUSTOMER
-- ============================================================
-- Requested directly: "em acompanhantes coloque uma opção Cliente
-- assim ao mesmo tempo que ele é um acompanhante ele vira um cliente e
-- entra na mira de ofertas" -- an adult companion (customer_dependents
-- row) can be promoted into a real, independent `customers` row (so
-- they show up in Clientes/Propostas/Vendas/Ofertas like anyone else)
-- while the original dependent record is kept and linked, rather than
-- deleted -- the companion relationship to the original customer still
-- matters for trip planning even after they become a customer in their
-- own right.
-- ============================================================

ALTER TABLE customer_dependents ADD COLUMN converted_customer_id TEXT;

ALTER TABLE customer_dependents ADD CONSTRAINT customer_dependents_converted_customer_tenant_fk
  FOREIGN KEY (agency_id, converted_customer_id) REFERENCES customers (agency_id, id)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- A given customer row can only be the conversion target of one
-- dependent record -- prevents two different companions accidentally
-- linking to the same customer.
CREATE UNIQUE INDEX customer_dependents_converted_customer_unique_idx
  ON customer_dependents (agency_id, converted_customer_id)
  WHERE converted_customer_id IS NOT NULL;
