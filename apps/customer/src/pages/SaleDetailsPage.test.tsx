import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SaleDetailsPage } from './SaleDetailsPage';
import { getSale, getCustomer, ApiError } from '../lib/api';
import type { Sale } from '../types/sale';
import type { Customer } from '../types/customer';

vi.mock('../lib/api', () => {
  class MockApiError extends Error {
    code: string;
    status: number;
    constructor(message: string, code: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    getSale: vi.fn(),
    getCustomer: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/sales/s1']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/sales/:id" element={<SaleDetailsPage />} />
        <Route path="/sales" element={<div>Vendas page</div>} />
        <Route path="/sales/:id/edit" element={<div>Editar venda page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const customer: Customer = {
  id: 'c1',
  agencyId: 'a1',
  name: 'Maria Silva',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const saleWithProposal: Sale = {
  id: 's1',
  agencyId: 'a1',
  customerId: 'c1',
  proposalId: 'p1',
  userId: 'u1',
  amount: 100,
  discount: 10,
  total: 90,
  status: 'PENDING',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const saleWithoutProposal: Sale = {
  id: 's2',
  agencyId: 'a1',
  customerId: 'c1',
  userId: 'u1',
  amount: 200,
  discount: 0,
  total: 200,
  status: 'PENDING',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('SaleDetailsPage', () => {
  it('shows a loading state initially', () => {
    vi.mocked(getSale).mockReturnValue(new Promise(() => {}));
    renderRouted();
    expect(screen.getByText('Carregando venda...')).toBeInTheDocument();
  });

  it('renders real data: customer name, server-computed total, status as plain text', async () => {
    vi.mocked(getSale).mockResolvedValue(saleWithProposal);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('R$ 90,00')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getByText('p1')).toBeInTheDocument();
  });

  it('shows the optional Proposal relation as absent when not present', async () => {
    vi.mocked(getSale).mockResolvedValue(saleWithoutProposal);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    await screen.findByText('Maria Silva');
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows a 404 message when the sale does not exist', async () => {
    vi.mocked(getSale).mockRejectedValue(new ApiError('Not found', 'NOT_FOUND', 404));
    renderRouted();

    expect(await screen.findByText('Venda não encontrada.')).toBeInTheDocument();
  });

  it('navigates to edit page when "Editar" is clicked', async () => {
    vi.mocked(getSale).mockResolvedValue(saleWithoutProposal);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    await screen.findByText('Maria Silva');
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(await screen.findByText('Editar venda page')).toBeInTheDocument();
  });

  it('never shows any status-transition or Commission-related action', async () => {
    vi.mocked(getSale).mockResolvedValue(saleWithoutProposal);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    await screen.findByText('Maria Silva');
    expect(screen.queryByText(/Commission|Comissão/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Confirmar|Pagar|Cancelar Venda|Reembolsar/i }),
    ).not.toBeInTheDocument();
  });
});
