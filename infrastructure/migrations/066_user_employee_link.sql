-- ============================================================
-- LINK EVERY USER TO AN EMPLOYEE RECORD
-- ============================================================
-- Requested directly: "nao existe funcionario mais tem usuario
-- cadastrado todo usuario deve ser um funcionario entao o cadastro de
-- usuario deve receber dados do funcionario, precisamos dessa ligacao"
-- -- the `employees` table (042_employees_commission_plans.sql) already
-- has a nullable `user_id` FK to `users`, but nothing ever populated it:
-- invitations/acceptInvitation() and agency signup only ever wrote to
-- `users`, so every login account existed with zero linked employee
-- record (confirmed: 29 users, 0 employees, before this migration).
--
-- Two parts:
--   1. Let an invitation capture basic employee data (cargo/telefone/
--      departamento) up front, alongside the name captured in 063, so
--      the admin fills this in once at invite time.
--   2. Backfill: give every existing user without a linked employee a
--      minimal employee record (name/email copied from users, hire
--      date approximated from the user's own created_at) so the
--      invariant "every user is an employee" holds retroactively too.
-- ============================================================

ALTER TABLE invitations ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS role_title TEXT;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS department TEXT;

INSERT INTO employees (agency_id, name, email, phone, hire_date, employment_type, status, user_id)
SELECT
  u.agency_id,
  u.name,
  u.email,
  NULL,
  u.created_at::date,
  CASE WHEN u.role = 'OWNER' THEN 'PARTNER' ELSE 'EMPLOYEE' END,
  CASE WHEN u.status = 'ACTIVE' THEN 'ACTIVE' ELSE 'INACTIVE' END,
  u.id
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM employees e WHERE e.agency_id = u.agency_id AND e.user_id = u.id
);
