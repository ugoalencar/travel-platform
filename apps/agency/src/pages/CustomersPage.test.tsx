import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderRouted } from '../test/render';
import * as api from '../lib/api';
import type { Customer } from '../types/customer';
import type { Wish } from '../types/wish';
import type { Trip } from '../types/trip';

vi.mock('../lib/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    listCustomers: vi.fn(),
    getCustomer: vi.fn(),
    listWishesByCustomer: vi.fn(),
    listTripsByCustomer: vi.fn(),
    createCustomer: vi.fn(),
    listCustomerAddresses: vi.fn(),
    listCustomerDocuments: vi.fn(),
    listCustomerDependents: vi.fn(),
    listTravelRequirements: vi.fn(),
    listSales: vi.fn(),
  };
});

const customerLucas: Customer = {
  id: 'cust-001',
  agencyId: 'agency-demo-001',
  protocolNumber: 'CLI-2026-000001',
  name: 'Lucas Martins',
  email: 'lucas.martins@email.com',
  phone: '(11) 99876-5432',
  status: 'ACTIVE',
  createdAt: '2024-03-15T10:00:00.000Z',
  updatedAt: '2026-08-10T14:30:00.000Z',
};

const customerAna: Customer = {
  id: 'cust-002',
  agencyId: 'agency-demo-001',
  protocolNumber: 'CLI-2026-000002',
  name: 'Ana Beatriz Souza',
  email: 'ana.souza@email.com',
  status: 'ACTIVE',
  createdAt: '2024-06-20T08:00:00.000Z',
  updatedAt: '2026-07-22T09:15:00.000Z',
};

const customerRicardo: Customer = {
  id: 'cust-003',
  agencyId: 'agency-demo-001',
  protocolNumber: 'CLI-2026-000003',
  name: 'Ricardo Oliveira',
  status: 'ACTIVE',
  createdAt: '2025-01-10T12:00:00.000Z',
  updatedAt: '2026-08-05T16:45:00.000Z',
};

const customerFernanda: Customer = {
  id: 'cust-004',
  agencyId: 'agency-demo-001',
  protocolNumber: 'CLI-2026-000004',
  name: 'Fernanda Costa',
  status: 'ACTIVE',
  createdAt: '2025-04-05T11:00:00.000Z',
  updatedAt: '2026-08-20T10:00:00.000Z',
};

const customerPedro: Customer = {
  id: 'cust-005',
  agencyId: 'agency-demo-001',
  protocolNumber: 'CLI-2026-000005',
  name: 'Pedro Henrique Almeida',
  email: 'pedro.almeida@email.com',
  status: 'INACTIVE',
  createdAt: '2023-11-18T09:00:00.000Z',
  updatedAt: '2026-03-10T08:30:00.000Z',
};

const wishPortugal: Wish = {
  id: 'wish-001',
  agencyId: 'agency-demo-001',
  customerId: 'cust-001',
  destination: 'Portugal (Lisboa + Porto)',
  status: 'PROPOSED',
  createdAt: '2026-06-20T10:00:00.000Z',
  updatedAt: '2026-07-15T14:00:00.000Z',
};

const wishIceland: Wish = {
  id: 'wish-005',
  agencyId: 'agency-demo-001',
  customerId: 'cust-001',
  destination: 'Islândia',
  status: 'ACTIVE',
  createdAt: '2026-08-15T08:00:00.000Z',
  updatedAt: '2026-08-15T08:00:00.000Z',
};

const tripPortugal: Trip = {
  id: 'trip-001',
  agencyId: 'agency-demo-001',
  customerId: 'cust-001',
  name: 'Família Martins — Portugal',
  destination: 'Lisboa + Porto, Portugal',
  startDate: '2026-10-15T00:00:00.000Z',
  endDate: '2026-10-28T00:00:00.000Z',
  status: 'CONFIRMED',
  category: 'TERRESTRE',
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-08-10T14:30:00.000Z',
};

beforeEach(() => {
  vi.mocked(api.listCustomers).mockResolvedValue([customerLucas, customerAna, customerRicardo, customerFernanda, customerPedro]);
  vi.mocked(api.getCustomer).mockImplementation((id: string) =>
    Promise.resolve([customerLucas, customerAna, customerRicardo, customerFernanda, customerPedro].find((c) => c.id === id)!),
  );
  vi.mocked(api.listWishesByCustomer).mockImplementation((id: string) => {
    if (id === 'cust-001') return Promise.resolve([wishPortugal, wishIceland]);
    return Promise.resolve([]);
  });
  vi.mocked(api.listTripsByCustomer).mockImplementation((id: string) => {
    if (id === 'cust-001') return Promise.resolve([tripPortugal]);
    return Promise.resolve([]);
  });
  vi.mocked(api.listCustomerAddresses).mockResolvedValue([]);
  vi.mocked(api.listCustomerDocuments).mockResolvedValue([]);
  vi.mocked(api.listCustomerDependents).mockResolvedValue([]);
  vi.mocked(api.listTravelRequirements).mockResolvedValue([]);
  vi.mocked(api.listSales).mockResolvedValue([]);
});

describe('CustomersPage', () => {
  it('shows the full customer list via API', async () => {
    renderRouted('/customers');
    expect(await screen.findByText('Lucas Martins')).toBeInTheDocument();
    expect(screen.getByText('Ana Beatriz Souza')).toBeInTheDocument();
    expect(screen.getByText('Fernanda Costa')).toBeInTheDocument();
  });

  it('filters customers by search term', async () => {
    renderRouted('/customers');
    const input = await screen.findByPlaceholderText(/Buscar por nome/);
    fireEvent.change(input, { target: { value: 'Lucas' } });
    expect(screen.getByText('Lucas Martins')).toBeInTheDocument();
    expect(screen.queryByText('Ana Beatriz Souza')).not.toBeInTheDocument();
  });

  it('shows the empty state when search has no matches', async () => {
    renderRouted('/customers');
    const input = await screen.findByPlaceholderText(/Buscar por nome/);
    fireEvent.change(input, { target: { value: 'zzz-inexistente' } });
    expect(screen.getByText('Nenhum cliente encontrado')).toBeInTheDocument();
  });

  it('filters customers by status', async () => {
    renderRouted('/customers');
    await screen.findByText('Lucas Martins');
    fireEvent.click(screen.getByRole('button', { name: 'Inativo' }));
    expect(screen.getByText('Pedro Henrique Almeida')).toBeInTheDocument();
    expect(screen.queryByText('Lucas Martins')).not.toBeInTheDocument();
  });

  it('links to customer detail', async () => {
    renderRouted('/customers');
    const customer = await screen.findByText('Lucas Martins');
    expect(customer.closest('a')).toHaveAttribute('href', '/customers/cust-001');
  });

  it('does not expose cpf/passport raw values in the list', async () => {
    renderRouted('/customers');
    await screen.findByText('Lucas Martins');
    expect(screen.queryByText(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/)).not.toBeInTheDocument();
  });

  it('shows an error state and allows retry when the API call fails', async () => {
    vi.mocked(api.listCustomers).mockRejectedValueOnce(new api.ApiError('boom', 'UNKNOWN_ERROR', 500));
    renderRouted('/customers');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    vi.mocked(api.listCustomers).mockResolvedValueOnce([customerLucas]);
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }));
    expect(await screen.findByText('Lucas Martins')).toBeInTheDocument();
  });

  it('creates a new customer via the API and refreshes the list', async () => {
    const created: Customer = { ...customerLucas, id: 'cust-999', name: 'Novo Cliente' };
    vi.mocked(api.createCustomer).mockResolvedValue(created);
    renderRouted('/customers');
    await screen.findByText('Lucas Martins');
    fireEvent.click(screen.getByRole('button', { name: /Novo cliente/ }));
    fireEvent.change(screen.getByPlaceholderText(/Nome completo/), { target: { value: 'Novo Cliente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      expect(api.createCustomer).toHaveBeenCalledWith(expect.objectContaining({ name: 'Novo Cliente' }));
    });
  });
});

describe('CustomerDetailPage', () => {
  it('shows customer profile info and privacy-respecting data via API', async () => {
    renderRouted('/customers/cust-001');
    expect(await screen.findByRole('heading', { name: 'Lucas Martins' })).toBeInTheDocument();
    expect(screen.getByText('lucas.martins@email.com')).toBeInTheDocument();
    expect(screen.getByText('(11) 99876-5432')).toBeInTheDocument();
  });

  it('shows summary counts from API data', async () => {
    renderRouted('/customers/cust-001');
    await screen.findByRole('heading', { name: 'Lucas Martins' });
    expect(screen.getAllByText('Preferências')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Viagens')[0]).toBeInTheDocument();
  });

  it('shows wishes tab with the customer wishes from API', async () => {
    renderRouted('/customers/cust-001');
    await screen.findByRole('heading', { name: 'Lucas Martins' });
    fireEvent.click(screen.getByRole('tab', { name: 'Preferências' }));
    expect(await screen.findByText(/Portugal/)).toBeInTheDocument();
    expect(screen.getByText(/Islândia/)).toBeInTheDocument();
  });

  it('shows trips tab with the customer trips from API', async () => {
    renderRouted('/customers/cust-001');
    await screen.findByRole('heading', { name: 'Lucas Martins' });
    fireEvent.click(screen.getByRole('tab', { name: 'Viagens' }));
    expect(await screen.findByText('Família Martins — Portugal')).toBeInTheDocument();
  });

  it('shows empty state for proposals tab (out of CORE-A scope)', async () => {
    renderRouted('/customers/cust-001');
    await screen.findByRole('heading', { name: 'Lucas Martins' });
    fireEvent.click(screen.getByRole('tab', { name: 'Propostas' }));
    expect(await screen.findByText('Nenhuma proposta')).toBeInTheDocument();
  });

  it('shows empty state for bookings tab (out of CORE-A scope)', async () => {
    renderRouted('/customers/cust-001');
    await screen.findByRole('heading', { name: 'Lucas Martins' });
    fireEvent.click(screen.getByRole('tab', { name: 'Reservas' }));
    expect(await screen.findByText('Nenhuma reserva')).toBeInTheDocument();
  });

  it('shows error state for unknown customer', async () => {
    renderRouted('/customers/unknown');
    expect(await screen.findByText('Cliente não encontrado')).toBeInTheDocument();
  });
});
