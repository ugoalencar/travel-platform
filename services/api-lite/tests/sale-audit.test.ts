import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diffSaleFields, readSaleChanges } from '../src/sale-audit';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

describe('sale field diff', () => {
  const base = {
    customer_id: 'c1',
    seller_id: 's1',
    category_id: 'k1',
    payment_method_id: null,
    description: 'Pacote',
    notes: null,
    sale_date: '2026-10-01',
    due_date: '2026-10-15',
    installment_count: 1,
    gross_amount: '1000.00',
    cost_amount: '800.00',
    margin_amount: '200.00',
  };

  it('reports only changed fields with previous and new values', () => {
    const metadata = diffSaleFields(base, {
      ...base,
      gross_amount: '1500.00',
      margin_amount: '700.00',
      notes: 'Desconto negociado',
    });

    expect(metadata.changed_fields).toBe('notes,gross_amount,margin_amount');
    expect(metadata.old_gross_amount).toBe(1000);
    expect(metadata.new_gross_amount).toBe(1500);
    expect(metadata.old_notes).toBeNull();
    expect(metadata.new_notes).toBe('Desconto negociado');
    expect('old_description' in metadata).toBe(false);
  });

  it('treats numeric strings and numbers as equal and flags truncated text', () => {
    expect(diffSaleFields(base, { ...base, gross_amount: 1000 }).changed_fields).toBe('');
    const long = 'x'.repeat(900);
    const metadata = diffSaleFields(base, { ...base, notes: long });
    expect(String(metadata.new_notes)).toHaveLength(500);
    expect(metadata.notes_truncated).toBe(true);
  });

  it('round-trips through readSaleChanges and ignores unknown fields', () => {
    const metadata = diffSaleFields(base, { ...base, due_date: '2026-11-15' });
    expect(readSaleChanges({ ...metadata, changed_fields: `${String(metadata.changed_fields)},password` })).toEqual([
      { field: 'due_date', from: '2026-10-15', to: '2026-11-15' },
    ]);
    expect(readSaleChanges(null)).toEqual([]);
  });
});

interface HistoryJson {
  history: Array<{
    event_type: string;
    at: string;
    actor: { id: string; name: string } | null;
    changes: Array<{ field: string; from: unknown; to: unknown }>;
  }>;
}

describe('Travel Lite sale audit trail', () => {
  let lite: LiteFixture;
  let staffToken: string;
  let adminToken: string;
  let viewerToken: string;
  let saleId: string;

  beforeAll(async () => {
    lite = await createLiteFixture();
    staffToken = await lite.login('tenant-a', 'staff@a.test');
    adminToken = await lite.login('tenant-a', 'admin@a.test');
    viewerToken = await lite.login('tenant-a', 'viewer@a.test');

    const post = async (url: string, payload: Record<string, unknown>) =>
      lite.app.inject({ method: 'POST', url, headers: lite.headers(staffToken), payload });
    const customer = await post('/customers', { name: 'Cliente Auditoria', email: 'aud@cliente.test' });
    const seller = await post('/sellers', { name: 'Vendedora Auditoria', commission_rule_type: 'UNDEFINED' });
    const category = await post('/categories', { name: 'AÉREO' });
    const sale = await post('/sales', {
      customer_id: customer.json<{ customer: { id: string } }>().customer.id,
      seller_id: seller.json<{ seller: { id: string } }>().seller.id,
      category_id: category.json<{ category: { id: string } }>().category.id,
      gross_amount: 1000,
      cost_amount: 800,
      due_date: '2026-10-15',
    });
    saleId = sale.json<{ sale: { id: string } }>().sale.id;
  });

  afterAll(async () => {
    await lite?.close();
  });

  async function history(token = adminToken) {
    return lite.app.inject({ method: 'GET', url: `/sales/${saleId}/history`, headers: lite.headers(token) });
  }

  it('records who created the sale and with which values', async () => {
    const response = await history();
    expect(response.statusCode).toBe(200);
    const [created] = response.json<HistoryJson>().history;
    expect(created?.event_type).toBe('SALE_CREATED');
    expect(created?.actor?.name).toBe('Staff A');
    expect(created?.changes).toContainEqual({ field: 'gross_amount', from: null, to: 1000 });
  });

  it('records each editor, timestamp and previous/new values per edit', async () => {
    const first = await lite.app.inject({
      method: 'PATCH',
      url: `/sales/${saleId}`,
      headers: lite.headers(staffToken),
      payload: { gross_amount: 1500, notes: 'Desconto negociado' },
    });
    expect(first.statusCode).toBe(200);
    const second = await lite.app.inject({
      method: 'PATCH',
      url: `/sales/${saleId}`,
      headers: lite.headers(adminToken),
      payload: { due_date: '2026-11-15' },
    });
    expect(second.statusCode).toBe(200);

    const { history: events } = (await history()).json<HistoryJson>();
    const updates = events.filter((event) => event.event_type === 'SALE_UPDATED');
    expect(updates).toHaveLength(2);
    expect(updates[0]?.actor?.name).toBe('Staff A');
    expect(updates[0]?.changes).toEqual(
      expect.arrayContaining([
        { field: 'notes', from: null, to: 'Desconto negociado' },
        { field: 'gross_amount', from: 1000, to: 1500 },
        { field: 'margin_amount', from: 200, to: 700 },
      ]),
    );
    expect(updates[1]?.actor?.name).toBe('Admin A');
    expect(updates[1]?.changes).toEqual([{ field: 'due_date', from: '2026-10-15', to: '2026-11-15' }]);
    expect(Date.parse(updates[1]!.at)).toBeGreaterThanOrEqual(Date.parse(updates[0]!.at));
  });

  it('refuses the edit when the audit entry cannot be written', async () => {
    await lite.adminPool.query(`
      CREATE FUNCTION reject_sale_update_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'audit unavailable'; END $$;
      CREATE TRIGGER reject_sale_update_audit BEFORE INSERT ON audit_logs
        FOR EACH ROW WHEN (NEW.event_type = 'SALE_UPDATED') EXECUTE FUNCTION reject_sale_update_audit();
    `);
    try {
      const response = await lite.app.inject({
        method: 'PATCH',
        url: `/sales/${saleId}`,
        headers: lite.headers(staffToken),
        payload: { gross_amount: 9999 },
      });
      expect(response.statusCode).toBe(500);
    } finally {
      await lite.adminPool.query(
        'DROP TRIGGER reject_sale_update_audit ON audit_logs; DROP FUNCTION reject_sale_update_audit();',
      );
    }

    const detail = await lite.app.inject({
      method: 'GET',
      url: `/sales/${saleId}`,
      headers: lite.headers(adminToken),
    });
    expect(detail.json<{ sale: { gross_amount: number } }>().sale.gross_amount).toBe(1500);
  });

  it('records confirmation and cancellation transitions', async () => {
    const confirm = await lite.app.inject({
      method: 'POST',
      url: `/sales/${saleId}/confirm`,
      headers: lite.headers(adminToken),
    });
    expect(confirm.statusCode).toBe(200);
    const cancel = await lite.app.inject({
      method: 'POST',
      url: `/sales/${saleId}/cancel`,
      headers: lite.headers(adminToken),
    });
    expect(cancel.statusCode).toBe(200);

    const types = (await history()).json<HistoryJson>().history.map((event) => event.event_type);
    expect(types.slice(-2)).toEqual(['SALE_CONFIRMED', 'SALE_CANCELLED']);

    const raw = await lite.adminPool.query<{ metadata: Record<string, unknown> }>(
      "SELECT metadata FROM audit_logs WHERE entity_id = $1 AND event_type = 'SALE_CANCELLED'",
      [saleId],
    );
    expect(raw.rows[0]!.metadata).toMatchObject({ old_status: 'CONFIRMED', new_status: 'CANCELLED' });
  });

  it('hides the history of a sale that does not exist for the principal', async () => {
    const response = await lite.app.inject({
      method: 'GET',
      url: '/sales/00000000-0000-4000-8000-000000000000/history',
      headers: lite.headers(adminToken),
    });
    expect(response.statusCode).toBe(404);
    expect((await history(viewerToken)).statusCode).toBe(200);
  });
});
