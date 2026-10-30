/**
 * Commission release by receipt (Onda E2: COM-03 + Frente 8).
 *
 * The payment METHOD says whether a sale needs its money received (payment_method_receipt_rules,
 * tri-state: no row = never decided); the agency's FINANCIAL PROFILE says how that affects release
 * (commission_financial_profiles, append-only with effective date). Missing configuration blocks the
 * feature with a 409 naming what is missing; it is never turned into "release on sale".
 * Entries created before migration 108 are LEGACY and keep their current behaviour (no reprocessing).
 * Pure rules live in commission-release.ts; this file only reads the real receipts (Onda C) and payments.
 */
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ReleasePolicyMissingError, ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';
import {
  allocableAmount,
  entryStatusAfterPayments,
  releasedAmount,
  resolveReleasePolicy,
  type ReleaseEffect,
  type ReleasePolicy,
} from './commission-release';
import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import { expectedCommissionPayDate, supplierPaymentReleaseCap } from './commission-supplier-policy';
import { getActiveCommissionPayPolicy } from './commission-payment-policies';

export interface EntryRelease {
  entryId: string;
  recognized: number;
  received: number;
  saleTotal: number;
  released: number;
  paid: number;
  allocable: number;
  policy: ReleasePolicy;
  status: 'PAID' | 'PAYABLE' | 'APPROVED';
  expectedPayDate: string | null;
}

const money = (value: string | null | undefined): number => Math.round(Number(value ?? 0) * 100) / 100;

export const lockEntrySettlement = (client: TenantTransactionClient, agencyId: string, entryId: string) =>
  client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`commission-settle:${agencyId}:${entryId}`]);

export async function loadActiveFinancialProfile(
  client: TenantTransactionClient,
  agencyId: string,
): Promise<{ profileId: string; effect: ReleaseEffect } | null> {
  const result = await client.query<{ id: string; effect: ReleaseEffect }>(
    `SELECT id, effect FROM commission_financial_profiles
     WHERE agency_id = $1 AND effective_from <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
     ORDER BY effective_from DESC, created_at DESC, id DESC LIMIT 1`,
    [agencyId],
  );
  const row = result.rows[0];
  return row ? { profileId: row.id, effect: row.effect } : null;
}

/** Tri-state for the sale: undecided if any method has no rule; required if any decided method requires it. */
export function receiptRequirement(methods: string[], rules: Map<string, boolean>): boolean | null {
  if (methods.length === 0) return null;
  let required = false;
  for (const method of methods) {
    const rule = rules.get(method);
    if (rule === undefined) return null;
    if (rule) required = true;
  }
  return required;
}

async function resolvePolicyForMethods(
  client: TenantTransactionClient,
  agencyId: string,
  methods: string[],
): Promise<ReleasePolicy> {
  const rulesResult = await client.query<{ method: string; requires_receipt: boolean }>(
    `SELECT method, requires_receipt FROM payment_method_receipt_rules WHERE agency_id = $1 AND method = ANY($2::text[])`,
    [agencyId, methods],
  );
  const profile = await loadActiveFinancialProfile(client, agencyId);
  return resolveReleasePolicy({
    hasPaymentMethod: methods.length > 0,
    requiresReceipt: receiptRequirement(methods, new Map(rulesResult.rows.map((row) => [row.method, row.requires_receipt]))),
    profile,
  });
}

/** Capture policy at obligation creation; later agency configuration cannot rewrite it. */
export async function captureSaleReleasePolicySnapshot(
  client: TenantTransactionClient,
  agencyId: string,
  saleId: string,
): Promise<ReleasePolicy> {
  const sale = await client.query<{ methods: string[] | null }>(
    `SELECT ARRAY(SELECT jsonb_array_elements_text(payment_condition_snapshot->'condition'->'paymentMethods')) AS methods
       FROM sales WHERE agency_id=$1 AND id=$2`, [agencyId, saleId],
  );
  if (!sale.rows[0]) throw new NotFoundError('Sale not found');
  return resolvePolicyForMethods(client, agencyId, sale.rows[0].methods ?? []);
}

/** Computes the release state of one entry. Caller should hold the settlement lock when it will act on it. */
export async function computeEntryRelease(
  client: TenantTransactionClient,
  agencyId: string,
  entryId: string,
): Promise<EntryRelease> {
  const entryResult = await client.query<{
    sale_id: string | null; employee_id: string; supplier_id: string | null; release_after_supplier_payment: boolean;
    amount: string; release_mode: string; release_policy_snapshot: ReleasePolicy | null;
    payroll_entry_id: string | null; status: string;
  }>(
    `SELECT sale_id, employee_id, supplier_id, release_after_supplier_payment, amount::text, release_mode, release_policy_snapshot, payroll_entry_id, status FROM commission_entries
     WHERE agency_id = $1 AND id = $2`,
    [agencyId, entryId],
  );
  const entry = entryResult.rows[0];
  if (!entry) throw new NotFoundError('Commission entry not found');
  const recognized = money(entry.amount);

  const paidResult = await client.query<{ paid: string }>(
    `SELECT COALESCE(SUM(pa.amount), 0)::text AS paid
     FROM payables p JOIN payment_allocations pa ON pa.agency_id = p.agency_id AND pa.payable_id = p.id
     WHERE p.agency_id = $1 AND p.commission_entry_id = $2 AND p.status <> 'CANCELLED'`,
    [agencyId, entryId],
  );
  // payroll channel: the payroll pays as a whole, so its commissions count as paid only when the entry is PAID
  const paid = money(paidResult.rows[0]?.paid) + (entry.payroll_entry_id !== null && entry.status === 'PAID' ? recognized : 0);

  const withState = async (policy: ReleasePolicy, received: number, saleTotal: number, supplierCap: number | null = null): Promise<EntryRelease> => {
    const releasedByClient = releasedAmount(policy, recognized, received, saleTotal);
    const released = supplierCap === null ? releasedByClient : Math.min(releasedByClient, supplierCap);
    const channel = entry.payroll_entry_id !== null ? 'PAYROLL' : 'PAYABLE';
    const state: EntryRelease = {
      entryId, recognized, received, saleTotal, released, paid,
      allocable: allocableAmount(released, paid), policy,
      status: entryStatusAfterPayments({ recognized, paid, channel }),
      expectedPayDate: null,
    };
    if (released > 0) {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      const paymentPolicy = await getActiveCommissionPayPolicy(client, agencyId, entry.employee_id, today);
      const planned = expectedCommissionPayDate(today, paymentPolicy);
      const stored = await client.query<{ expected_pay_date: string }>(
        `UPDATE commission_entries SET expected_pay_date=COALESCE(expected_pay_date,$3::date)
          WHERE agency_id=$1 AND id=$2 RETURNING expected_pay_date::text`, [agencyId,entryId,planned],
      );
      state.expectedPayDate = stored.rows[0]?.expected_pay_date ?? planned;
    }
    return state;
  };

  if (entry.release_mode === 'LEGACY' || entry.sale_id === null) {
    return withState({ status: 'LEGACY_PRE_FEATURE' }, 0, 0);
  }

  const sale = await client.query<{ total: string; methods: string[] | null }>(
    `SELECT s.total::text AS total,
            ARRAY(SELECT jsonb_array_elements_text(s.payment_condition_snapshot->'condition'->'paymentMethods')) AS methods
     FROM sales s WHERE s.agency_id = $1 AND s.id = $2`,
    [agencyId, entry.sale_id],
  );
  const methods = sale.rows[0]?.methods ?? [];
  const policy = entry.release_policy_snapshot ?? await resolvePolicyForMethods(client, agencyId, methods);
  // Older obligations acquire a frozen policy on their first read, including when blocked.
  if (entry.release_policy_snapshot === null) {
    await client.query(
      `UPDATE commission_entries SET release_policy_snapshot=$3::jsonb
       WHERE agency_id=$1 AND id=$2 AND release_policy_snapshot IS NULL`,
      [agencyId, entryId, JSON.stringify(policy)],
    );
  }

  const receivedResult = await client.query<{ received: string }>(
    `SELECT COALESCE(SUM(pa.amount), 0)::text AS received
     FROM receivables r JOIN payment_allocations pa ON pa.agency_id = r.agency_id AND pa.receivable_id = r.id
     JOIN payments p ON p.agency_id=pa.agency_id AND p.id=pa.payment_id
     WHERE r.agency_id = $1 AND r.sale_id = $2 AND r.status <> 'CANCELLED' AND p.direction='IN'
       AND NOT EXISTS (SELECT 1 FROM sale_payment_reversals spr WHERE spr.agency_id=p.agency_id AND spr.original_payment_id=p.id)`,
    [agencyId, entry.sale_id],
  );
  let supplierCap: number | null = null;
  if (entry.release_after_supplier_payment && entry.supplier_id) {
    const supplierRevenue = await client.query<{ expected: string; received: string }>(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE status NOT IN ('PENDING_RULE','CANCELLED')),0)::text AS expected,
              COALESCE(SUM(received_amount) FILTER (WHERE status='RECEIVED'),0)::text AS received
         FROM agency_revenue_entries WHERE agency_id=$1 AND sale_id=$2 AND supplier_id=$3`,
      [agencyId,entry.sale_id,entry.supplier_id],
    );
    supplierCap = supplierPaymentReleaseCap(recognized, money(supplierRevenue.rows[0]?.received), money(supplierRevenue.rows[0]?.expected));
  }
  return withState(policy, money(receivedResult.rows[0]?.received), money(sale.rows[0]?.total), supplierCap);
}

async function recordReleaseEvent(
  client: TenantTransactionClient,
  agencyId: string,
  state: EntryRelease,
  eventType: 'PAYABLE_CREATED' | 'ALLOCATION_ACCEPTED' | 'PAYROLL_RESERVED',
  requested: number | null,
): Promise<void> {
  await client.query(
    `INSERT INTO commission_release_events
       (agency_id, commission_entry_id, event_type, recognized, received, sale_total, released, paid, requested, policy, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
    [agencyId, state.entryId, eventType, state.recognized, state.received, state.saleTotal, state.released, state.paid,
      requested, JSON.stringify(state.policy), getUserId()],
  );
}

function assertNotBlocked(state: EntryRelease): void {
  if (state.policy.status === 'BLOCKED') throw new ReleasePolicyMissingError(state.policy.missing);
}

/** Gate for creating the standalone payable: needs a resolved policy and something released. */
export async function assertEntryReleasableForPayable(client: TenantTransactionClient, entryId: string): Promise<EntryRelease> {
  const agencyId = getAgencyId();
  await lockEntrySettlement(client, agencyId, entryId);
  const state = await computeEntryRelease(client, agencyId, entryId);
  assertNotBlocked(state);
  if (state.released <= 0) throw new ConflictError('Nothing of this commission is released yet: no receipt covers it');
  await client.query(
    `UPDATE commission_entries SET settlement_channel = 'PAYABLE', release_policy_snapshot = COALESCE(release_policy_snapshot,$3::jsonb)
     WHERE agency_id = $1 AND id = $2`,
    [agencyId, entryId, JSON.stringify(state.policy)],
  );
  await recordReleaseEvent(client, agencyId, state, 'PAYABLE_CREATED', null);
  return state;
}

/** Gate for each allocation on a commission payable: cannot pay more than released minus already paid. */
export async function assertAllocationWithinRelease(
  client: TenantTransactionClient,
  entryId: string,
  amount: number,
): Promise<void> {
  const agencyId = getAgencyId();
  await lockEntrySettlement(client, agencyId, entryId);
  const state = await computeEntryRelease(client, agencyId, entryId);
  assertNotBlocked(state);
  if (Math.round(amount * 100) > Math.round(state.allocable * 100)) {
    throw new ConflictError(`Payment of ${amount.toFixed(2)} exceeds the released commission balance (${state.allocable.toFixed(2)})`);
  }
  await recordReleaseEvent(client, agencyId, state, 'ALLOCATION_ACCEPTED', amount);
  await recordAuditEvent(client, {
    eventType: AuditEventType.COMMISSION_RELEASE_ALLOCATED, entityType: 'commission_entry', entityId: entryId,
    required: true, metadata: { amount },
  });
}

/** Payroll reserves only entries whose whole amount is already released (payroll pays as a whole). */
export async function filterFullyReleased(
  client: TenantTransactionClient,
  agencyId: string,
  entryIds: string[],
): Promise<string[]> {
  const kept: string[] = [];
  for (const entryId of entryIds) {
    await lockEntrySettlement(client, agencyId, entryId);
    const state = await computeEntryRelease(client, agencyId, entryId);
    if (state.policy.status === 'BLOCKED' || Math.round(state.released * 100) < Math.round(state.recognized * 100)) continue;
    kept.push(entryId);
    if (state.policy.status !== 'LEGACY_PRE_FEATURE') {
      await client.query(
        `UPDATE commission_entries SET settlement_channel = 'PAYROLL', release_policy_snapshot = COALESCE(release_policy_snapshot,$3::jsonb)
         WHERE agency_id = $1 AND id = $2`,
        [agencyId, entryId, JSON.stringify(state.policy)],
      );
      await recordReleaseEvent(client, agencyId, state, 'PAYROLL_RESERVED', null);
    }
  }
  return kept;
}

export async function getEntryRelease(database: DatabaseRuntime, entryId: string): Promise<EntryRelease> {
  return database.withTenantTransaction((client) => computeEntryRelease(client, getAgencyId(), entryId));
}

// ---- configuration: payment-method receipt rules and the agency financial profile ----

export async function listReceiptRules(database: DatabaseRuntime): Promise<Array<{ method: string; requiresReceipt: boolean }>> {
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{ method: string; requires_receipt: boolean }>(
      `SELECT method, requires_receipt FROM payment_method_receipt_rules WHERE agency_id = $1 ORDER BY method`,
      [getAgencyId()],
    );
    return result.rows.map((row) => ({ method: row.method, requiresReceipt: row.requires_receipt }));
  });
}

export async function setReceiptRule(database: DatabaseRuntime, method: string, requiresReceipt: boolean): Promise<void> {
  const clean = method.trim();
  if (clean === '' || clean.length > 60) throw new ValidationError('method is required (up to 60 characters)');
  await database.withTenantTransaction(async (client) => {
    const agencyId = getAgencyId();
    await client.query(
      `INSERT INTO payment_method_receipt_rules (agency_id, method, requires_receipt, updated_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (agency_id, method) DO UPDATE SET requires_receipt = EXCLUDED.requires_receipt,
         updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [agencyId, clean, requiresReceipt, getUserId()],
    );
    await recordAuditEvent(client, {
      eventType: AuditEventType.PAYMENT_METHOD_RECEIPT_RULE_SET, entityType: 'payment_method_receipt_rule',
      entityId: clean, required: true, metadata: { status: requiresReceipt ? 'REQUIRES_RECEIPT' : 'NO_RECEIPT_REQUIRED' },
    });
  });
}

export async function listFinancialProfiles(database: DatabaseRuntime) {
  return database.withTenantTransaction(async (client) => {
    const agencyId = getAgencyId();
    const rows = await client.query<{ id: string; effect: ReleaseEffect; effective_from: string; reason: string | null }>(
      `SELECT id, effect, effective_from::text, reason FROM commission_financial_profiles
       WHERE agency_id = $1 ORDER BY effective_from DESC, created_at DESC`,
      [agencyId],
    );
    const active = await loadActiveFinancialProfile(client, agencyId);
    return rows.rows.map((r) => ({ id: r.id, effect: r.effect, effectiveFrom: r.effective_from, reason: r.reason, active: r.id === active?.profileId }));
  });
}

export async function createFinancialProfile(
  database: DatabaseRuntime,
  input: { effect: ReleaseEffect; effectiveFrom: string; reason?: string },
): Promise<{ id: string }> {
  if (input.effect !== 'META_E_LIBERACAO' && input.effect !== 'SOMENTE_LIBERACAO') throw new ValidationError('effect is invalid');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) throw new ValidationError('effectiveFrom must be YYYY-MM-DD');
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO commission_financial_profiles (agency_id, effect, effective_from, reason, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [getAgencyId(), input.effect, input.effectiveFrom, input.reason ?? null, getUserId()],
    );
    const id = result.rows[0]!.id;
    await recordAuditEvent(client, {
      eventType: AuditEventType.COMMISSION_FINANCIAL_PROFILE_CREATED, entityType: 'commission_financial_profile',
      entityId: id, required: true, metadata: { status: input.effect },
    });
    return { id };
  });
}
