import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SalesPage } from './SalesPage';
import { listSales, listCustomers, ApiError } from '../lib/api';
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
    listSales: vi.fn().mockResolvedValue([]),
    listCustomers: vi.fn().mockResolvedValue([]),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/sales']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/sales/new" element={<div>Nova venda page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const customers: Customer[] = [
  {
    id: 'c1',
    agencyId: 'a1',
    name: 'Maria Silva',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const sales: Sale[] = [
  {
    id: 's1',
    agencyId: 'a1',
    customerId: 'c1',
    userId: 'u1',
    amount: 100,
    discount: 10,
    total: 90,
    status: 'PENDING',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('SalesPage', () => {
  it('shows a loading state initially', () => {
    vi.mocked(listSales).mockReturnValue(new Promise(() => {}));
    renderRouted();
    expect(screen.getByText('Carregando vendas...')).toBeInTheDocument();
  });

  it('renders real data with resolved customer name, amount/discount/total/status', async () => {
    vi.mocked(listSales).mockResolvedValue(sales);
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('R$ 100,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 90,00')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
  });

  it('shows an empty state with no crash', async () => {
    vi.mocked(listSales).mockResolvedValue([]);
    renderRouted();
    expect(
      await screen.findByText('Nenhuma venda cadastrada ainda.'),
    ).toBeInTheDocument();
  });

  it('shows an error message on failure', async () => {
    vi.mocked(listSales).mockRejectedValue(
      new ApiError('Erro ao listar', 'INTERNAL_ERROR', 500),
    );
    renderRouted();
    expect(await screen.findByText('Erro ao listar')).toBeInTheDocument();
  });

  it('navigates to /sales/new when "+ Nova venda" is clicked', async () => {
    vi.mocked(listSales).mockResolvedValue([]);
    renderRouted();
    await screen.findByText('Nenhuma venda cadastrada ainda.');

    fireEvent.click(screen.getByRole('button', { name: '+ Nova venda' }));

    expect(await screen.findByText('Nova venda page')).toBeInTheDocument();
  });
});
