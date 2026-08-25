import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerDetailsPage } from './CustomerDetailsPage';
import { CustomersPage } from './CustomersPage';
import { getCustomer, listCustomers, ApiError } from '../lib/api';
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
    listCustomers: vi.fn().mockResolvedValue([]),
    getCustomer: vi.fn(),
    listWishes: vi.fn().mockResolvedValue([]),
    listProposals: vi.fn().mockResolvedValue([]),
    listTrips: vi.fn().mockResolvedValue([]),
    ApiError: MockApiError,
  };
});

vi.mock('../lib/commercialApi', () => ({
  listOpportunities: vi.fn().mockResolvedValue([]),
  listInteractions: vi.fn().mockResolvedValue([]),
  listTasks: vi.fn().mockResolvedValue([]),
  listPipelines: vi.fn().mockResolvedValue([]),
  listStages: vi.fn().mockResolvedValue([]),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const fullCustomer: Customer = {
  id: 'c1',
  agencyId: 'a1',
  name: 'Maria Silva',
  email: 'maria@example.com',
  phone: '+55 11 90000-0000',
  cpf: '123.456.789-00',
  passport: 'AB123456',
  notes: 'VIP client',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('CustomerDetailsPage', () => {
  it('"Detalhes" navigates to /customers/:id', async () => {
    vi.mocked(listCustomers).mockResolvedValue([fullCustomer]);
    vi.mocked(getCustomer).mockReturnValue(new Promise(() => {}));

    renderRouted(['/customers']);

    fireEvent.click(await screen.findByRole('button', { name: 'Detalhes' }));

    expect(
      await screen.findByRole('heading', { name: 'Detalhes do cliente' }),
    ).toBeInTheDocument();
  });

  it('renders with a loading state first', () => {
    vi.mocked(getCustomer).mockReturnValue(new Promise(() => {}));
    renderRouted(['/customers/c1']);

    expect(screen.getByText('Carregando cliente...')).toBeInTheDocument();
  });

  it('renders real customer data with all fields', async () => {
    vi.mocked(getCustomer).mockResolvedValue(fullCustomer);
    renderRouted(['/customers/c1']);

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('maria@example.com')).toBeInTheDocument();
    expect(screen.getByText('+55 11 90000-0000')).toBeInTheDocument();
    expect(screen.getByText('123.456.789-00')).toBeInTheDocument();
    expect(screen.getByText('AB123456')).toBeInTheDocument();
    expect(screen.getByText('VIP client')).toBeInTheDocument();
  });

  it('optional fields render "—" when missing', async () => {
    vi.mocked(getCustomer).mockResolvedValue({
      id: 'c2',
      agencyId: 'a1',
      name: 'João Souza',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderRouted(['/customers/c2']);

    await screen.findByText('João Souza');
    // email, phone, cpf, passport, notes all missing -> 5 dashes
    expect(screen.getAllByText('—')).toHaveLength(5);
  });

  it('404 shows a safe generic message, never implying cross-tenant existence', async () => {
    vi.mocked(getCustomer).mockRejectedValue(
      new ApiError('Customer not found', 'NOT_FOUND', 404),
    );
    renderRouted(['/customers/c1']);

    expect(await screen.findByText('Cliente não encontrado.')).toBeInTheDocument();
    expect(screen.queryByText(/outra agência/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NOT_FOUND/)).not.toBeInTheDocument();
  });

  it('generic/other errors show a safe message', async () => {
    vi.mocked(getCustomer).mockRejectedValue(
      new ApiError('Internal server error', 'INTERNAL_ERROR', 500),
    );
    renderRouted(['/customers/c1']);

    expect(
      await screen.findByText('Não foi possível carregar o cliente. Tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/INTERNAL_ERROR/)).not.toBeInTheDocument();
  });

  it('calls getCustomer with the correct id', async () => {
    vi.mocked(getCustomer).mockResolvedValue(fullCustomer);
    renderRouted(['/customers/c1']);

    await waitFor(() => expect(getCustomer).toHaveBeenCalledWith('c1'));
  });

  it('"Voltar" navigates to /customers', async () => {
    vi.mocked(getCustomer).mockResolvedValue(fullCustomer);
    vi.mocked(listCustomers).mockResolvedValue([]);
    renderRouted(['/customers/c1']);

    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }));

    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
  });
});
