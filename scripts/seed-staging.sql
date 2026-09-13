-- ============================================================
-- TRAVEL PLATFORM — STAGING SEED SCRIPT (v2 — schema-correct)
-- ============================================================
-- Gera dados sintéticos para 2 tenants com todas as roles
-- e fluxos de negócio cobertos.
--
-- USO:
--   psql $DATABASE_URL -f scripts/seed-staging.sql
--
-- REGRAS:
--   - Dados sintéticos (nada real)
--   - 2 tenants isolados (cross-tenant testável)
--   - Todos os roles: OWNER, ADMIN, MANAGER, AGENT, VIEWER
--   - Fluxo completo: customer → wish → offer → proposal → booking → trip
--   - Financeiro: sale → receivable → payment → payable
--   - Employee + commission plan
-- ============================================================

-- IDs fixos para reprodutibilidade (dev-auth pattern)
-- Tenant A: Agency Alpha
-- Tenant B: Agency Beta

-- ============================================================
-- 1. AGENCIES (2 tenants)
-- ============================================================

INSERT INTO agencies (id, name, slug, cnpj, email, phone, plan, status)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'Agency Alpha', 'agency-alpha', '11.111.111/0001-01', 'alpha@test.com', '+5511999990001', 'PRO', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000001', 'Agency Beta', 'agency-beta', '22.222.222/0001-02', 'beta@test.com', '+5511999990002', 'BASIC', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. USERS (4 roles × 2 tenants = 8 users)
-- Password: sha256 of "staging-test-password" (placeholder)
-- ============================================================

-- Placeholder password hash (sha256 of "test")
-- In real auth: use bcrypt or similar
INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
VALUES
  -- Tenant A (Alpha)
  ('10000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', 'owner.alpha@test.com', 'Owner Alpha', 'OWNER', 'staging-password-hash', 'ACTIVE'),
  ('10000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'admin.alpha@test.com', 'Admin Alpha', 'ADMIN', 'staging-password-hash', 'ACTIVE'),
  ('10000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'manager.alpha@test.com', 'Manager Alpha', 'MANAGER', 'staging-password-hash', 'ACTIVE'),
  ('10000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', 'agent.alpha@test.com', 'Agent Alpha', 'AGENT', 'staging-password-hash', 'ACTIVE'),
  ('10000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', 'viewer.alpha@test.com', 'Viewer Alpha', 'VIEWER', 'staging-password-hash', 'ACTIVE'),
  -- Tenant B (Beta)
  ('20000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000001', 'owner.beta@test.com', 'Owner Beta', 'OWNER', 'staging-password-hash', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000001', 'admin.beta@test.com', 'Admin Beta', 'ADMIN', 'staging-password-hash', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000001', 'agent.beta@test.com', 'Agent Beta', 'AGENT', 'staging-password-hash', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. CUSTOMERS (3 per tenant)
-- ============================================================

INSERT INTO customers (id, agency_id, name, email, phone, cpf, passport, status)
VALUES
  -- Tenant A
  ('10000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000001', 'João Silva', 'joao@test.com', '+5511988880001', '111.111.111-00', 'AB123456', 'ACTIVE'),
  ('10000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000001', 'Maria Santos', 'maria@test.com', '+5511988880002', '222.222.222-00', 'CD789012', 'ACTIVE'),
  ('10000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000001', 'Pedro Costa', 'pedro@test.com', '+5511988880003', '333.333.333-00', 'EF345678', 'ACTIVE'),
  -- Tenant B
  ('20000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000001', 'Ana Oliveira', 'ana@test.com', '+5511977770001', '444.444.444-00', 'GH901234', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000001', 'Lucas Ferreira', 'lucas@test.com', '+5511977770002', '555.555.555-00', 'IJ567890', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. CUSTOMER ACCOUNTS (portal access)
-- ============================================================

INSERT INTO customer_accounts (id, agency_id, customer_id, email, password_hash, status)
VALUES
  ('10000000-0000-0000-0000-000000000030', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000020', 'joao@test.com', 'staging-password-hash', 'ACTIVE'),
  ('10000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000021', 'maria@test.com', 'staging-password-hash', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. BROKERS (1 per tenant)
-- ============================================================

INSERT INTO brokers (id, agency_id, name, email, phone, commission, status)
VALUES
  ('10000000-0000-0000-0000-000000000040', '10000000-0000-0000-0000-000000000001', 'Broker Alpha', 'broker.alpha@test.com', '+5511966660001', 5.00, 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000040', '20000000-0000-0000-0000-000000000001', 'Broker Beta', 'broker.beta@test.com', '+5511966660002', 3.50, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 6. TRANSPORT (routes, suppliers, products, departures)
-- ============================================================

-- Routes
INSERT INTO routes (id, agency_id, origin, destination, estimated_duration, distance, active)
VALUES
  ('10000000-0000-0000-0000-000000000050', '10000000-0000-0000-0000-000000000001', 'São Paulo', 'Cancun', 360, 7500.00, true),
  ('10000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000001', 'Cancun', 'São Paulo', 390, 7500.00, true),
  ('20000000-0000-0000-0000-000000000050', '20000000-0000-0000-0000-000000000001', 'Rio de Janeiro', 'Miami', 420, 6700.00, true)
ON CONFLICT (id) DO NOTHING;

-- Route points (checkpoint_type required when checkpoint_required=true)
INSERT INTO route_points (id, agency_id, route_id, sequence, name, checkpoint_required, checkpoint_type, planned_offset_minutes)
VALUES
  ('10000000-0000-0000-0000-000000000060', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000050', 1, 'GRU - São Paulo', true, 'DEPARTURE', 0),
  ('10000000-0000-0000-0000-000000000061', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000050', 2, 'CUN - Cancun', true, 'ARRIVAL', 360)
ON CONFLICT (id) DO NOTHING;

-- Suppliers
INSERT INTO suppliers (id, agency_id, name, document, contact, active)
VALUES
  ('10000000-0000-0000-0000-000000000070', '10000000-0000-0000-0000-000000000001', 'Latam Airlines', '11.111.111/0001-99', 'commercial@latam.test.com', true),
  ('10000000-0000-0000-0000-000000000071', '10000000-0000-0000-0000-000000000001', 'Hilton Cancun', '22.222.222/0002-88', 'reservations@hilton.test.com', true),
  ('20000000-0000-0000-0000-000000000070', '20000000-0000-0000-0000-000000000001', 'Gol Linhas', '33.333.333/0003-77', 'contracts@gol.test.com', true)
ON CONFLICT (id) DO NOTHING;

-- Transport products (ROUND_TRIP requires return_route_id)
INSERT INTO transport_products (id, agency_id, name, trip_type, outbound_route_id, return_route_id, price, active, publicly_bookable)
VALUES
  ('10000000-0000-0000-0000-000000000080', '10000000-0000-0000-0000-000000000001', 'Pacote Cancun All Inclusive', 'ROUND_TRIP', '10000000-0000-0000-0000-000000000050', '10000000-0000-0000-0000-000000000051', 4500.00, true, true)
ON CONFLICT (id) DO NOTHING;

-- Scheduled departures
INSERT INTO scheduled_departures (id, agency_id, product_id, departure_at, arrival_expected_at, capacity, supplier_id, service_type, cancelled)
VALUES
  ('10000000-0000-0000-0000-000000000090', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000080', '2026-10-15 08:00:00-03', '2026-10-15 14:00:00-05', 200, '10000000-0000-0000-0000-000000000070', 'OWN', false),
  ('10000000-0000-0000-0000-000000000091', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000080', '2026-10-22 08:00:00-03', '2026-10-22 14:00:00-05', 200, '10000000-0000-0000-0000-000000000070', 'OWN', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 7. WISHES
-- ============================================================

INSERT INTO wishes (id, agency_id, customer_id, destination, start_date, end_date, budget, travelers_count, notes, status)
VALUES
  ('10000000-0000-0000-0000-000000000100', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000020', 'Cancun', '2026-10-15', '2026-10-22', 15000.00, 2, 'Lua de mel', 'ACTIVE'),
  ('10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000021', 'Miami', '2026-11-01', '2026-11-07', 8000.00, 1, 'Viagem de negócios', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000100', '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000020', 'Rio de Janeiro', '2026-12-20', '2026-12-27', 5000.00, 4, 'Férias em família', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 8. OFFERS
-- ============================================================

INSERT INTO offers (id, agency_id, name, description, price, valid_from, valid_until, status)
VALUES
  ('10000000-0000-0000-0000-000000000110', '10000000-0000-0000-0000-000000000001', 'Cancun All Inclusive 7 noites', 'Pacote completo com voo + hotel + transfer', 12000.00, '2026-09-01', '2026-12-31', 'ACTIVE'),
  ('10000000-0000-0000-0000-000000000111', '10000000-0000-0000-0000-000000000001', 'Miami Business 5 noites', 'Voo + hotel 5 estrelas', 8500.00, '2026-09-01', '2026-12-31', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000110', '20000000-0000-0000-0000-000000000001', 'Rio Réveillon 2027', 'Pacote especial de fim de ano', 6000.00, '2026-09-01', '2026-12-15', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 9. PROPOSALS
-- ============================================================

INSERT INTO proposals (id, agency_id, customer_id, offer_id, wish_id, user_id, proposed_price, discount, total, valid_until, status)
VALUES
  ('10000000-0000-0000-0000-000000000120', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000110', '10000000-0000-0000-0000-000000000100', '10000000-0000-0000-0000-000000000013', 12000.00, 500.00, 11500.00, '2026-09-30', 'SENT'),
  ('20000000-0000-0000-0000-000000000120', '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000110', '20000000-0000-0000-0000-000000000100', '20000000-0000-0000-0000-000000000012', 6000.00, 0.00, 6000.00, '2026-10-31', 'DRAFT')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 10. SALES
-- ============================================================

INSERT INTO sales (id, agency_id, customer_id, proposal_id, broker_id, user_id, amount, discount, total, status, paid_at)
VALUES
  ('10000000-0000-0000-0000-000000000130', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000120', '10000000-0000-0000-0000-000000000040', '10000000-0000-0000-0000-000000000013', 12000.00, 500.00, 11500.00, 'CONFIRMED', '2026-09-12 10:00:00-03')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 11. TRIPS
-- ============================================================

INSERT INTO trips (id, agency_id, customer_id, sale_id, name, destination, start_date, end_date, status)
VALUES
  ('10000000-0000-0000-0000-000000000140', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000130', 'Lua de Mel Cancun', 'Cancun', '2026-10-15', '2026-10-22', 'PLANNED')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 12. BOOKINGS
-- ============================================================

INSERT INTO bookings (id, agency_id, booker_customer_id, trip_type, outbound_departure_id, return_departure_id, cancelled)
VALUES
  ('10000000-0000-0000-0000-000000000150', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000020', 'ROUND_TRIP', '10000000-0000-0000-0000-000000000090', '10000000-0000-0000-0000-000000000091', false)
ON CONFLICT (id) DO NOTHING;

-- Booking passengers
INSERT INTO booking_passengers (id, agency_id, booking_id, name, notes)
VALUES
  ('10000000-0000-0000-0000-000000000160', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000150', 'João Silva', 'Noivo'),
  ('10000000-0000-0000-0000-000000000161', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000150', 'Maria Santos', 'Noiva')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 13. AIR SERVICES
-- ============================================================

INSERT INTO air_services (id, agency_id, trip_id, customer_id, airline, direction, sequence, origin, destination, departure_date, arrival_date, cabin_class, fare, taxes, cost, sale_value, currency, supplier_payment_status, status)
VALUES
  ('10000000-0000-0000-0000-000000000170', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000140', '10000000-0000-0000-0000-000000000020', 'LATAM', 'OUTBOUND', 1, 'GRU', 'CUN', '2026-10-15', '2026-10-15', 'ECONOMY', 3500.00, 450.00, 3500.00, 3950.00, 'BRL', 'OPEN', 'CONFIRMED'),
  ('10000000-0000-0000-0000-000000000171', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000140', '10000000-0000-0000-0000-000000000020', 'LATAM', 'RETURN', 1, 'CUN', 'GRU', '2026-10-22', '2026-10-22', 'ECONOMY', 3500.00, 450.00, 3500.00, 3950.00, 'BRL', 'OPEN', 'PENDING')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 14. FINANCIAL CATEGORIES & COST CENTERS
-- ============================================================

INSERT INTO financial_categories (id, agency_id, name, type, is_active)
VALUES
  ('10000000-0000-0000-0000-000000000180', '10000000-0000-0000-0000-000000000001', 'Passagens Aereas', 'REVENUE', true),
  ('10000000-0000-0000-0000-000000000181', '10000000-0000-0000-0000-000000000001', 'Hoteis', 'REVENUE', true),
  ('10000000-0000-0000-0000-000000000182', '10000000-0000-0000-0000-000000000001', 'Transfer', 'EXPENSE', true),
  ('10000000-0000-0000-0000-000000000183', '10000000-0000-0000-0000-000000000001', 'Comissoes', 'EXPENSE', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO cost_centers (id, agency_id, name, code, active)
VALUES
  ('10000000-0000-0000-0000-000000000190', '10000000-0000-0000-0000-000000000001', 'Operações', 'OPER', true),
  ('10000000-0000-0000-0000-000000000191', '10000000-0000-0000-0000-000000000001', 'Administrativo', 'ADM', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 15. RECEIVABLES / PAYABLES / PAYMENTS
-- ============================================================

INSERT INTO receivables (id, agency_id, sale_id, customer_id, description, amount, due_at, status, category_id, cost_center_id)
VALUES
  ('10000000-0000-0000-0000-000000000200', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000130', '10000000-0000-0000-0000-000000000020', 'Pacote Cancun - Parcela 1/3', 3833.33, '2026-09-20', 'OPEN', '10000000-0000-0000-0000-000000000180', '10000000-0000-0000-0000-000000000190')
ON CONFLICT (id) DO NOTHING;

INSERT INTO payables (id, agency_id, sale_id, supplier_id, description, amount, due_at, status, category_id, cost_center_id)
VALUES
  ('10000000-0000-0000-0000-000000000210', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000130', '10000000-0000-0000-0000-000000000070', 'Voo GRU-CUN ida e volta', 7900.00, '2026-10-01', 'OPEN', '10000000-0000-0000-0000-000000000180', '10000000-0000-0000-0000-000000000190'),
  ('10000000-0000-0000-0000-000000000211', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000130', '10000000-0000-0000-0000-000000000071', 'Hotel 7 noites All Inclusive', 4200.00, '2026-10-15', 'OPEN', '10000000-0000-0000-0000-000000000181', '10000000-0000-0000-0000-000000000190')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 16. EMPLOYEES & COMMISSION PLANS
-- ============================================================

INSERT INTO commission_plans (id, agency_id, name, calculation_type, percentage, active)
VALUES
  ('10000000-0000-0000-0000-000000000220', '10000000-0000-0000-0000-000000000001', 'Comissão Padrão', 'PERCENT_SALE', 5.00, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO employees (id, agency_id, name, email, hire_date, employment_type, role_title, department, status, base_salary, user_id, default_commission_plan_id)
VALUES
  ('10000000-0000-0000-0000-000000000230', '10000000-0000-0000-0000-000000000001', 'Carlos Vendedor', 'carlos.alpha@test.com', '2025-01-15', 'EMPLOYEE', 'Consultor de Viagens', 'Comercial', 'ACTIVE', 3500.00, '10000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000220')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 17. COMMISSIONS
-- ============================================================

INSERT INTO commissions (id, agency_id, sale_id, user_id, amount, percentage, status)
VALUES
  ('10000000-0000-0000-0000-000000000240', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000130', '10000000-0000-0000-0000-000000000013', 575.00, 5.00, 'PENDING')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 18. COMMERCIAL COCKPIT (pipelines, opportunities)
-- ============================================================

INSERT INTO pipelines (id, agency_id, name, active)
VALUES
  ('10000000-0000-0000-0000-000000000250', '10000000-0000-0000-0000-000000000001', 'Pipeline Principal', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO pipeline_stages (id, agency_id, pipeline_id, name, sequence, color_key, visual_level, active)
VALUES
  ('10000000-0000-0000-0000-000000000260', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000250', 'Lead', 1, 'BLUE', 'NORMAL', true),
  ('10000000-0000-0000-0000-000000000261', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000250', 'Proposta', 2, 'YELLOW', 'NORMAL', true),
  ('10000000-0000-0000-0000-000000000262', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000250', 'Fechado', 3, 'GREEN', 'NORMAL', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 19. DEPARTMENTS
-- ============================================================

INSERT INTO departments (id, agency_id, name)
VALUES
  ('10000000-0000-0000-0000-000000000270', '10000000-0000-0000-0000-000000000001', 'Comercial'),
  ('10000000-0000-0000-0000-000000000271', '10000000-0000-0000-0000-000000000001', 'Operacoes'),
  ('10000000-0000-0000-0000-000000000272', '10000000-0000-0000-0000-000000000001', 'Financeiro')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 20. NOTIFICATION PREFERENCES
-- ============================================================

INSERT INTO notification_preferences (user_id, agency_id, email_notifications, proposal_updates, booking_updates, payment_updates)
VALUES
  ('10000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', true, true, true, true),
  ('10000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', true, true, false, false)
ON CONFLICT (user_id, agency_id) DO NOTHING;

-- ============================================================
-- RESUMO
-- ============================================================

-- Tenant A (Alpha): 5 users, 2 customers, 1 wish, 1 offer, 1 proposal,
-- 1 sale, 1 trip, 1 booking, 2 air services, 1 receivable, 2 payables,
-- 1 employee, 1 commission, 1 pipeline with 3 stages, 3 departments

-- Tenant B (Beta): 3 users, 2 customers, 1 wish, 1 offer, 1 proposal
-- (DRAFT), minimal financial data — enough for cross-tenant isolation tests

-- Total: 2 tenants, 8 users, 4 customers, 2 wishes, 2 offers, 2 proposals,
-- 1 sale, 1 trip, 1 booking, 2 air services, 1 receivable, 2 payables,
-- 1 employee, 1 commission, 1 pipeline, 3 departments
