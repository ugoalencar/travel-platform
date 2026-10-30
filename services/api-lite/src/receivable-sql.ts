export const receivableTimezone = 'America/Sao_Paulo';

// Lite already stores due_at as DATE and imported paid_amount must remain authoritative.
export const outstandingReceivableSql = 'GREATEST(r.amount - r.paid_amount,0)';

export function overdueReceivableSql(instant: string): string {
  return `(r.due_at < (${instant}::timestamptz AT TIME ZONE '${receivableTimezone}')::date)`;
}
