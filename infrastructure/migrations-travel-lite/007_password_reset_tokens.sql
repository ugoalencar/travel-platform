-- Travel Lite 007 — recuperação de senha pública ("Esqueci minha senha").
-- Aditiva e idempotente: não altera nem remove nada existente.
--
-- Mesmo problema que o login resolve (a chamada chega sem contexto de
-- tenant): a plataforma Full já tem a solução para isso em
-- infrastructure/migrations/061_local_password_auth.sql
-- (password_reset_tokens + política "public_token" por GUC de sessão).
-- Esta migration replica esse desenho, em vez de deixar a tabela sem RLS
-- (como tenants, que só guarda dado público de login): o token de reset é
-- um segredo de alto valor, então a garantia de isolamento fica no
-- próprio banco, não só na cláusula WHERE da aplicação.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  requested_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id),
  UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_active
  ON password_reset_tokens (user_id)
  WHERE used_at IS NULL;

-- O runtime lê, cria e marca como usado; nunca apaga (histórico de auditoria).
GRANT SELECT, INSERT, UPDATE ON password_reset_tokens TO travel_lite_runtime;

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE tablename = 'password_reset_tokens'
       AND policyname = 'password_reset_tokens_select_tenant'
  ) THEN
    -- Caminho normal: já existe contexto de tenant (ex.: um MASTER consultando).
    CREATE POLICY password_reset_tokens_select_tenant ON password_reset_tokens
      FOR SELECT USING (tenant_id = current_tenant_id()::uuid);
    CREATE POLICY password_reset_tokens_insert_tenant ON password_reset_tokens
      FOR INSERT WITH CHECK (tenant_id = current_tenant_id()::uuid);
    CREATE POLICY password_reset_tokens_update_tenant ON password_reset_tokens
      FOR UPDATE USING (tenant_id = current_tenant_id()::uuid)
      WITH CHECK (tenant_id = current_tenant_id()::uuid);

    -- Caminho público: quem clicou no link do e-mail não tem sessão nem
    -- tenant. A aplicação faz SELECT set_config('app.password_reset_lookup_hash', <hash>, true)
    -- antes da consulta (GUC local à transação -- nunca sobrevive ao
    -- COMMIT/ROLLBACK, nunca vaza de uma conexão do pool para a próxima).
    -- Só a linha cujo token_hash bate exatamente fica visível ou
    -- atualizável: sem o hash certo, não há varredura nem enumeração
    -- possível. Mesmo padrão de infrastructure/migrations/061 (Full).
    CREATE POLICY password_reset_tokens_select_public_token ON password_reset_tokens
      FOR SELECT
      USING (
        current_tenant_id() IS NULL
        AND token_hash = NULLIF(current_setting('app.password_reset_lookup_hash', TRUE), '')
      );
    CREATE POLICY password_reset_tokens_update_public_token ON password_reset_tokens
      FOR UPDATE
      USING (
        current_tenant_id() IS NULL
        AND token_hash = NULLIF(current_setting('app.password_reset_lookup_hash', TRUE), '')
      )
      WITH CHECK (
        current_tenant_id() IS NULL
        AND token_hash = NULLIF(current_setting('app.password_reset_lookup_hash', TRUE), '')
      );
  END IF;
END $$;
