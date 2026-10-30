-- ============================================================
-- TRAVEL LITE — 011_commission_release_by_receipt.sql
-- Motor de comissões, Fase 4. Decisão do usuário (2026-10-22):
--   * a META conta a venda inteira na confirmação (R$ 50.000 em 10x
--     entra como 50.000, não como parcelas);
--   * a comissão é calculada pela meta atingida na confirmação;
--   * a LIBERAÇÃO do pagamento depende da forma de pagamento:
--       - forma com "exige recebimento": a comissão é paga em parcelas,
--         proporcional ao que foi efetivamente recebido da venda;
--       - forma sem a regra: a comissão é paga direto sobre o total.
-- payment_methods.requires_receipt define SE há exigência (nunca inferido
-- do nome); seller_commissions.release_mode congela a política no momento
-- da confirmação (mudar a forma depois não altera comissões existentes).
-- Forward-only e re-executável.
-- ============================================================

ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS requires_receipt BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE seller_commissions
  ADD COLUMN IF NOT EXISTS release_mode TEXT NOT NULL DEFAULT 'ON_SALE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seller_commissions_release_mode_check') THEN
    ALTER TABLE seller_commissions ADD CONSTRAINT seller_commissions_release_mode_check
      CHECK (release_mode IN ('ON_SALE', 'ON_RECEIPT'));
  END IF;
END $$;
