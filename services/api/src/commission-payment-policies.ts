import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { AuditEventType, recordAuditEvent } from './audit-log';
import { NotFoundError, ValidationError } from './errors';
import type { CommissionPayPolicy } from './commission-supplier-policy';

export interface CommissionPaymentPolicyView extends CommissionPayPolicy {
  id: string;
  employeeId: string | null;
  effectiveFrom: string;
  reason: string | null;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function listCommissionPaymentPolicies(database: DatabaseRuntime): Promise<CommissionPaymentPolicyView[]> {
  return database.withTenantTransaction(async client => {
    const rows = await client.query<{ id: string; employee_id: string | null; mode: CommissionPayPolicy['mode']; payment_day: number | null; payment_days: number; effective_from: string; reason: string | null }>(
      `SELECT id,employee_id,mode,payment_day,payment_days,effective_from::text,reason
         FROM employee_commission_payment_policies WHERE agency_id=$1
        ORDER BY employee_id NULLS FIRST,effective_from DESC,created_at DESC`, [getAgencyId()],
    );
    return rows.rows.map(row => ({ id: row.id, employeeId: row.employee_id, mode: row.mode, day: row.payment_day, paymentDays: row.payment_days, effectiveFrom: row.effective_from, reason: row.reason }));
  });
}

export async function createCommissionPaymentPolicy(database: DatabaseRuntime, input: {
  employeeId?: string | null; mode: CommissionPayPolicy['mode']; effectiveFrom: string;
  day?: number | null; paymentDays?: number; reason: string;
}): Promise<{ id: string }> {
  if (!validDate(input.effectiveFrom)) throw new ValidationError('effectiveFrom must be a real YYYY-MM-DD date');
  if (!['PER_ENTRY','FIXED_DAY','WINDOW'].includes(input.mode)) throw new ValidationError('mode is invalid');
  const day = input.day ?? null;
  const paymentDays = input.paymentDays ?? 0;
  if (input.mode === 'PER_ENTRY' ? day !== null || paymentDays !== 0 : !Number.isInteger(day) || day! < 1 || day! > 31) throw new ValidationError('Payment day does not match policy mode');
  if (!Number.isInteger(paymentDays) || paymentDays < 0 || paymentDays > 365 || (input.mode === 'FIXED_DAY' && paymentDays !== 0)) throw new ValidationError('paymentDays is invalid');
  const reason = input.reason.trim();
  if (!reason || reason.length > 300) throw new ValidationError('A reason up to 300 characters is required');
  return database.withTenantTransaction(async client => {
    const agencyId = getAgencyId();
    if (input.employeeId) {
      const exists = await client.query('SELECT 1 FROM employees WHERE agency_id=$1 AND id=$2', [agencyId,input.employeeId]);
      if (!exists.rows.length) throw new NotFoundError('Employee not found');
    }
    const row = await client.query<{ id: string }>(
      `INSERT INTO employee_commission_payment_policies
        (agency_id,employee_id,mode,effective_from,payment_day,payment_days,reason,created_by)
       VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8) RETURNING id`,
      [agencyId,input.employeeId ?? null,input.mode,input.effectiveFrom,day,paymentDays,reason,getUserId()],
    );
    const id = row.rows[0]!.id;
    await recordAuditEvent(client,{eventType:AuditEventType.COMMISSION_PAYMENT_POLICY_CREATED,entityType:'commission_payment_policy',entityId:id,required:true,metadata:{status:input.mode,reason:reason.slice(0,120)}});
    return { id };
  });
}

export async function getActiveCommissionPayPolicy(client: TenantTransactionClient, agencyId: string, employeeId: string, onDate: string): Promise<CommissionPayPolicy> {
  const result = await client.query<{ mode: CommissionPayPolicy['mode']; payment_day: number | null; payment_days: number }>(
    `SELECT mode,payment_day,payment_days FROM employee_commission_payment_policies
      WHERE agency_id=$1 AND (employee_id=$2 OR employee_id IS NULL) AND effective_from<=$3::date
      ORDER BY (employee_id IS NOT NULL) DESC,effective_from DESC,created_at DESC,id DESC LIMIT 1`,
    [agencyId,employeeId,onDate],
  );
  const row = result.rows[0];
  return row ? { mode: row.mode, day: row.payment_day, paymentDays: row.payment_days } : { mode: 'PER_ENTRY', day: null, paymentDays: 0 };
}

export async function getCommissionCostPolicy(database: DatabaseRuntime): Promise<'WARN' | 'BLOCK'> {
  return database.withTenantTransaction(async client => {
    const result = await client.query<{ mode: 'WARN' | 'BLOCK' }>('SELECT mode FROM agency_commission_cost_policies WHERE agency_id=$1',[getAgencyId()]);
    return result.rows[0]?.mode ?? 'WARN';
  });
}

export async function setCommissionCostPolicy(database: DatabaseRuntime, mode: 'WARN' | 'BLOCK'): Promise<void> {
  if (mode !== 'WARN' && mode !== 'BLOCK') throw new ValidationError('mode must be WARN or BLOCK');
  await database.withTenantTransaction(async client => {
    const agencyId = getAgencyId();
    await client.query(`INSERT INTO agency_commission_cost_policies (agency_id,mode,updated_by)
      VALUES ($1,$2,$3) ON CONFLICT (agency_id) DO UPDATE SET mode=EXCLUDED.mode,updated_by=EXCLUDED.updated_by,updated_at=now()`,[agencyId,mode,getUserId()]);
    await recordAuditEvent(client,{eventType:AuditEventType.COMMISSION_COST_POLICY_CHANGED,entityType:'agency_commission_cost_policy',entityId:agencyId,required:true,metadata:{status:mode}});
  });
}
