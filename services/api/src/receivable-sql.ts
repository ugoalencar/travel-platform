// Agency timezone is not configurable in the current schema. Match sale_date.
export const receivableTimezone = 'America/Sao_Paulo';

// Legacy financial fixtures may use a schema predating the civil-date column.
export const receivableDueDateSql = `(to_jsonb(r)->>'due_date')::date`;

// These expressions require the tenant-scoped receivable alias r.
export const outstandingReceivableSql = `GREATEST(r.amount - COALESCE((
  SELECT SUM(pa.amount) FROM payment_allocations pa
  WHERE pa.agency_id=r.agency_id AND pa.receivable_id=r.id
    AND NOT EXISTS (SELECT 1 FROM sale_payment_reversals spr WHERE spr.agency_id=pa.agency_id AND spr.original_payment_id=pa.payment_id)
),0),0)`;

export function overdueReceivableSql(instant: string): string {
  return `(CASE WHEN ${receivableDueDateSql} IS NOT NULL
    THEN ${receivableDueDateSql} < (${instant}::timestamptz AT TIME ZONE '${receivableTimezone}')::date
    ELSE r.due_at < ${instant}::timestamptz END)`;
}
