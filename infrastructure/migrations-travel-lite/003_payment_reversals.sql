-- ============================================================
-- TRAVEL LITE — 003_payment_reversals.sql
-- Estorno controlado de recebimentos e pagamentos.
--
-- O ledger continua imutável: um estorno NUNCA edita nem apaga o
-- movimento original. Ele grava um pagamento inverso (direção oposta,
-- mesmo valor, mesma conta) que aponta para o original, e um lançamento
-- inverso no ledger que aponta para o lançamento original.
--
-- Idempotência garantida no banco: índices únicos parciais impedem um
-- segundo estorno do mesmo pagamento / do mesmo lançamento, mesmo sob
-- concorrência.
--
-- Forward-only e aditiva: só acrescenta colunas anuláveis, constraints
-- que as linhas existentes já satisfazem e amplia o CHECK do outbox
-- (superconjunto do anterior). Re-executável: cada passo verifica se já
-- existe. FKs compostas (tenant_id, id) — tenant-safe como no 001.
-- Colunas novas herdam o RLS e os grants das tabelas (002).
-- ============================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS reversal_of_payment_id UUID,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS reversal_of_transaction_id UUID;

DO $$
DECLARE
  item RECORD;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('payments', 'payments_reversal_of_fk',
       'FOREIGN KEY (tenant_id, reversal_of_payment_id) REFERENCES payments (tenant_id, id)'),
      ('payments', 'payments_reversal_reason_check',
       'CHECK ((reversal_of_payment_id IS NULL) = (reversal_reason IS NULL))'),
      ('payments', 'payments_reversal_not_self_check',
       'CHECK (reversal_of_payment_id IS NULL OR reversal_of_payment_id <> id)'),
      -- financial_transactions não tinha UNIQUE (tenant_id, id); a FK
      -- composta (tenant-safe) precisa dele. id já é PK, então nenhuma
      -- linha existente o viola.
      ('financial_transactions', 'financial_transactions_tenant_id_id_key',
       'UNIQUE (tenant_id, id)'),
      ('financial_transactions', 'financial_transactions_reversal_of_fk',
       'FOREIGN KEY (tenant_id, reversal_of_transaction_id) REFERENCES financial_transactions (tenant_id, id)'),
      ('financial_transactions', 'financial_transactions_reversal_not_self_check',
       'CHECK (reversal_of_transaction_id IS NULL OR reversal_of_transaction_id <> id)')
    ) AS t (table_name, constraint_name, definition)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = item.constraint_name
         AND conrelid = format('public.%I', item.table_name)::regclass
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s',
                     item.table_name, item.constraint_name, item.definition);
    END IF;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_reversal_of
  ON payments (tenant_id, reversal_of_payment_id)
  WHERE reversal_of_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_transactions_reversal_of
  ON financial_transactions (tenant_id, reversal_of_transaction_id)
  WHERE reversal_of_transaction_id IS NOT NULL;

ALTER TABLE integration_outbox DROP CONSTRAINT IF EXISTS integration_outbox_event_type_check;
ALTER TABLE integration_outbox ADD CONSTRAINT integration_outbox_event_type_check
  CHECK (event_type IN (
    'CUSTOMER_CREATED', 'CUSTOMER_UPDATED',
    'SELLER_CREATED', 'SELLER_UPDATED',
    'SALE_CATEGORY_CREATED', 'SALE_CATEGORY_UPDATED', 'SALE_CATEGORY_DELETED',
    'SALE_CREATED', 'SALE_UPDATED', 'SALE_CONFIRMED', 'SALE_CANCELLED',
    'COMMISSION_CREATED', 'COMMISSION_UPDATED', 'COMMISSION_PAID',
    'RECEIVABLE_CREATED',
    'PAYMENT_RECEIVED', 'PAYMENT_REVERSED',
    'PAYABLE_CREATED', 'EXPENSE_PAID',
    'ACCOUNT_CREATED', 'ACCOUNT_UPDATED',
    'FINANCIAL_CATEGORY_CREATED', 'FINANCIAL_CATEGORY_UPDATED',
    'PAYMENT_METHOD_CREATED', 'PAYMENT_METHOD_UPDATED'
  ));
