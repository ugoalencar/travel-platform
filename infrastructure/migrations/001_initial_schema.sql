-- ============================================================
-- INITIAL SCHEMA V1
-- Travel Platform
-- ============================================================
-- Prepared only. Do not apply without explicit approval.
-- Scope: V1 domain model only. No Booking, Pescador, GDS,
-- integrated payments, automatic matching, or multi-agency history.
-- ============================================================

-- Required for UUID-formatted defaults stored as TEXT, matching the current
-- Prisma schema fields declared as String without native @db.Uuid annotations.
-- Technical decision to confirm before production: pgcrypto must be allowed
-- in the target PostgreSQL environment.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE "Plan" AS ENUM ('FREE', 'BASIC', 'PRO', 'ENTERPRISE');

CREATE TYPE "Status" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

CREATE TYPE "UserRole" AS ENUM (
  'OWNER',
  'ADMIN',
  'MANAGER',
  'AGENT',
  'VIEWER'
);

CREATE TYPE "CustomerAccountStatus" AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'LOCKED'
);

CREATE TYPE "WishStatus" AS ENUM (
  'ACTIVE',
  'MATCHED',
  'PROPOSED',
  'FULFILLED',
  'EXPIRED',
  'CANCELLED'
);

CREATE TYPE "OfferStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED');

CREATE TYPE "ProposalStatus" AS ENUM (
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED'
);

CREATE TYPE "SaleStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'PAID',
  'CANCELLED',
  'REFUNDED'
);

CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

CREATE TYPE "TripStatus" AS ENUM (
  'PLANNED',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
);

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE agencies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  cnpj TEXT,
  email TEXT,
  phone TEXT,
  address JSONB,
  settings JSONB,
  plan "Plan" NOT NULL DEFAULT 'FREE',
  status "Status" NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT agencies_slug_key UNIQUE (slug),
  CONSTRAINT agencies_cnpj_key UNIQUE (cnpj)
);

CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role "UserRole" NOT NULL,
  password_hash TEXT NOT NULL,
  status "Status" NOT NULL DEFAULT 'ACTIVE',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT users_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT users_agency_email_key UNIQUE (agency_id, email),
  CONSTRAINT users_agency_id_key UNIQUE (agency_id, id)
);

CREATE TABLE brokers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  commission NUMERIC(5, 2) NOT NULL DEFAULT 0,
  status "Status" NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT brokers_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT brokers_commission_range_check
    CHECK (commission >= 0 AND commission <= 100),
  CONSTRAINT brokers_agency_email_key UNIQUE (agency_id, email),
  CONSTRAINT brokers_agency_id_key UNIQUE (agency_id, id)
);

CREATE TABLE customers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  cpf TEXT,
  passport TEXT,
  address JSONB,
  notes TEXT,
  status "Status" NOT NULL DEFAULT 'ACTIVE',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT customers_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customers_agency_id_key UNIQUE (agency_id, id)
);

CREATE TABLE customer_accounts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status "CustomerAccountStatus" NOT NULL DEFAULT 'ACTIVE',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT customer_accounts_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_accounts_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_accounts_agency_email_key UNIQUE (agency_id, email),
  CONSTRAINT customer_accounts_agency_customer_key UNIQUE (agency_id, customer_id)
);

CREATE TABLE wishes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  destination TEXT,
  start_date DATE,
  end_date DATE,
  budget NUMERIC(10, 2),
  travelers_count INTEGER,
  notes TEXT,
  status "WishStatus" NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT wishes_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT wishes_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT wishes_date_range_check
    CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date),
  CONSTRAINT wishes_budget_non_negative_check
    CHECK (budget IS NULL OR budget >= 0),
  CONSTRAINT wishes_travelers_count_positive_check
    CHECK (travelers_count IS NULL OR travelers_count > 0),
  CONSTRAINT wishes_agency_id_key UNIQUE (agency_id, id)
);

CREATE TABLE offers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  status "OfferStatus" NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT offers_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT offers_price_non_negative_check
    CHECK (price >= 0),
  CONSTRAINT offers_validity_range_check
    CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from <= valid_until),
  CONSTRAINT offers_agency_id_key UNIQUE (agency_id, id)
);

CREATE TABLE proposals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  offer_id TEXT,
  wish_id TEXT,
  user_id TEXT,
  proposed_price NUMERIC(10, 2) NOT NULL,
  discount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total NUMERIC(10, 2) NOT NULL,
  valid_until TIMESTAMPTZ,
  conditions TEXT,
  notes TEXT,
  status "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT proposals_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT proposals_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT proposals_offer_tenant_fk
    FOREIGN KEY (agency_id, offer_id) REFERENCES offers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT proposals_wish_tenant_fk
    FOREIGN KEY (agency_id, wish_id) REFERENCES wishes (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT proposals_user_tenant_fk
    FOREIGN KEY (agency_id, user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT proposals_values_non_negative_check
    CHECK (proposed_price >= 0 AND discount >= 0 AND total >= 0),
  CONSTRAINT proposals_agency_id_key UNIQUE (agency_id, id)
);

CREATE TABLE sales (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  proposal_id TEXT,
  broker_id TEXT,
  user_id TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  discount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total NUMERIC(10, 2) NOT NULL,
  status "SaleStatus" NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sales_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT sales_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT sales_proposal_tenant_fk
    FOREIGN KEY (agency_id, proposal_id) REFERENCES proposals (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT sales_broker_tenant_fk
    FOREIGN KEY (agency_id, broker_id) REFERENCES brokers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT sales_user_tenant_fk
    FOREIGN KEY (agency_id, user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT sales_values_non_negative_check
    CHECK (amount >= 0 AND discount >= 0 AND total >= 0),
  CONSTRAINT sales_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT sales_agency_proposal_key UNIQUE (agency_id, proposal_id)
);

CREATE TABLE commissions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  broker_id TEXT,
  user_id TEXT,
  amount NUMERIC(10, 2) NOT NULL,
  percentage NUMERIC(5, 2),
  status "CommissionStatus" NOT NULL DEFAULT 'PENDING',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT commissions_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commissions_sale_tenant_fk
    FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commissions_broker_tenant_fk
    FOREIGN KEY (agency_id, broker_id) REFERENCES brokers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commissions_user_tenant_fk
    FOREIGN KEY (agency_id, user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commissions_amount_non_negative_check
    CHECK (amount >= 0),
  CONSTRAINT commissions_percentage_range_check
    CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100))
);

CREATE TABLE trips (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  sale_id TEXT,
  name TEXT NOT NULL,
  destination TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status "TripStatus" NOT NULL DEFAULT 'PLANNED',
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT trips_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT trips_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT trips_sale_tenant_fk
    FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT trips_date_range_check
    CHECK (start_date <= end_date),
  CONSTRAINT trips_agency_sale_key UNIQUE (agency_id, sale_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE UNIQUE INDEX customers_agency_cpf_active_key
  ON customers (agency_id, cpf)
  WHERE cpf IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX customers_agency_email_active_key
  ON customers (agency_id, email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX users_agency_idx ON users (agency_id);
CREATE INDEX brokers_agency_idx ON brokers (agency_id);

CREATE INDEX customers_agency_idx ON customers (agency_id);
CREATE INDEX customers_agency_cpf_idx ON customers (agency_id, cpf);
CREATE INDEX customers_agency_email_idx ON customers (agency_id, email);
CREATE INDEX customers_agency_name_idx ON customers (agency_id, name);

CREATE INDEX customer_accounts_agency_idx ON customer_accounts (agency_id);

CREATE INDEX wishes_agency_idx ON wishes (agency_id);
CREATE INDEX wishes_agency_customer_idx ON wishes (agency_id, customer_id);
CREATE INDEX wishes_agency_status_idx ON wishes (agency_id, status);
CREATE INDEX wishes_agency_start_date_idx ON wishes (agency_id, start_date);

CREATE INDEX offers_agency_idx ON offers (agency_id);
CREATE INDEX offers_agency_status_idx ON offers (agency_id, status);
CREATE INDEX offers_agency_valid_until_idx ON offers (agency_id, valid_until);

CREATE INDEX proposals_agency_idx ON proposals (agency_id);
CREATE INDEX proposals_agency_customer_idx ON proposals (agency_id, customer_id);
CREATE INDEX proposals_agency_status_idx ON proposals (agency_id, status);
CREATE INDEX proposals_agency_valid_until_idx ON proposals (agency_id, valid_until);

CREATE INDEX sales_agency_idx ON sales (agency_id);
CREATE INDEX sales_agency_customer_idx ON sales (agency_id, customer_id);
CREATE INDEX sales_agency_status_idx ON sales (agency_id, status);
CREATE INDEX sales_agency_created_at_idx ON sales (agency_id, created_at);

CREATE INDEX commissions_agency_idx ON commissions (agency_id);
CREATE INDEX commissions_agency_sale_idx ON commissions (agency_id, sale_id);
CREATE INDEX commissions_agency_status_idx ON commissions (agency_id, status);

CREATE INDEX trips_agency_idx ON trips (agency_id);
CREATE INDEX trips_agency_customer_idx ON trips (agency_id, customer_id);
CREATE INDEX trips_agency_status_idx ON trips (agency_id, status);
CREATE INDEX trips_agency_start_date_idx ON trips (agency_id, start_date);
