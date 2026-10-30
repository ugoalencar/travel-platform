/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/consistent-type-imports -- async mock implementations and typeof import() for vi.mock, as in the other Lite tests */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import type { SaleBalance, PaymentCondition } from './paymentSchedule';

const mock = vi.hoisted(() => ({ api: vi.fn(), role: 'ADMIN', manage: true }));
vi.mock('./api', async (original) => ({ ...await original<typeof import('./api')>(), api: mock.api }));
vi.mock('./auth', () => ({ useCan: () => mock.manage }));
import { SalePaymentPanel } from './SalePaymentPanel';

const condition: PaymentCondition = { id: 'c1', name: 'Parcelado', version: 1, scheduleKind: 'EQUAL_INSTALLMENTS',
  maxInstallments: 10, minInstallmentAmount: 100, interestFree: true, downPaymentMode: 'NONE', downPaymentValue: 0,
  downPaymentRequired: false, balanceDeadlineAnchor: 'SALE_DATE', balanceDeadlineOffsetDays: 0,
  allowsPartialPayments: true, paymentMethods: ['PIX'], categoryIds: [], productIds: [] };
const sale = { id: 's1', gross_amount: 1000, sale_date: '2028-01-31', travel_start_date: '2028-12-20', status: 'CONFIRMED' };
let current: SaleBalance;
let attempts: object[];
let failOnce: boolean;
let stale: boolean;
function mount() { return render(<SalePaymentPanel sale={sale} role={mock.role} onChange={vi.fn()} />); }
function fill(amount: string) {
  fireEvent.change(screen.getByLabelText('Valor da baixa'), { target: { value: amount } });
  fireEvent.change(screen.getByLabelText('Data da baixa'), { target: { value: '2028-12-05' } });
  fireEvent.change(screen.getByLabelText('Forma da baixa'), { target: { value: 'PIX' } });
  fireEvent.change(screen.getByLabelText('Conta financeira'), { target: { value: 'a1' } });
}
beforeEach(() => {
  mock.role = 'ADMIN'; mock.manage = true; failOnce = false; stale = false; attempts = [];
  current = { total: 1000, received: 0, remaining: 1000, status: 'OPEN', receivables: [], next_due: null,
    last_payment_at: null, settled_at: null, down_payment_pending: false, balance_deadline: null, late: false, snapshot: null };
  mock.api.mockReset();
  mock.api.mockImplementation(async (path: string, options?: { body?: Record<string, unknown> }) => {
    if (path === '/payment-conditions') return { conditions: [condition] };
    if (path === '/financial-accounts') return { items: [{ id: 'a1', name: 'Caixa' }] };
    if (path === '/sales/s1/balance') { if (stale) throw new Error('network'); return current; }
    if (path === '/sales/s1/payment-schedule') {
      current = { ...current, snapshot: { version: 1, condition, paymentMethod: 'PIX', travelerInstallments: 10,
        total: 1000, saleDate: sale.sale_date, travelStart: sale.travel_start_date, schedule: [] } };
      return current;
    }
    if (path === '/sales/s1/payments') {
      attempts.push(options!.body!);
      if (failOnce) { failOnce = false; throw new ApiError(503, 'Indisponível'); }
      const value = Number(options!.body!.amount);
      current = { ...current, received: current.received + value, remaining: current.remaining - value };
      return { paymentId: 'p1', balance: current };
    }
    if (path === '/sales/s1/payment-schedule/revise') return { ...current, snapshot: { ...current.snapshot, version: 2 } };
    throw new Error(`Unexpected ${path}`);
  });
});
async function applied() {
  mount();
  fireEvent.change(await screen.findByLabelText('Condição de pagamento'), { target: { value: 'c1' } });
  fireEvent.change(screen.getByLabelText('Quantidade de parcelas'), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar cronograma' }));
  await screen.findByRole('form', { name: 'Baixa parcial' });
}
describe('Lite payment panel', () => {
  it('previews ten installments of 100 and sends only the approved choice', async () => {
    await applied();
    expect(mock.api).toHaveBeenCalledWith('/sales/s1/payment-schedule', { method: 'POST', body: {
      conditionId: 'c1', installments: 10, paymentMethod: 'PIX' } });
  });
  it('records 300 and 400 against remaining balance 700 and refuses excess', async () => {
    await applied();
    current = { ...current, received: 300, remaining: 700 };
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar saldo' }));
    await waitFor(() => expect(screen.getByLabelText('Saldo da venda')).toHaveTextContent('700'));
    fill('701'); fireEvent.click(screen.getByRole('button', { name: 'Registrar baixa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('maior que o saldo');
    expect(attempts).toHaveLength(0);
    fill('300'); fireEvent.click(screen.getByRole('button', { name: 'Registrar baixa' }));
    await waitFor(() => expect(screen.getByLabelText('Saldo da venda')).toHaveTextContent('400'));
    fill('400'); fireEvent.click(screen.getByRole('button', { name: 'Registrar baixa' }));
    await waitFor(() => expect(attempts).toHaveLength(2));
    expect(current.remaining).toBe(0);
  });
  it('retains the exact payload and key across uncertain failures', async () => {
    await applied(); failOnce = true;
    fill('300'); fireEvent.click(screen.getByRole('button', { name: 'Registrar baixa' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar baixa' }));
    await waitFor(() => expect(attempts).toHaveLength(2));
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0]).toMatchObject({ amount: 300, account_id: 'a1', paid_at: '2028-12-05T00:00:00-03:00' });
  });
  it('blocks a second payment when balance refresh fails after confirmed payment', async () => {
    await applied();
    fill('300'); stale = true;
    fireEvent.click(screen.getByRole('button', { name: 'Registrar baixa' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar baixa' })).toBeDisabled());
    expect(attempts).toHaveLength(1);
  });
  it('requires a revision reason and hides revision for managers', async () => {
    await applied();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar condição' }));
    expect(screen.getByRole('button', { name: 'Confirmar revisão' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motivo da revisão'), { target: { value: 'Viagem adiada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar revisão' }));
    await waitFor(() => expect(mock.api).toHaveBeenCalledWith('/sales/s1/payment-schedule/revise', { method: 'POST', body: { reason: 'Viagem adiada' } }));
  });
  it('keeps read-only users from applying and collecting', async () => {
    mock.manage = false; mock.role = 'VIEWER'; mount();
    await screen.findByText('Nenhum cronograma aplicado.');
    expect(screen.queryByRole('button', { name: 'Aplicar cronograma' })).not.toBeInTheDocument();
  });
});
