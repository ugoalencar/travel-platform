import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderRouted } from './test/render';
import * as api from './lib/api';
import type { Customer } from './types/customer';
import type { Wish } from './types/wish';
import type { Trip } from './types/trip';

vi.mock('./lib/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('./lib/api')>('./lib/api');
  return {
    ...actual,
    listCustomers: vi.fn(),
    getCustomer: vi.fn(),
    listWishesByCustomer: vi.fn(),
    listTripsByCustomer: vi.fn(),
    createCustomer: vi.fn(),
    listWishes: vi.fn(),
    getWish: vi.fn(),
    createWish: vi.fn(),
    updateWish: vi.fn(),
    listTrips: vi.fn(),
    getTrip: vi.fn(),
    createTrip: vi.fn(),
    updateTrip: vi.fn(),
    listPayables: vi.fn(),
    listReceivables: vi.fn(),
    listSuppliers: vi.fn(),
    recordPayment: vi.fn(),
    allocatePayment: vi.fn(),
    listCustomerAddresses: vi.fn(),
    listCustomerDocuments: vi.fn(),
    listCustomerDependents: vi.fn(),
    listTravelRequirements: vi.fn(),
    listSales: vi.fn(),
    listAirServicesByTrip: vi.fn(),
    listLandServicesByTrip: vi.fn(),
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

const wishPortugal: Wish = {
  id: 'wish-001',
  agencyId: 'agency-demo-001',
  customerId: 'cust-001',
  destination: 'Portugal (Lisboa + Porto)',
  status: 'PROPOSED',
  createdAt: '2026-06-20T10:00:00.000Z',
  updatedAt: '2026-07-15T14:00:00.000Z',
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
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-08-10T14:30:00.000Z',
};

beforeEach(() => {
  vi.mocked(api.getCustomer).mockImplementation((id: string) => {
    if (id === 'cust-001') return Promise.resolve(customerLucas);
    return Promise.reject(new api.ApiError('Cliente não encontrado', 'NOT_FOUND', 404));
  });
  vi.mocked(api.listWishesByCustomer).mockImplementation((id: string) => {
    if (id === 'cust-001') return Promise.resolve([wishPortugal]);
    return Promise.resolve([]);
  });
  vi.mocked(api.listTripsByCustomer).mockImplementation((id: string) => {
    if (id === 'cust-001') return Promise.resolve([tripPortugal]);
    return Promise.resolve([]);
  });
  vi.mocked(api.listCustomers).mockResolvedValue([customerLucas]);
  vi.mocked(api.getWish).mockImplementation((id: string) => {
    if (id === 'wish-001') return Promise.resolve(wishPortugal);
    return Promise.reject(new api.ApiError('Desejo não encontrado', 'NOT_FOUND', 404));
  });
  vi.mocked(api.listWishes).mockResolvedValue([wishPortugal]);
  vi.mocked(api.getTrip).mockImplementation((id: string) => {
    if (id === 'trip-001') return Promise.resolve(tripPortugal);
    return Promise.reject(new api.ApiError('Viagem não encontrada', 'NOT_FOUND', 404));
  });
  vi.mocked(api.listTrips).mockResolvedValue([tripPortugal]);
  vi.mocked(api.listPayables).mockResolvedValue([]);
  vi.mocked(api.listReceivables).mockResolvedValue([]);
  vi.mocked(api.listSuppliers).mockResolvedValue([]);
  vi.mocked(api.listCustomerAddresses).mockResolvedValue([]);
  vi.mocked(api.listCustomerDocuments).mockResolvedValue([]);
  vi.mocked(api.listCustomerDependents).mockResolvedValue([]);
  vi.mocked(api.listTravelRequirements).mockResolvedValue([]);
  vi.mocked(api.listSales).mockResolvedValue([]);
  vi.mocked(api.listAirServicesByTrip).mockResolvedValue([]);
  vi.mocked(api.listLandServicesByTrip).mockResolvedValue([]);
});

describe('App', () => {
  it('renders the dashboard by default', async () => {
    renderRouted('/');
    expect(await screen.findByRole('heading', { name: 'Painel' })).toBeInTheDocument();
  });

  it('renders the sidebar navigation links', async () => {
    renderRouted('/');
    await screen.findByRole('heading', { name: 'Painel' });
    const nav = screen.getByRole('navigation');
    expect(nav.querySelector('a[href="/customers"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/wishes"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/trips"]')).not.toBeNull();
  });

  it('organizes agency navigation into the approved Portuguese groups', async () => {
    renderRouted('/');
    await screen.findByRole('heading', { name: 'Painel' });

    const nav = screen.getByRole('navigation');
    expect(nav).toHaveTextContent('Painel');
    expect(nav).toHaveTextContent('CRM & Comercial');
    expect(nav).toHaveTextContent('Operação');
    expect(nav).toHaveTextContent('Financeiro');
    expect(nav).toHaveTextContent('Cadastros');
    expect(nav).toHaveTextContent('Pessoal');
    expect(nav).toHaveTextContent('Marketing');
    expect(nav).toHaveTextContent('Configurações');

    expect(screen.getByRole('link', { name: 'Pescador' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contas a Pagar' })).toHaveAttribute(
      'href',
      '/financial/payables',
    );
  });

  it('navigates to the customers list from the sidebar', async () => {
    renderRouted('/');
    await screen.findByRole('heading', { name: 'Painel' });
    fireEvent.click(screen.getByRole('link', { name: /Clientes/ }));
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
  });

  it('navigates to the wishes list from the sidebar', async () => {
    renderRouted('/');
    await screen.findByRole('heading', { name: 'Painel' });
    fireEvent.click(screen.getByRole('link', { name: /Desejos/ }));
    expect(await screen.findByRole('heading', { name: 'Desejos' })).toBeInTheDocument();
  });

  it('navigates to the trips list from the sidebar', async () => {
    renderRouted('/');
    await screen.findByRole('heading', { name: 'Painel' });
    fireEvent.click(screen.getByRole('link', { name: /Viagens/ }));
    expect(await screen.findByRole('heading', { name: 'Viagens' })).toBeInTheDocument();
  });

  it('renders a customer detail page', async () => {
    renderRouted('/customers/cust-001');
    expect(await screen.findByRole('heading', { name: 'Lucas Martins' })).toBeInTheDocument();
  });

  it('renders a wish detail page', async () => {
    renderRouted('/wishes/wish-001');
    expect(await screen.findByRole('heading', { name: /Portugal/ })).toBeInTheDocument();
  });

  it('renders a trip detail page', async () => {
    renderRouted('/trips/trip-001');
    expect(await screen.findByRole('heading', { name: 'Família Martins — Portugal' })).toBeInTheDocument();
  });

  it('shows an error state for an unknown customer', async () => {
    renderRouted('/customers/unknown-id');
    expect(await screen.findByText('Cliente não encontrado')).toBeInTheDocument();
  });

  it('renders the not-found page for unknown routes', async () => {
    renderRouted('/unknown-route');
    expect(await screen.findByText('Página não encontrada')).toBeInTheDocument();
  });

  it('renders the financial overview page', async () => {
    renderRouted('/financial');
    expect(await screen.findByRole('heading', { name: 'Financeiro' })).toBeInTheDocument();
  });

  it('renders the payables page', async () => {
    renderRouted('/financial/payables');
    expect(await screen.findByRole('heading', { name: 'Contas a Pagar' })).toBeInTheDocument();
  });

  it('renders the reports page', async () => {
    renderRouted('/reports');
    expect(await screen.findByRole('heading', { name: 'Relatórios' })).toBeInTheDocument();
  });

  it('renders the settings page', async () => {
    renderRouted('/settings');
    expect(await screen.findByRole('heading', { name: 'Configurações' })).toBeInTheDocument();
  });

  // TODO: Proposals integration is out of CORE-A scope — skip until implemented
  // it('navigates from wish detail to the linked proposal', async () => {
  //   renderRouted('/wishes/wish-001');
  //   await screen.findByRole('heading', { name: /Portugal/ });
  //   fireEvent.click(screen.getByRole('tab', { name: 'Propostas' }));
  //   fireEvent.click(await screen.findByText(/Pacote personalizado com voos LATAM/));
  //   expect(await screen.findByRole('heading', { name: 'Proposta Portugal em família' })).toBeInTheDocument();
  // });
});
