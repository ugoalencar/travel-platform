/**
 * Commission release policy (Onda E2, COM-03) -- same contract as the Full (commission-release.ts):
 * the payment METHOD says whether the sale needs its money received (tri-state: an undecided rule is
 * "never decided"); the tenant's financial PROFILE says how that affects release. Missing
 * configuration yields BLOCKED with the list of what is missing; it is never turned into ON_SALE.
 */
import type { TenantClient } from './database';

export type ReleaseMode = 'ON_SALE' | 'ON_RECEIPT' | 'BLOCKED';

export type MissingConfig = 'PAYMENT_METHOD_NOT_SET' | 'PAYMENT_METHOD_RECEIPT_RULE_UNSET' | 'FINANCIAL_PROFILE_NOT_ACTIVE';

export interface ReleaseResolution {
  mode: ReleaseMode;
  missing: MissingConfig[];
}

export function resolveReleaseMode(input: {
  hasPaymentMethod: boolean;
  /** null = the method's rule was never decided. */
  requiresReceipt: boolean | null;
  hasActiveProfile: boolean;
}): ReleaseResolution {
  const missing: MissingConfig[] = [];
  if (!input.hasPaymentMethod) missing.push('PAYMENT_METHOD_NOT_SET');
  else if (input.requiresReceipt === null) missing.push('PAYMENT_METHOD_RECEIPT_RULE_UNSET');
  if (input.requiresReceipt !== false && !input.hasActiveProfile) missing.push('FINANCIAL_PROFILE_NOT_ACTIVE');
  if (missing.length > 0) return { mode: 'BLOCKED', missing };
  return { mode: input.requiresReceipt ? 'ON_RECEIPT' : 'ON_SALE', missing: [] };
}

export async function hasActiveFinancialProfile(client: TenantClient, tenantId: string): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM commission_financial_profiles
      WHERE tenant_id = $1 AND effective_from <= (now() AT TIME ZONE 'America/Sao_Paulo')::date LIMIT 1`,
    [tenantId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function resolveSaleReleaseMode(
  client: TenantClient,
  tenantId: string,
  paymentMethodId: string | null,
): Promise<ReleaseResolution> {
  let requiresReceipt: boolean | null = null;
  if (paymentMethodId !== null) {
    const method = await client.query<{ requires_receipt: boolean; receipt_rule_decided: boolean }>(
      `SELECT requires_receipt, receipt_rule_decided FROM payment_methods WHERE tenant_id = $1 AND id = $2`,
      [tenantId, paymentMethodId],
    );
    const row = method.rows[0];
    requiresReceipt = row === undefined || !row.receipt_rule_decided ? null : row.requires_receipt;
    if (row === undefined) paymentMethodId = null;
  }
  return resolveReleaseMode({
    hasPaymentMethod: paymentMethodId !== null,
    requiresReceipt,
    hasActiveProfile: await hasActiveFinancialProfile(client, tenantId),
  });
}
