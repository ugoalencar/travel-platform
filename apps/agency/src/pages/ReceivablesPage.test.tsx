import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReceivablesPage } from './ReceivablesPage';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return {
    ...actual,
    listReceivables: vi.fn(),
    listCustomers: vi.fn(),
    recordPayment: vi.fn(),
    allocatePayment: vi.fn(),
  };
});

const customer = {
  id: 'customer-1',
  agencyId: 'agency-1',
  name: 'Marina Costa',
  email: 'marina@example.com',
  status: 'ACTIVE' as const,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const openReceivable = {
  id: 'receivable-1',
  agencyId: 'agency-1',
  customerId: 'customer-1',
  description: 'Pacote Lisboa',
  amount: 3490,
  dueAt: '2026-09-10T00:00:00.000Z',
  status: 'OPEN' as const,
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(api.listCustomers).mockResolvedValue([customer]);
  vi.mocked(api.listReceivables).mockResolvedValue([openReceivable]);
  vi.mocked(api.recordPayment).mockResolvedValue({
    id: 'payment-1',
    agencyId: 'agency-1',
    direction: 'IN',
    amount: 3490,
    occurredAt: '2026-09-01T00:00:00.000Z',
    method: 'PIX',
    notes: 'Recebido no UAT',
    createdBy: 'user-1',
    createdAt: '2026-09-01T00:00:00.000Z',
  });
  vi.mocked(api.allocatePayment).mockResolvedValue({
    allocations: [],
    targets: [{ ...openReceivable, status: 'PAID' }],
  });
});

function renderPage() {
  render(
    <MemoryRouter>
      <ReceivablesPage />
    </MemoryRouter>,
  );
}

describe('ReceivablesPage', () => {
  it('loads receivables from the API and renders customer-linked data', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Contas a Receber' })).toBeInTheDocument();
    expect(screen.getByText('Marina Costa')).toBeInTheDocument();
    expect(screen.getByText('Pacote Lisboa')).toBeInTheDocument();
    expect(screen.getByText('Aberto')).toBeInTheDocument();
    expect(api.listReceivables).toHaveBeenCalledTimes(1);
  });

  it('records an inbound payment and allocates it to the receivable', async () => {
    renderPage();
    await screen.findByText('Pacote Lisboa');

    fireEvent.click(screen.getByRole('button', { name: /Registrar recebimento/i }));
    fireEvent.change(screen.getByLabelText('Valor recebido *'), { target: { value: '3490' } });
    fireEvent.change(screen.getByLabelText('Data de recebimento *'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Metodo de pagamento'), { target: { value: 'PIX' } });
    fireEvent.change(screen.getByLabelText('Observacoes'), { target: { value: 'Recebido no UAT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar recebimento' }));

    await waitFor(() =>
      expect(api.recordPayment).toHaveBeenCalledWith({
        direction: 'IN',
        amount: 3490,
        occurredAt: '2026-09-01',
        method: 'PIX',
        notes: 'Recebido no UAT',
      }),
    );
    expect(api.allocatePayment).toHaveBeenCalledWith('payment-1', [
      { receivableId: 'receivable-1', amount: 3490 },
    ]);
  });
});
