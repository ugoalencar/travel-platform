import { afterEach, describe, expect, it, vi } from 'vitest';
import { applySalePaymentSchedule, getSaleBalance, getSalePaymentSchedule, listPaymentConditions,
  recordSalePayment, reviseSalePaymentSchedule } from './api';

afterEach(() => vi.unstubAllGlobals());
describe('cliente de cronograma Full', () => {
  it('usa as rotas existentes e envia somente os campos do contrato', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ conditions: [] }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listPaymentConditions()).resolves.toEqual([]);
    await getSaleBalance('sale/id');
    await getSalePaymentSchedule('sale/id');
    const choice = { conditionId: 'condition', installments: 10, paymentMethod: 'PIX' };
    await applySalePaymentSchedule('sale/id', choice);
    const payment = { amount: 300, method: 'PIX', paid_at: '2026-02-10T00:00:00-03:00', idempotency_key: 'attempt-1' };
    await recordSalePayment('sale/id', payment);
    await recordSalePayment('sale/id', payment);
    await reviseSalePaymentSchedule('sale/id', 'Reagendamento');
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/payment-conditions', '/api/sales/sale%2Fid/balance', '/api/sales/sale%2Fid/payment-schedule',
      '/api/sales/sale%2Fid/payment-schedule', '/api/sales/sale%2Fid/payments', '/api/sales/sale%2Fid/payments',
      '/api/sales/sale%2Fid/payment-schedule/revise',
    ]);
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify(choice) });
    expect(fetchMock.mock.calls[4]?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify(payment) });
    expect(fetchMock.mock.calls[5]?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify(payment) });
    expect(fetchMock.mock.calls[6]?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ reason: 'Reagendamento' }) });
  });
});
