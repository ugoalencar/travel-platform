-- BAK-01: restore uses existing RLS and immutable history, never disables triggers.
-- Identity values are preserved; only this bounded maintenance operation is elevated.
CREATE FUNCTION public.tenant_backup_sync_identity_sequences() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE highest BIGINT; sequence_value BIGINT;
BEGIN
  IF public.current_agency_id() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE agency_id=public.current_agency_id()
      AND id=public.current_user_id() AND role='OWNER' AND status='ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Active tenant owner required' USING ERRCODE='42501';
  END IF;
  LOCK TABLE public.sale_commission_attributions IN SHARE ROW EXCLUSIVE MODE;
  SELECT MAX(seq) INTO highest FROM public.sale_commission_attributions;
  SELECT last_value INTO sequence_value FROM public.sale_commission_attributions_seq_seq;
  IF highest IS NOT NULL AND highest > sequence_value THEN
    PERFORM pg_catalog.setval('public.sale_commission_attributions_seq_seq'::regclass, highest, true);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.tenant_backup_sync_identity_sequences() FROM PUBLIC;
DO $$
DECLARE r TEXT; t TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['travel_app_runtime', 'travel_app_runtime_local'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      FOREACH t IN ARRAY ARRAY['customers', 'suppliers', 'sales', 'sale_items', 'receivables', 'payments', 'payment_allocations', 'agency_revenue_scopes', 'agency_revenue_rule_versions', 'agency_revenue_entries', 'customer_field_settings', 'dashboard_layouts', 'agency_communications', 'agency_entitlements', 'agent_area_grants', 'air_services', 'assets', 'automation_executions', 'automations', 'booking_passengers', 'bookings', 'brokers', 'campaign_attributions', 'campaign_offers', 'campaign_partner_stubs', 'campaign_placements', 'campaign_products', 'campaigns', 'cash_transactions', 'commercial_opportunities', 'commercial_partners', 'commercial_tasks', 'commission_categories', 'commission_entries', 'commission_financial_profiles', 'commission_plans', 'commission_release_events', 'commissions', 'connector_actions', 'contract_documents', 'contract_parties', 'contract_signature_evidence', 'contract_templates', 'cost_centers', 'coupon_grants', 'coupon_redemptions', 'coupons', 'customer_addresses', 'customer_dependents', 'customer_documents', 'customer_interactions', 'customer_segments', 'departments', 'document_attachments', 'document_extractions', 'document_verifications', 'employee_commission_rule_scopes', 'employee_commission_rule_tiers', 'employee_commission_rule_versions', 'employee_commission_rules', 'employee_deductions', 'employees', 'engagements', 'enrollment_documents', 'enrollment_submissions', 'excursion_customers', 'excursion_departures', 'excursions', 'expenses', 'external_offer_captures', 'financial_categories', 'import_jobs', 'import_mapping_templates', 'insurance_documents', 'insurance_policies', 'insurance_products', 'insurance_travelers', 'land_services', 'media_asset_links', 'media_assets', 'notification_preferences', 'offers', 'operation_assignments', 'operation_checkpoints', 'operational_costs', 'operational_staff', 'operational_staff_capabilities', 'partner_attributions', 'partner_campaigns', 'partner_commissions', 'partner_contracts', 'payables', 'payment_condition_categories', 'payment_condition_methods', 'payment_condition_products', 'payment_conditions', 'payment_method_receipt_rules', 'payroll_entries', 'permission_restrictions', 'pescador_search_results', 'pescador_searches', 'pescador_sources', 'pipeline_access', 'pipeline_stages', 'pipelines', 'post_trip_checklist', 'product_assets', 'proposal_items', 'proposal_optional_items', 'proposal_sections', 'proposals', 'publications', 'reconciliations', 'revenues', 'route_points', 'routes', 'sale_category_fields', 'sale_commission_attributions', 'sale_import_batches', 'sale_import_keys', 'sale_payment_reversals', 'agency_revenue_settlement_settings', 'agency_revenue_batches', 'agency_revenue_batch_entries', 'agency_revenue_batch_receipts', 'agency_commission_engine_settings', 'sale_payment_condition_versions', 'sale_payment_requests', 'scheduled_departures', 'supplier_category_links', 'transport_operations', 'transport_products', 'travel_products', 'travel_requirements', 'trip_occurrences', 'trip_photos', 'trips', 'upsell_rules', 'upsell_suggestions', 'user_permission_overrides', 'wishes'] LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
          EXECUTE format('GRANT SELECT, INSERT ON public.%I TO %I', t, r);
        END IF;
      END LOOP;
      IF to_regprocedure('public.tenant_backup_sync_identity_sequences()') IS NOT NULL THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.tenant_backup_sync_identity_sequences() TO %I', r);
      END IF;
    END IF;
  END LOOP;
END $$;

INSERT INTO schema_migrations (version) VALUES ('115') ON CONFLICT (version) DO NOTHING;
