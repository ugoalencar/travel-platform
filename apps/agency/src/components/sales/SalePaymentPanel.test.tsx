import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SalePaymentPanel } from './SalePaymentPanel';
import * as api from '../../lib/api';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import type { CurrentUserRole } from '../../hooks/useCurrentUser';
import type { PaymentCondition, SaleBalance } from '../../lib/paymentSchedule';
import type { Sale } from '../../types/sale';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SaleSummaryPage } from '../../pages/SalesJourneyPages';

vi.mock('../../lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof api>(),
  listPaymentConditions: vi.fn(), getSaleBalance: vi.fn(), applySalePaymentSchedule: vi.fn(),
  recordSalePayment: vi.fn(), reviseSalePaymentSchedule: vi.fn(),
  reverseSalePayment: vi.fn(),
  getSale: vi.fn(), getSaleFinancialStory: vi.fn(),
}));
vi.mock('../../hooks/useCurrentUser', () => ({ useCurrentUser: vi.fn() }));

const sale: Sale = {
  id: 'sale-1', agencyId: 'agency-1', customerId: 'customer-1', customerName: 'Cliente',
  salespersonName: null, tripId: null, tripName: null, userId: 'user-1', amount: 1000,
  discount: 0, total: 1000, status: 'CONFIRMED', saleDate: '2026-01-31',
  createdAt: '2026-01-31T12:00:00Z', updatedAt: '2026-01-31T12:00:00Z',
};
const condition: PaymentCondition = {
  id: 'condition-1', name: 'Mensal sem juros', version: 1, scheduleKind: 'EQUAL_INSTALLMENTS',
  maxInstallments: 10, minInstallmentAmount: null, interestFree: true, downPaymentMode: 'NONE',
  downPaymentValue: 0, downPaymentRequired: false, balanceDeadlineAnchor: 'SALE_DATE',
  balanceDeadlineOffsetDays: 0, allowsPartialPayments: true, paymentMethods: ['PIX'], categoryIds: [], productIds: [],
};
const entry: PaymentCondition = { ...condition, name: 'Entrada 30%', scheduleKind: 'DOWN_PAYMENT_PLUS_BALANCE',
  downPaymentMode: 'PERCENT', downPaymentValue: 30, downPaymentRequired: true };
const empty: SaleBalance = {
  total: 1000, received: 0, remaining: 1000, status: 'OPEN', receivables: [], next_due: null,
  last_payment_at: null, settled_at: null, down_payment_pending: false, balance_deadline: null,
  late: false, snapshot: null,
};
function balance(paid: number): SaleBalance {
  return { ...empty, received: 300 + paid, remaining: 700 - paid,
    status: paid === 700 ? 'PAID' : 'PARTIALLY_PAID',
    snapshot: { version: 1, condition: entry, paymentMethod: 'PIX', travelerInstallments: 1,
      saleDate: '2026-01-31', travelStart: null, total: 1000, schedule: [] },
    receivables: [
      { id: 'entry', kind: 'DOWN_PAYMENT', amount: 300, paid: 300, due: '2026-01-31', status: 'PAID', late: false },
      { id: 'balance', kind: 'BALANCE', amount: 700, paid, due: '2026-02-28', status: paid === 700 ? 'PAID' : 'OPEN', late: false },
    ],
  };
}
function role(value: CurrentUserRole) {
  vi.mocked(useCurrentUser).mockReturnValue({ loading: false,
    user: { userId: 'user-1', agencyId: 'agency-1', role: value } });
}
function payment(amount: string) {
  fireEvent.change(screen.getByLabelText('Valor da baixa'), { target: { value: amount } });
  fireEvent.change(screen.getByLabelText('Data da baixa'), { target: { value: '2026-02-10' } });
  fireEvent.change(screen.getByLabelText('Forma da baixa'), { target: { value: 'PIX' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registrar baixa' }));
}
beforeEach(() => {
  vi.resetAllMocks(); role('MANAGER');
  vi.mocked(api.listPaymentConditions).mockResolvedValue([condition]);
  vi.mocked(api.getSaleBalance).mockResolvedValue(empty);
});
afterEach(cleanup);

describe('Pagamento da venda', () => {
  it('mostra prévia de R$ 1.000 em dez parcelas de R$ 100 e aplica somente a escolha', async () => {
    vi.mocked(api.applySalePaymentSchedule).mockResolvedValue(balance(0));
    render(<SalePaymentPanel sale={sale} />);
    fireEvent.change(await screen.findByLabelText('Condição de pagamento'), { target: { value: condition.id } });
    fireEvent.change(screen.getByLabelText('Quantidade de parcelas'), { target: { value: '10' } });
    const table = screen.getByRole('table', { name: 'Prévia do cronograma' });
    expect(within(table).getAllByRole('row')).toHaveLength(11);
    expect(within(table).getAllByText(/100,00/)).toHaveLength(10);
    expect(within(table).getByText('28/02/2026')).toBeInTheDocument();
    expect(within(table).getByText('31/03/2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cronograma' }));
    await waitFor(() => expect(api.applySalePaymentSchedule).toHaveBeenCalledWith('sale-1', {
      conditionId: condition.id, installments: 10, paymentMethod: 'PIX',
    }));
  });

  it('mostra entrada de 30% e saldo de 700 na prévia', async () => {
    vi.mocked(api.listPaymentConditions).mockResolvedValue([entry]);
    render(<SalePaymentPanel sale={sale} />);
    fireEvent.change(await screen.findByLabelText('Condição de pagamento'), { target: { value: entry.id } });
    const table = screen.getByRole('table', { name: 'Prévia do cronograma' });
    expect(within(table).getByText(/300,00/)).toBeInTheDocument();
    expect(within(table).getByText(/700,00/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Quantidade de parcelas')).not.toBeInTheDocument();
  });

  it('exige motivo e permite estornar um recebimento para gerente', async () => {
    const received = { ...balance(0), received: 300, remaining: 700, status: 'PARTIALLY_PAID' as const,
      payments: [{ id: 'payment-1', amount: 300, method: 'PIX', paid_at: '2026-02-10T12:00:00.000Z', reversed: false }] };
    const reversed: SaleBalance = {
      ...received,
      received: 0,
      remaining: 1000,
      status: 'OPEN',
      payments: [{ ...received.payments[0]!, reversed: true }],
    };
    vi.mocked(api.getSaleBalance).mockResolvedValueOnce(received).mockResolvedValue(reversed);
    vi.mocked(api.reverseSalePayment).mockResolvedValue({ reversalPaymentId: 'reverse-1', balance: reversed });
    render(<SalePaymentPanel sale={sale} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Estornar' }));
    expect(screen.getByRole('button', { name: 'Confirmar estorno' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motivo obrigatório do estorno'), { target: { value: 'Recebimento duplicado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar estorno' }));
    await waitFor(() => expect(api.reverseSalePayment).toHaveBeenCalledWith('sale-1', 'payment-1', 'Recebimento duplicado'));
  });

  it('quita saldo de 700 com duas baixas de 300 e 400, com chaves distintas e saldo atualizado', async () => {
    vi.mocked(api.getSaleBalance).mockResolvedValueOnce(balance(0)).mockResolvedValueOnce(balance(300)).mockResolvedValue(balance(700));
    vi.mocked(api.recordSalePayment).mockResolvedValue({ paymentId: 'payment', balance: balance(0) });
    render(<SalePaymentPanel sale={sale} />);
    await screen.findByLabelText('Valor da baixa'); payment('300');
    await waitFor(() => expect(screen.getByLabelText('Saldo da venda')).toHaveTextContent(/400,00/));
    payment('400');
    await waitFor(() => expect(screen.getByLabelText('Saldo da venda')).toHaveTextContent(/^R\$\s*0,00$/));
    const calls = vi.mocked(api.recordSalePayment).mock.calls;
    expect(calls[0]?.[1]).toMatchObject({ amount: 300, method: 'PIX', paid_at: '2026-02-10T00:00:00-03:00' });
    expect(calls[1]?.[1].amount).toBe(400);
    expect(calls[0]?.[1].idempotency_key).not.toBe(calls[1]?.[1].idempotency_key);
    expect(screen.queryByLabelText('Valor da baixa')).not.toBeInTheDocument();
  });

  it('bloqueia valor maior que o saldo e exibe erro do servidor em português', async () => {
    vi.mocked(api.getSaleBalance).mockResolvedValue(balance(0));
    vi.mocked(api.recordSalePayment).mockRejectedValue(new api.ApiError('Payment exceeds sale balance', 'FIELD_INVALID', 422));
    render(<SalePaymentPanel sale={sale} />);
    await screen.findByLabelText('Valor da baixa'); payment('701');
    expect(await screen.findByRole('alert')).toHaveTextContent('O valor não pode ser maior que o saldo.');
    expect(api.recordSalePayment).not.toHaveBeenCalled();
    payment('700');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('A baixa excede o saldo da venda.'));
  });

  it('reenvia a mesma tentativa após falha de rede e permite nova chave só após resolução', async () => {
    vi.mocked(api.getSaleBalance).mockResolvedValue(balance(0));
    vi.mocked(api.recordSalePayment).mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ paymentId: 'payment', balance: balance(300) });
    render(<SalePaymentPanel sale={sale} />);
    await screen.findByLabelText('Valor da baixa'); payment('300');
    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar baixa' }));
    await waitFor(() => expect(api.recordSalePayment).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.recordSalePayment).mock.calls[0]?.[1]).toEqual(vi.mocked(api.recordSalePayment).mock.calls[1]?.[1]);
  });

  it('não repete baixa confirmada quando a leitura de saldo falha', async () => {
    vi.mocked(api.getSaleBalance).mockResolvedValueOnce(balance(0))
      .mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(balance(300));
    vi.mocked(api.recordSalePayment).mockResolvedValue({ paymentId: 'payment', balance: balance(300) });
    render(<SalePaymentPanel sale={sale} />);
    await screen.findByLabelText('Valor da baixa'); payment('300');
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível atualizar o saldo.');
    expect(screen.getByRole('button', { name: 'Registrar baixa' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar saldo' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar baixa' })).not.toBeDisabled());
    expect(api.recordSalePayment).toHaveBeenCalledTimes(1);
  });

  it.each(['MANAGER', 'AGENT', 'VIEWER'] as const)('não oferece revisão para %s', async (value) => {
    role(value); vi.mocked(api.getSaleBalance).mockResolvedValue(balance(0));
    render(<SalePaymentPanel sale={sale} />);
    if (value === 'MANAGER') await screen.findByLabelText('Saldo da venda');
    else await screen.findByText('A consulta de pagamentos exige acesso de gerente ou administrador.');
    expect(screen.queryByRole('button', { name: 'Revisar condição' })).not.toBeInTheDocument();
    if (value !== 'MANAGER') expect(api.getSaleBalance).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'OWNER'] as const)('exige motivo e revisa para %s', async (value) => {
    role(value); vi.mocked(api.getSaleBalance).mockResolvedValue(balance(0));
    vi.mocked(api.reviseSalePaymentSchedule).mockResolvedValue(balance(0));
    render(<SalePaymentPanel sale={sale} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar condição' }));
    expect(screen.getByRole('button', { name: 'Confirmar revisão' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motivo da revisão'), { target: { value: 'Nova data de embarque' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar revisão' }));
    await waitFor(() => expect(api.reviseSalePaymentSchedule).toHaveBeenCalledWith('sale-1', 'Nova data de embarque'));
  });

  it('mostra carregamento, erro de leitura e permite tentar novamente', async () => {
    vi.mocked(api.getSaleBalance).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(empty);
    render(<SalePaymentPanel sale={sale} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando pagamento');
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Nenhum cronograma aplicado.')).toBeInTheDocument();
  });

  it('informa quando não existem condições cadastradas', async () => {
    vi.mocked(api.listPaymentConditions).mockResolvedValue([]);
    render(<SalePaymentPanel sale={sale} />);
    expect(await screen.findByText('Nenhuma condição de pagamento disponível.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aplicar cronograma' })).not.toBeInTheDocument();
  });

  it('integra o painel ao detalhe existente da venda', async () => {
    vi.mocked(api.getSale).mockResolvedValue(sale);
    vi.mocked(api.getSaleFinancialStory).mockRejectedValue(new Error('Sem resumo'));
    render(<MemoryRouter initialEntries={['/sales/sale-1']}>
      <Routes><Route path="/sales/:id" element={<SaleSummaryPage />} /></Routes>
    </MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Pagamento' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Condição de pagamento')).toBeInTheDocument();
    expect(api.getSaleBalance).toHaveBeenCalledWith('sale-1');
  });
});
