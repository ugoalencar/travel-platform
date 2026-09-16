-- ============================================================
-- DEPENDENT POWER OF ATTORNEY (PROCURAÇÃO)
-- ============================================================
-- Requested directly: dependents should be reserved for minors
-- (menores de idade) traveling with the customer, and in some cases a
-- minor travels with power of attorney / authorization that may itself
-- require a judge's document (some countries/routes require notarized
-- or judicial travel authorization when a minor travels without both
-- legal guardians) -- "e bom pra lembrar". Adult travel companions get
-- their own tab (Acompanhantes) instead of being mixed into the same
-- list, per the same request.
-- ============================================================

ALTER TABLE customer_dependents ADD COLUMN has_power_of_attorney BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customer_dependents ADD COLUMN power_of_attorney_notes TEXT;
