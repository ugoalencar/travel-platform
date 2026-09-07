import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PayablesPage } from './PayablesPage';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return {
    ...actual,
    listPayables: vi.fn(),
    createPayable: vi.fn(),
    recordPayment: vi.fn(),
    allocatePayment: vi.fn(),
    listSuppliers: vi.fn(),
  };
});

const supplier = {
  id: 'supplier-1',
  agencyId: 'agency-1',
  name: 'Hotel Atlântico',
  supplierType: 'TRAVEL' as const,
  active: true,
  categories: [],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const openPayable = {
  id: 'payable-1',
  agencyId: 'agency-1',
  supplierId: 'supplier-1',
  description: 'Comissão do hotel',
  amount: 1250,
  dueAt: '2026-09-10T00:00:00.000Z',
  status: 'OPEN' as const,
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(api.listSuppliers).mockResolvedValue([supplier]);
  vi.mocked(api.listPayables).mockResolvedValue([openPayable]);
  vi.mocked(api.createPayable).mockResolvedValue(openPayable);
  vi.mocked(api.recordPayment).mockResolvedValue({
    id: 'payment-1',
    agencyId: 'agency-1',
    direction: 'OUT',
    amount: 1250,
    occurredAt: '2026-09-01T00:00:00.000Z',
    method: 'PIX',
    notes: 'Pago no UAT',
    createdBy: 'user-1',
    createdAt: '2026-09-01T00:00:00.000Z',
  });
  vi.mocked(api.allocatePayment).mockResolvedValue({
    allocations: [],
    targets: [{ ...openPayable, status: 'PAID' }],
  });
});

function renderPage() {
  render(
    <MemoryRouter>
      <PayablesPage />
    </MemoryRouter>,
  );
}

describe('PayablesPage', () => {
  it('loads payables from the API and renders Portuguese finance labels', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Contas a Pagar' })).toBeInTheDocument();
    expect(await screen.findByText('Comissão do hotel')).toBeInTheDocument();
    expect(screen.getByText('Hotel Atlântico')).toBeInTheDocument();
    expect(screen.getAllByText('Aberto').length).toBeGreaterThan(0);
    expect(api.listPayables).toHaveBeenCalledTimes(1);
  });

  it('creates a payable with supplier, due date, amount, method and notes', async () => {
    renderPage();
    await screen.findByText('Comissão do hotel');

    fireEvent.click(screen.getByRole('button', { name: /Nova Conta a Pagar/i }));
    fireEvent.change(screen.getByLabelText('Fornecedor'), { target: { value: 'supplier-1' } });
    fireEvent.change(screen.getByLabelText('Descrição *'), { target: { value: 'Seguro viagem' } });
    fireEvent.change(screen.getByLabelText('Valor (R$) *'), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText('Vencimento *'), { target: { value: '2026-09-15' } });
    fireEvent.change(screen.getByLabelText('Método de pagamento'), { target: { value: 'Boleto' } });
    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: 'Pago ao fornecedor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(api.createPayable).toHaveBeenCalledWith({
        supplierId: 'supplier-1',
        description: 'Seguro viagem',
        amount: 300,
        dueAt: '2026-09-15',
      }),
    );
  });

  it('records an outbound payment and allocates it to change lifecycle status', async () => {
    renderPage();
    await screen.findByText('Comissão do hotel');

    fireEvent.click(screen.getByRole('button', { name: /Registrar pagamento/i }));
    fireEvent.change(screen.getByLabelText('Valor pago *'), { target: { value: '1250' } });
    fireEvent.change(screen.getByLabelText('Data de pagamento *'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Método de pagamento'), { target: { value: 'PIX' } });
    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: 'Pago no UAT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));

    await waitFor(() =>
      expect(api.recordPayment).toHaveBeenCalledWith({
        direction: 'OUT',
        amount: 1250,
        occurredAt: '2026-09-01',
        method: 'PIX',
        notes: 'Pago no UAT',
      }),
    );
    expect(api.allocatePayment).toHaveBeenCalledWith('payment-1', [
      { payableId: 'payable-1', amount: 1250 },
    ]);
  });
});
