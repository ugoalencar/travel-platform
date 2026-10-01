-- ============================================================
-- TRAVEL LITE — 001_initial_schema.sql
-- Banco dedicado do Travel Lite (independente do banco principal
-- da Travel Platform; migrations próprias, numeração própria).
-- Colunas em snake_case inglês para maximizar compatibilidade futura
-- com a Travel Platform (mapeamento em docs/travel-lite/INTEGRATION-MAPPING.md).
-- ============================================================

-- ------------------------------------------------------------
-- TENANTS & AUTH
-- ------------------------------------------------------------

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  external_id TEXT,
  source_system TEXT NOT NULL DEFAULT 'TRAVEL_LITE',
  sync_status TEXT NOT NULL DEFAULT 'NOT_SYNCED'
    CHECK (sync_status IN ('NOT_SYNCED', 'SYNCED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, id)
);

CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id)
);

CREATE INDEX idx_auth_sessions_user ON auth_sessions (tenant_id, user_id);

-- Per-tenant sequences (sale_number etc.). Rows are locked with
-- SELECT ... FOR UPDATE by the application before incrementing.
CREATE TABLE tenant_sequences (
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  key TEXT NOT NULL,
  next_value BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, key)
);

-- ------------------------------------------------------------
-- CADASTROS
-- ------------------------------------------------------------

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  name TEXT NOT NULL,
  cpf TEXT,
  birth_date DATE,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  zip_code TEXT,
  street TEXT,
  number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  external_id TEXT,
  source_system TEXT NOT NULL DEFAULT 'TRAVEL_LITE',
  sync_status TEXT NOT NULL DEFAULT 'NOT_SYNCED'
    CHECK (sync_status IN ('NOT_SYNCED', 'SYNCED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX idx_customers_tenant_name ON customers (tenant_id, name);
CREATE INDEX idx_customers_tenant_cpf ON customers (tenant_id, cpf) WHERE cpf IS NOT NULL;

CREATE TABLE sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  -- Vendedor é entidade comercial; user é identidade de acesso.
  -- O vínculo é opcional (vendedor sem login) e sempre tenant-safe.
  user_id UUID,
  name TEXT NOT NULL,
  cpf TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  commission_rule_type TEXT NOT NULL DEFAULT 'UNDEFINED'
    CHECK (commission_rule_type IN ('UNDEFINED', 'PERCENTAGE_ON_GROSS', 'PERCENTAGE_ON_MARGIN', 'FIXED')),
  commission_rate NUMERIC(7, 4) CHECK (commission_rate IS NULL OR commission_rate >= 0),
  commission_fixed_amount NUMERIC(14, 2)
    CHECK (commission_fixed_amount IS NULL OR commission_fixed_amount >= 0),
  external_id TEXT,
  source_system TEXT NOT NULL DEFAULT 'TRAVEL_LITE',
  sync_status TEXT NOT NULL DEFAULT 'NOT_SYNCED'
    CHECK (sync_status IN ('NOT_SYNCED', 'SYNCED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id),
  -- Regras coerentes: FIXED exige valor fixo; percentuais exigem taxa;
  -- valor fixo só existe na regra FIXED.
  CHECK (commission_rule_type <> 'FIXED' OR commission_fixed_amount IS NOT NULL),
  CHECK (commission_rule_type NOT IN ('PERCENTAGE_ON_GROSS', 'PERCENTAGE_ON_MARGIN') OR commission_rate IS NOT NULL),
  CHECK (commission_fixed_amount IS NULL OR commission_rule_type = 'FIXED'),
  UNIQUE (tenant_id, id)
);

CREATE INDEX idx_sellers_tenant_status ON sellers (tenant_id, status);

CREATE TABLE sale_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, id)
);

CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, id)
);

-- ------------------------------------------------------------
-- VENDAS
-- ------------------------------------------------------------

CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  customer_id UUID NOT NULL,
  seller_id UUID NOT NULL,
  category_id UUID NOT NULL,
  sale_number TEXT NOT NULL,
  description TEXT,
  gross_amount NUMERIC(14, 2) NOT NULL CHECK (gross_amount >= 0),
  cost_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (cost_amount >= 0),
  margin_amount NUMERIC(14, 2) NOT NULL CHECK (margin_amount >= 0),
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  installment_count INT NOT NULL DEFAULT 1 CHECK (installment_count >= 1),
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')),
  payment_method_id UUID,
  notes TEXT,
  external_id TEXT,
  source_system TEXT NOT NULL DEFAULT 'TRAVEL_LITE',
  sync_status TEXT NOT NULL DEFAULT 'NOT_SYNCED'
    CHECK (sync_status IN ('NOT_SYNCED', 'SYNCED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, id),
  FOREIGN KEY (tenant_id, seller_id) REFERENCES sellers (tenant_id, id),
  FOREIGN KEY (tenant_id, category_id) REFERENCES sale_categories (tenant_id, id),
  FOREIGN KEY (tenant_id, payment_method_id) REFERENCES payment_methods (tenant_id, id),
  -- Margem é derivada no servidor: gross - cost.
  CHECK (margin_amount = gross_amount - cost_amount),
  UNIQUE (tenant_id, sale_number),
  UNIQUE (tenant_id, id)
);

CREATE INDEX idx_sales_tenant_sale_date ON sales (tenant_id, sale_date);
CREATE INDEX idx_sales_tenant_status ON sales (tenant_id, status);
CREATE INDEX idx_sales_tenant_customer ON sales (tenant_id, customer_id);
CREATE INDEX idx_sales_tenant_seller ON sales (tenant_id, seller_id);
CREATE INDEX idx_sales_tenant_category ON sales (tenant_id, category_id);

-- ------------------------------------------------------------
-- COMISSÕES
-- ------------------------------------------------------------

CREATE TABLE seller_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  sale_id UUID NOT NULL,
  seller_id UUID NOT NULL,
  -- Snapshot da regra vigente no momento do cálculo. Regra futura do
  -- vendedor NUNCA recalcula esta linha.
  calculation_type TEXT
    CHECK (calculation_type IS NULL
           OR calculation_type IN ('PERCENTAGE_ON_GROSS', 'PERCENTAGE_ON_MARGIN', 'FIXED', 'MANUAL')),
  calculation_base NUMERIC(14, 2) CHECK (calculation_base IS NULL OR calculation_base >= 0),
  percentage NUMERIC(7, 4) CHECK (percentage IS NULL OR percentage >= 0),
  fixed_amount NUMERIC(14, 2) CHECK (fixed_amount IS NULL OR fixed_amount >= 0),
  rule_snapshot JSONB,
  commission_amount NUMERIC(14, 2) CHECK (commission_amount IS NULL OR commission_amount >= 0),
  status TEXT NOT NULL DEFAULT 'PENDING_RULE'
    CHECK (status IN ('PENDING_RULE', 'PENDING', 'APPROVED', 'PAID', 'CANCELLED')),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  external_id TEXT,
  source_system TEXT NOT NULL DEFAULT 'TRAVEL_LITE',
  sync_status TEXT NOT NULL DEFAULT 'NOT_SYNCED'
    CHECK (sync_status IN ('NOT_SYNCED', 'SYNCED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, sale_id) REFERENCES sales (tenant_id, id),
  FOREIGN KEY (tenant_id, seller_id) REFERENCES sellers (tenant_id, id),
  -- Sem regra definida não existe valor: nunca gravar R$ 0 "válido".
  CHECK (status = 'PENDING_RULE' OR commission_amount IS NOT NULL),
  CHECK (status <> 'PENDING_RULE' OR (commission_amount IS NULL AND calculation_type IS NULL)),
  CHECK (status <> 'PAID' OR paid_at IS NOT NULL),
  UNIQUE (tenant_id, id)
);

-- Apenas uma comissão ativa por venda+vendedor.
CREATE UNIQUE INDEX ux_seller_commissions_active
  ON seller_commissions (tenant_id, sale_id, seller_id)
  WHERE status <> 'CANCELLED';

CREATE INDEX idx_seller_commissions_tenant_status ON seller_commissions (tenant_id, status);
CREATE INDEX idx_seller_commissions_tenant_seller ON seller_commissions (tenant_id, seller_id);

-- ------------------------------------------------------------
-- FINANCEIRO
-- ------------------------------------------------------------

CREATE TABLE financial_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'CASH' CHECK (type IN ('BANK', 'CASH', 'WALLET')),
  initial_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, id)
);

CREATE TABLE financial_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, id)
);

CREATE TABLE receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  -- Relação com a venda é opcional (recebível avulso), mas quando
  -- existe, a parcela é identificada por (tenant_id, sale_id, installment_number).
  sale_id UUID,
  installment_number INT,
  installment_count INT,
  customer_id UUID,
  description TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  due_at DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')),
  external_id TEXT,
  source_system TEXT NOT NULL DEFAULT 'TRAVEL_LITE',
  sync_status TEXT NOT NULL DEFAULT 'NOT_SYNCED'
    CHECK (sync_status IN ('NOT_SYNCED', 'SYNCED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, sale_id) REFERENCES sales (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, id),
  CHECK (paid_amount <= amount),
  CHECK (sale_id IS NULL OR (installment_number IS NOT NULL AND installment_count IS NOT NULL)),
  CHECK (installment_number IS NULL OR installment_number >= 1),
  CHECK (installment_count IS NULL OR installment_count >= 1),
  CHECK (status <> 'PAID' OR paid_amount = amount),
  CHECK (status <> 'CANCELLED' OR paid_amount = 0),
  UNIQUE (tenant_id, id)
);

-- Parcelamento: múltiplos receivables por venda, uma linha por parcela.
CREATE UNIQUE INDEX ux_receivables_sale_installment
  ON receivables (tenant_id, sale_id, installment_number)
  WHERE sale_id IS NOT NULL;

CREATE INDEX idx_receivables_tenant_status_due ON receivables (tenant_id, status, due_at);
CREATE INDEX idx_receivables_tenant_sale ON receivables (tenant_id, sale_id) WHERE sale_id IS NOT NULL;
CREATE INDEX idx_receivables_tenant_customer ON receivables (tenant_id, customer_id);

CREATE TABLE payables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  category_id UUID,
  seller_id UUID,
  commission_id UUID,
  supplier_name TEXT,
  description TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  due_at DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')),
  external_id TEXT,
  source_system TEXT NOT NULL DEFAULT 'TRAVEL_LITE',
  sync_status TEXT NOT NULL DEFAULT 'NOT_SYNCED'
    CHECK (sync_status IN ('NOT_SYNCED', 'SYNCED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, category_id) REFERENCES financial_categories (tenant_id, id),
  FOREIGN KEY (tenant_id, seller_id) REFERENCES sellers (tenant_id, id),
  FOREIGN KEY (tenant_id, commission_id) REFERENCES seller_commissions (tenant_id, id),
  CHECK (paid_amount <= amount),
  CHECK (status <> 'PAID' OR paid_amount = amount),
  CHECK (status <> 'CANCELLED' OR paid_amount = 0),
  UNIQUE (tenant_id, id)
);

CREATE INDEX idx_payables_tenant_status_due ON payables (tenant_id, status, due_at);
CREATE INDEX idx_payables_tenant_commission ON payables (tenant_id, commission_id)
  WHERE commission_id IS NOT NULL;

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
  account_id UUID NOT NULL,
  category_id UUID,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  method TEXT,
  reference TEXT,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, account_id) REFERENCES financial_accounts (tenant_id, id),
  FOREIGN KEY (tenant_id, category_id) REFERENCES financial_categories (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id),
  UNIQUE (tenant_id, id)
);

CREATE INDEX idx_payments_tenant_paid_at ON payments (tenant_id, paid_at);

CREATE TABLE payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  payment_id UUID NOT NULL,
  receivable_id UUID,
  payable_id UUID,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, payment_id) REFERENCES payments (tenant_id, id),
  FOREIGN KEY (tenant_id, receivable_id) REFERENCES receivables (tenant_id, id),
  FOREIGN KEY (tenant_id, payable_id) REFERENCES payables (tenant_id, id),
  -- Exatamente um alvo por alocação.
  CHECK ((CASE WHEN receivable_id IS NULL THEN 0 ELSE 1 END)
       + (CASE WHEN payable_id IS NULL THEN 0 ELSE 1 END) = 1)
);

CREATE INDEX idx_payment_allocations_receivable ON payment_allocations (tenant_id, receivable_id);
CREATE INDEX idx_payment_allocations_payable ON payment_allocations (tenant_id, payable_id);
CREATE INDEX idx_payment_allocations_payment ON payment_allocations (tenant_id, payment_id);

-- Ledger financeiro: imutável (sem UPDATE/DELETE concedidos ao runtime).
CREATE TABLE financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  account_id UUID NOT NULL,
  category_id UUID,
  payment_id UUID,
  type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  occurred_at DATE NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, account_id) REFERENCES financial_accounts (tenant_id, id),
  FOREIGN KEY (tenant_id, category_id) REFERENCES financial_categories (tenant_id, id),
  FOREIGN KEY (tenant_id, payment_id) REFERENCES payments (tenant_id, id)
);

CREATE INDEX idx_financial_transactions_tenant_occurred ON financial_transactions (tenant_id, occurred_at);

-- ------------------------------------------------------------
-- INTEGRATION OUTBOX (Gateway — preparação para sync futuro)
-- ------------------------------------------------------------

CREATE TABLE integration_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'CUSTOMER_CREATED', 'CUSTOMER_UPDATED',
    'SELLER_CREATED', 'SELLER_UPDATED',
    'SALE_CATEGORY_CREATED', 'SALE_CATEGORY_UPDATED', 'SALE_CATEGORY_DELETED',
    'SALE_CREATED', 'SALE_UPDATED', 'SALE_CONFIRMED', 'SALE_CANCELLED',
    'COMMISSION_CREATED', 'COMMISSION_UPDATED', 'COMMISSION_PAID',
    'RECEIVABLE_CREATED',
    'PAYMENT_RECEIVED',
    'PAYABLE_CREATED', 'EXPENSE_PAID',
    'ACCOUNT_CREATED', 'ACCOUNT_UPDATED',
    'FINANCIAL_CATEGORY_CREATED', 'FINANCIAL_CATEGORY_UPDATED',
    'PAYMENT_METHOD_CREATED', 'PAYMENT_METHOD_UPDATED'
  )),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  external_id TEXT,
  source_system TEXT NOT NULL DEFAULT 'TRAVEL_LITE',
  sync_status TEXT NOT NULL DEFAULT 'NOT_SYNCED'
    CHECK (sync_status IN ('NOT_SYNCED', 'SYNCED', 'FAILED')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_integration_outbox_tenant_status ON integration_outbox (tenant_id, status, created_at);

-- ------------------------------------------------------------
-- AUDIT (append-only)
-- ------------------------------------------------------------

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  user_id UUID,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_tenant_created ON audit_logs (tenant_id, created_at);
CREATE INDEX idx_audit_logs_tenant_entity ON audit_logs (tenant_id, entity_type, entity_id);
