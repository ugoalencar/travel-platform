import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PaymentConditionsPage } from './PaymentConditionsPage';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    listAllPaymentConditions: vi.fn(),
    createPaymentCondition: vi.fn(),
    revisePaymentCondition: vi.fn(),
    deactivatePaymentCondition: vi.fn(),
  };
});

describe('PaymentConditionsPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('creates a payment condition without sending a client-controlled version', async () => {
    vi.mocked(api.listAllPaymentConditions).mockResolvedValue([]);
    vi.mocked(api.createPaymentCondition).mockResolvedValue({
      id: 'condition-1', name: 'Cartão 10x', version: 1, scheduleKind: 'EQUAL_INSTALLMENTS',
      maxInstallments: 10, minInstallmentAmount: 100, interestFree: true, downPaymentMode: 'NONE',
      downPaymentValue: 0, downPaymentRequired: false, balanceDeadlineAnchor: 'SALE_DATE',
      balanceDeadlineOffsetDays: 0, allowsPartialPayments: true, paymentMethods: ['Cartão'],
      categoryIds: [], productIds: [], active: true,
    });

    render(<PaymentConditionsPage />);
    fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'Cartão 10x' } });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'EQUAL_INSTALLMENTS' } });
    fireEvent.change(screen.getByLabelText('Máximo de parcelas'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Parcela mínima (R$)'), { target: { value: '100' } });
    fireEvent.change(screen.getByPlaceholderText('Cartão, Pix, Boleto'), { target: { value: 'Cartão' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar condição' }));

    await waitFor(() => expect(api.createPaymentCondition).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Cartão 10x', scheduleKind: 'EQUAL_INSTALLMENTS', maxInstallments: 10,
      minInstallmentAmount: 100, paymentMethods: ['Cartão'],
    })));
    expect(vi.mocked(api.createPaymentCondition).mock.calls[0]?.[0]).not.toHaveProperty('version');
  });
});
