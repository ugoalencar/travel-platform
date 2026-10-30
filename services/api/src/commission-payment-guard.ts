import type { TenantTransactionClient } from './database';
import { ConflictError } from './errors';
import { lockEntrySettlement } from './commission-release-service';

interface PayableReference {
  id: string;
  amount: string;
  status: string;
  commission_entry_id: string | null;
  payroll_entry_id: string | null;
}

interface PayrollReference {
  id: string;
  status: string;
  net_amount: string;
  commissions_total: string;
}

interface CommissionReference {
  id: string;
  status: string;
  amount: string;
  payroll_entry_id: string | null;
}

const cents = (value: string) => Math.round(Number(value) * 100);

/** Lock payrolls, then commissions, before callers lock payables or record allocations. */
export async function validateCommissionPaymentTargets(
  client: TenantTransactionClient,
  agencyId: string,
  payableIds: string[],
): Promise<void> {
  if (payableIds.length === 0) return;
  const references = await client.query<PayableReference>(
    `SELECT id, amount::text, status, commission_entry_id, payroll_entry_id FROM payables
     WHERE agency_id = $1 AND id = ANY($2::text[])
       AND (commission_entry_id IS NOT NULL OR payroll_entry_id IS NOT NULL)`,
    [agencyId, payableIds],
  );
  if (references.rows.length === 0) return;
  const payrollIds = [...new Set(references.rows.flatMap((row) => row.payroll_entry_id ? [row.payroll_entry_id] : []))];
  const commissionIds = [...new Set(references.rows.flatMap((row) => row.commission_entry_id ? [row.commission_entry_id] : []))];
  const settlementEntries = await client.query<{ id: string }>(
    `SELECT id FROM commission_entries WHERE agency_id=$1 AND (id=ANY($2::text[]) OR payroll_entry_id=ANY($3::text[])) ORDER BY id`,
    [agencyId,commissionIds,payrollIds],
  );
  for (const entry of settlementEntries.rows) await lockEntrySettlement(client,agencyId,entry.id);
  const payrolls = await client.query<PayrollReference>(
    `SELECT id, status, net_amount::text, commissions_total::text FROM payroll_entries
     WHERE agency_id = $1 AND id = ANY($2::text[]) ORDER BY id FOR UPDATE`,
    [agencyId, payrollIds],
  );
  const commissions = await client.query<CommissionReference>(
    `SELECT id, status, amount::text, payroll_entry_id FROM commission_entries
     WHERE agency_id = $1 AND (id = ANY($2::text[]) OR payroll_entry_id = ANY($3::text[]))
     ORDER BY id FOR UPDATE`,
    [agencyId, commissionIds, payrollIds],
  );
  const payrollById = new Map(payrolls.rows.map((row) => [row.id, row]));
  const commissionById = new Map(commissions.rows.map((row) => [row.id, row]));

  for (const payable of references.rows) {
    if (payable.status === 'CANCELLED' || (payable.commission_entry_id && payable.payroll_entry_id)) {
      throw new ConflictError('Commission payment obligation is cancelled or linked to conflicting channels');
    }
    if (payable.commission_entry_id) {
      const entry = commissionById.get(payable.commission_entry_id);
      if (!entry || !['PAYABLE', 'PAID'].includes(entry.status) || entry.payroll_entry_id !== null ||
          cents(entry.amount) !== cents(payable.amount)) {
        throw new ConflictError('Commission payment obligation no longer matches its commission');
      }
    }
    if (payable.payroll_entry_id) {
      const payroll = payrollById.get(payable.payroll_entry_id);
      const reserved = commissions.rows.filter((row) => row.payroll_entry_id === payable.payroll_entry_id);
      if (!payroll || !['APPROVED', 'PAID'].includes(payroll.status) ||
          reserved.some((row) => !['APPROVED', 'PAID'].includes(row.status)) ||
          reserved.reduce((sum, row) => sum + cents(row.amount), 0) !== cents(payroll.commissions_total) ||
          cents(payroll.net_amount) !== cents(payable.amount)) {
        throw new ConflictError('Payroll payment obligation no longer matches its reserved commissions');
      }
    }
  }
}
