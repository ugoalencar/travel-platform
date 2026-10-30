import { getAgencyId, getUserId, requireRole } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { AuditEventType, recordAuditEvent } from './audit-log';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { todayCivil } from './report-projections-service';

export interface SettlementPolicy {
  settlementMode: 'PER_SALE' | 'BATCH_WINDOW';
  closingDay: number | null;
  paymentDays: number | null;
}

export function parseSettlementPolicy(body: unknown): SettlementPolicy {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Invalid settlement policy');
  const r = body as Record<string, unknown>;
  if (Object.keys(r).some((key) => !['settlementMode','closingDay','paymentDays'].includes(key))) throw new ValidationError('Unknown settlement field');
  if (r.settlementMode !== 'PER_SALE' && r.settlementMode !== 'BATCH_WINDOW') throw new ValidationError('Invalid settlement mode');
  if (r.settlementMode === 'PER_SALE') return { settlementMode: r.settlementMode, closingDay: null, paymentDays: null };
  if (!Number.isInteger(r.closingDay) || Number(r.closingDay)<1 || Number(r.closingDay)>31 ||
      !Number.isInteger(r.paymentDays) || Number(r.paymentDays)<0 || Number(r.paymentDays)>365) throw new ValidationError('Closing day 1–31 and payment days 0–365 are required');
  return { settlementMode: r.settlementMode, closingDay: Number(r.closingDay), paymentDays: Number(r.paymentDays) };
}

/** Window is (previous closing date, current closing date], using civil dates. */
export function settlementWindow(month: string, day: number, paymentDays: number) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month<'1900-01' || month>'9998-12') throw new ValidationError('Month must be YYYY-MM');
  const year=Number(month.slice(0,4)), m=Number(month.slice(5));
  const cutoff=(offset:number) => new Date(Date.UTC(year,m-1+offset,Math.min(day,new Date(Date.UTC(year,m+offset,0)).getUTCDate())));
  const start=cutoff(-1), end=cutoff(0);
  const expected=new Date(end.getTime()+paymentDays*86400000);
  return { start:start.toISOString().slice(0,10), end:end.toISOString().slice(0,10), expected:expected.toISOString().slice(0,10) };
}

async function policy(client: TenantTransactionClient): Promise<SettlementPolicy> {
  const result=await client.query<SettlementPolicy>(`SELECT settlement_mode AS "settlementMode",closing_day AS "closingDay",payment_days AS "paymentDays"
    FROM agency_revenue_settlement_settings WHERE agency_id=$1`,[getAgencyId()]);
  return result.rows[0] ?? {settlementMode:'PER_SALE',closingDay:null,paymentDays:null};
}

export async function getSettlementPolicy(database: DatabaseRuntime) {
  requireRole(UserRole.MANAGER);
  return database.withTenantTransaction(policy);
}

export async function saveSettlementPolicy(database: DatabaseRuntime,input:SettlementPolicy) {
  requireRole(UserRole.ADMIN);
  return database.withTenantTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`revenue-batches:${getAgencyId()}`]);
    await client.query(`INSERT INTO agency_revenue_settlement_settings (agency_id,settlement_mode,closing_day,payment_days,updated_by)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT (agency_id) DO UPDATE SET settlement_mode=$2,closing_day=$3,payment_days=$4,updated_by=$5,updated_at=now()`,
    [getAgencyId(),input.settlementMode,input.closingDay,input.paymentDays,getUserId()]);
    await recordAuditEvent(client,{eventType:AuditEventType.AGENCY_REVENUE_SETTLEMENT_CONFIGURED,entityType:'agency_revenue_settlement',required:true,metadata:{toStatus:input.settlementMode}});
    return input;
  });
}

export async function listRevenueBatches(database: DatabaseRuntime) {
  requireRole(UserRole.MANAGER);
  return database.withTenantTransaction(async client => (await client.query(`SELECT b.id,to_char(b.window_month,'YYYY-MM') AS month,
    b.window_start::text,b.window_end::text,b.expected_payment_date::text,r.received_at,
    COALESCE(SUM(e.amount),0)::float8 AS amount,COUNT(e.entry_id)::int AS count
    FROM agency_revenue_batches b LEFT JOIN agency_revenue_batch_entries e ON e.agency_id=b.agency_id AND e.batch_id=b.id
    LEFT JOIN agency_revenue_batch_receipts r ON r.agency_id=b.agency_id AND r.batch_id=b.id
    WHERE b.agency_id=$1 GROUP BY b.id,r.received_at ORDER BY b.window_month DESC LIMIT 500`,[getAgencyId()])).rows);
}

export async function closeRevenueBatch(database:DatabaseRuntime,month:string) {
  requireRole(UserRole.ADMIN);
  settlementWindow(month,1,0);
  return database.withTenantTransaction(async client => {
    const agency=getAgencyId();
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`revenue-batches:${agency}`]);
    const existing=await client.query<{id:string}>('SELECT id FROM agency_revenue_batches WHERE agency_id=$1 AND window_month=$2::date',[agency,month+'-01']);
    if(existing.rows[0]) return {id:existing.rows[0].id};
    const config=await policy(client);
    if(config.settlementMode!=='BATCH_WINDOW') throw new ConflictError('Configure BATCH_WINDOW before closing a batch');
    const window=settlementWindow(month,config.closingDay!,config.paymentDays!);
    if(window.end>=todayCivil()) throw new ConflictError('The closing civil day must have ended');
    // Match the sale -> entry lock order of payment/cancellation paths. Recheck entries after locking sales.
    await client.query(`SELECT s.id FROM sales s WHERE s.agency_id=$1 AND EXISTS (SELECT 1 FROM agency_revenue_entries e
      WHERE e.agency_id=s.agency_id AND e.sale_id=s.id AND e.status='ENTITLED'
      AND (e.entitled_at AT TIME ZONE 'America/Sao_Paulo')::date>$2::date
      AND (e.entitled_at AT TIME ZONE 'America/Sao_Paulo')::date<=$3::date) ORDER BY s.id FOR UPDATE`,[agency,window.start,window.end]);
    const entries=await client.query<{id:string}>(`SELECT e.id FROM agency_revenue_entries e WHERE e.agency_id=$1 AND e.status='ENTITLED'
      AND (e.entitled_at AT TIME ZONE 'America/Sao_Paulo')::date>$2::date AND (e.entitled_at AT TIME ZONE 'America/Sao_Paulo')::date<=$3::date
      AND NOT EXISTS (SELECT 1 FROM agency_revenue_batch_entries be WHERE be.agency_id=e.agency_id AND be.entry_id=e.id)
      ORDER BY e.id FOR UPDATE`,[agency,window.start,window.end]);
    if(!entries.rows.length) throw new ConflictError('No entitled revenue in this window');
    const batch=await client.query<{id:string}>(`INSERT INTO agency_revenue_batches (agency_id,window_month,window_start,window_end,expected_payment_date,policy_snapshot,created_by)
      VALUES ($1,$2::date,$3::date,$4::date,$5::date,$6::jsonb,$7) RETURNING id`,[agency,month+'-01',window.start,window.end,window.expected,JSON.stringify(config),getUserId()]);
    const id=batch.rows[0]!.id;
    await client.query(`INSERT INTO agency_revenue_batch_entries (agency_id,batch_id,entry_id,amount)
      SELECT agency_id,$2,id,amount FROM agency_revenue_entries WHERE agency_id=$1 AND id=ANY($3::text[])`,[agency,id,entries.rows.map(e=>e.id)]);
    await client.query(`UPDATE agency_revenue_entries SET status='AVAILABLE',expected_payment_date=$3::date,updated_at=now()
      WHERE agency_id=$1 AND id=ANY($2::text[])`,[agency,entries.rows.map(e=>e.id),window.expected]);
    await recordAuditEvent(client,{eventType:AuditEventType.AGENCY_REVENUE_BATCH_CLOSED,entityType:'agency_revenue_batch',entityId:id,required:true,metadata:{toStatus:'AVAILABLE'}});
    return {id};
  });
}

export async function receiveRevenueBatch(database:DatabaseRuntime,id:string,reference:string|null) {
  requireRole(UserRole.ADMIN);
  if(reference!==null && (typeof reference!=='string'||reference.length>200)) throw new ValidationError('Invalid reference');
  return database.withTenantTransaction(async client => {
    const agency=getAgencyId();
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`revenue-batches:${agency}`]);
    if(!(await client.query('SELECT 1 FROM agency_revenue_batches WHERE agency_id=$1 AND id=$2',[agency,id])).rowCount) throw new NotFoundError('Batch not found');
    if((await client.query('SELECT 1 FROM agency_revenue_batch_receipts WHERE agency_id=$1 AND batch_id=$2',[agency,id])).rowCount) return {id};
    await client.query(`SELECT s.id FROM sales s WHERE s.agency_id=$1 AND EXISTS (SELECT 1 FROM agency_revenue_entries e
      JOIN agency_revenue_batch_entries be ON be.agency_id=e.agency_id AND be.entry_id=e.id
      WHERE e.agency_id=s.agency_id AND e.sale_id=s.id AND be.batch_id=$2) ORDER BY s.id FOR UPDATE`,[agency,id]);
    const entries=await client.query<{status:string}>(`SELECT e.status FROM agency_revenue_entries e JOIN agency_revenue_batch_entries be
      ON be.agency_id=e.agency_id AND be.entry_id=e.id WHERE be.agency_id=$1 AND be.batch_id=$2 FOR UPDATE OF e`,[agency,id]);
    if(!entries.rows.length||entries.rows.some(e=>e.status!=='AVAILABLE')) throw new ConflictError('Every batch entry must be AVAILABLE');
    await client.query(`INSERT INTO agency_revenue_batch_receipts (agency_id,batch_id,reference,created_by) VALUES ($1,$2,$3,$4)`,[agency,id,reference,getUserId()]);
    await client.query(`UPDATE agency_revenue_entries e SET status='RECEIVED',received_amount=be.amount,received_at=now(),received_reference=$3,updated_at=now()
      FROM agency_revenue_batch_entries be WHERE be.agency_id=$1 AND be.batch_id=$2 AND e.agency_id=be.agency_id AND e.id=be.entry_id`,[agency,id,reference]);
    await recordAuditEvent(client,{eventType:AuditEventType.AGENCY_REVENUE_BATCH_RECEIVED,entityType:'agency_revenue_batch',entityId:id,required:true,metadata:{toStatus:'RECEIVED'}});
    return {id};
  });
}
