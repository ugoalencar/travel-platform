import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

vi.mock('./lib/api', () => ({
  listCustomers: vi.fn().mockResolvedValue([]),
  createCustomer: vi.fn(),
  listWishes: vi.fn().mockResolvedValue([]),
  createWish: vi.fn(),
  listTrips: vi.fn().mockResolvedValue([]),
  createTrip: vi.fn(),
  getTrip: vi.fn(),
  getCustomer: vi.fn(),
  listOffers: vi.fn().mockResolvedValue([]),
  createOffer: vi.fn(),
  getOffer: vi.fn(),
  updateOffer: vi.fn(),
  listProposals: vi.fn().mockResolvedValue([]),
  createProposal: vi.fn(),
  getProposal: vi.fn(),
  updateProposal: vi.fn(),
  listRoutes: vi.fn().mockResolvedValue([]),
  createRoute: vi.fn(),
  getRoute: vi.fn(),
  updateRoute: vi.fn(),
  listSuppliers: vi.fn().mockResolvedValue([]),
  createSupplier: vi.fn(),
  getSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  listTransportProducts: vi.fn().mockResolvedValue([]),
  createTransportProduct: vi.fn(),
  getTransportProduct: vi.fn(),
  updateTransportProduct: vi.fn(),
  listDepartures: vi.fn().mockResolvedValue([]),
  createDeparture: vi.fn(),
  getDeparture: vi.fn(),
  updateDeparture: vi.fn(),
  getAgenda: vi.fn().mockResolvedValue([]),
  listSales: vi.fn().mockResolvedValue([]),
  createSale: vi.fn(),
  getSale: vi.fn(),
  updateSale: vi.fn(),
  listBookings: vi.fn().mockResolvedValue([]),
  getFinancialDashboard: vi.fn().mockResolvedValue({
    projected: { receivablesDue: 1000, payablesDue: 250, balance: 750 },
    realized: { paymentsIn: 800, paymentsOut: 100, balance: 700 },
  }),
  listReceivables: vi.fn().mockResolvedValue([
    {
      id: 'r1',
      agencyId: 'a1',
      customerId: 'c1',
      description: 'Entrada pacote',
      amount: 1000,
      dueAt: '2027-01-10T00:00:00.000Z',
      status: 'OPEN',
      createdAt: '2027-01-01T00:00:00.000Z',
      updatedAt: '2027-01-01T00:00:00.000Z',
    },
  ]),
  listExternalOfferCaptures: vi.fn().mockResolvedValue([
    {
      id: 'cap1',
      agencyId: 'a1',
      sourceUrl: 'https://supplier.example/rio',
      sourceName: 'Fornecedor Rio',
      capturedAt: '2027-01-01T00:00:00.000Z',
      rawContent: 'Pacote Rio com hotel e transfer',
      normalizedTitle: 'Rio Package',
      normalizedDescription: 'Pacote Rio com hotel e transfer',
      foundPrice: 1800,
      currency: 'BRL',
      validUntil: '2027-02-01T00:00:00.000Z',
      status: 'APPROVED',
      reviewedAt: '2027-01-02T00:00:00.000Z',
      reviewedByUserId: 'u1',
      createdAt: '2027-01-01T00:00:00.000Z',
      updatedAt: '2027-01-02T00:00:00.000Z',
    },
  ]),
  createExternalOfferCapture: vi.fn(),
  reviewExternalOfferCapture: vi.fn(),
  approveExternalOfferCapture: vi.fn(),
  rejectExternalOfferCapture: vi.fn(),
  publishExternalOfferCapture: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

function renderApp(initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <App />
    </MemoryRouter>,
  );
}

describe('App', () => {
  it('renders without crashing', () => {
    renderApp();
    expect(screen.getByText('Travel Platform')).toBeInTheDocument();
  });

  it('redirects "/" to "/customers" and renders the CustomersPage', async () => {
    renderApp(['/']);
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
  });

  it('renders CustomersPage when navigating to "/customers"', async () => {
    renderApp(['/customers']);
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
  });

  it('renders the sidebar shell with Travel Platform branding', () => {
    renderApp();
    expect(screen.getByText('Travel Platform')).toBeInTheDocument();
  });

  it('renders "Clientes" as a real navigation link', () => {
    renderApp();
    const link = screen.getByRole('link', { name: 'Clientes' });
    expect(link).toHaveAttribute('href', '/customers');
  });

  it('does not render the dead "Dashboard" placeholder nav item (no route exists for it)', () => {
    renderApp();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('renders "Viagens" as a real navigation link', () => {
    renderApp();
    const link = screen.getByRole('link', { name: 'Viagens' });
    expect(link).toHaveAttribute('href', '/trips');
  });

  it('renders TripsPage when navigating to "/trips"', async () => {
    renderApp(['/trips']);
    expect(await screen.findByRole('heading', { name: 'Viagens' })).toBeInTheDocument();
  });

  it('renders "Desejos" as a real navigation link', () => {
    renderApp();
    const link = screen.getByRole('link', { name: 'Desejos' });
    expect(link).toHaveAttribute('href', '/wishes');
  });

  it('navigates to /customers/new when "+ Novo cliente" is clicked', async () => {
    renderApp(['/customers']);
    await screen.findByRole('heading', { name: 'Clientes' });

    fireEvent.click(screen.getByRole('button', { name: '+ Novo cliente' }));

    expect(
      await screen.findByRole('heading', { name: 'Novo cliente' }),
    ).toBeInTheDocument();
  });

  it('renders "Ofertas" as a real navigation link', () => {
    renderApp();
    const link = screen.getByRole('link', { name: 'Ofertas' });
    expect(link).toHaveAttribute('href', '/offers');
  });

  it('renders OffersPage when navigating to "/offers"', async () => {
    renderApp(['/offers']);
    expect(await screen.findByRole('heading', { name: 'Ofertas' })).toBeInTheDocument();
  });

  it('renders OfferFormPage when navigating to "/offers/new"', async () => {
    renderApp(['/offers/new']);
    expect(
      await screen.findByRole('heading', { name: 'Nova oferta' }),
    ).toBeInTheDocument();
  });

  it('renders OfferDetailsPage when navigating to "/offers/:id"', async () => {
    vi.mocked(
      (await import('./lib/api')).getOffer,
    ).mockReturnValue(new Promise(() => {}));
    renderApp(['/offers/o1']);
    expect(
      await screen.findByRole('heading', { name: 'Detalhes da oferta' }),
    ).toBeInTheDocument();
  });

  it('renders "Propostas" as a real navigation link', () => {
    renderApp();
    const link = screen.getByRole('link', { name: 'Propostas' });
    expect(link).toHaveAttribute('href', '/proposals');
  });

  it('renders ProposalsPage when navigating to "/proposals"', async () => {
    renderApp(['/proposals']);
    expect(await screen.findByRole('heading', { name: 'Propostas' })).toBeInTheDocument();
  });

  it('renders ProposalFormPage when navigating to "/proposals/new"', async () => {
    renderApp(['/proposals/new']);
    expect(
      await screen.findByRole('heading', { name: 'Nova proposta' }),
    ).toBeInTheDocument();
  });

  it('renders ProposalDetailsPage when navigating to "/proposals/:id"', async () => {
    vi.mocked(
      (await import('./lib/api')).getProposal,
    ).mockReturnValue(new Promise(() => {}));
    renderApp(['/proposals/p1']);
    expect(
      await screen.findByRole('heading', { name: 'Detalhes da proposta' }),
    ).toBeInTheDocument();
  });

  it('renders "Rotas" as a real navigation link', () => {
    renderApp();
    const link = screen.getByRole('link', { name: 'Rotas' });
    expect(link).toHaveAttribute('href', '/transport/routes');
  });

  it('renders TransportRoutesPage when navigating to "/transport/routes"', async () => {
    renderApp(['/transport/routes']);
    expect(await screen.findByRole('heading', { name: 'Rotas' })).toBeInTheDocument();
  });

  it('renders TransportRouteFormPage when navigating to "/transport/routes/new"', async () => {
    renderApp(['/transport/routes/new']);
    expect(await screen.findByRole('heading', { name: 'Nova rota' })).toBeInTheDocument();
  });

  it('renders TransportRouteDetailsPage when navigating to "/transport/routes/:id"', async () => {
    vi.mocked((await import('./lib/api')).getRoute).mockReturnValue(new Promise(() => {}));
    renderApp(['/transport/routes/r1']);
    expect(
      await screen.findByRole('heading', { name: 'Detalhes da rota' }),
    ).toBeInTheDocument();
  });

  it('renders TransportRouteEditPage when navigating to "/transport/routes/:id/edit"', async () => {
    vi.mocked((await import('./lib/api')).getRoute).mockReturnValue(new Promise(() => {}));
    renderApp(['/transport/routes/r1/edit']);
    expect(await screen.findByText('Carregando rota...')).toBeInTheDocument();
  });

  it('renders "Produtos de transporte" as a real navigation link', () => {
    renderApp();
    const link = screen.getByRole('link', { name: 'Produtos de transporte' });
    expect(link).toHaveAttribute('href', '/transport/products');
  });

  it('renders TransportProductsPage when navigating to "/transport/products"', async () => {
    renderApp(['/transport/products']);
    expect(
      await screen.findByRole('heading', { name: 'Produtos de transporte' }),
    ).toBeInTheDocument();
  });

  it('renders TransportProductFormPage when navigating to "/transport/products/new"', async () => {
    renderApp(['/transport/products/new']);
    expect(await screen.findByRole('heading', { name: 'Novo produto' })).toBeInTheDocument();
  });

  it('renders TransportProductDetailsPage when navigating to "/transport/products/:id"', async () => {
    vi.mocked((await import('./lib/api')).getTransportProduct).mockReturnValue(
      new Promise(() => {}),
    );
    renderApp(['/transport/products/p1']);
    expect(
      await screen.findByRole('heading', { name: 'Detalhes do produto' }),
    ).toBeInTheDocument();
  });

  it('renders TransportProductEditPage when navigating to "/transport/products/:id/edit"', async () => {
    vi.mocked((await import('./lib/api')).getTransportProduct).mockReturnValue(
      new Promise(() => {}),
    );
    renderApp(['/transport/products/p1/edit']);
    expect(await screen.findByText('Carregando produto...')).toBeInTheDocument();
  });

  it('renders "Fornecedores" as a real navigation link', () => {
    renderApp();
    const link = screen.getByRole('link', { name: 'Fornecedores' });
    expect(link).toHaveAttribute('href', '/transport/suppliers');
  });

  it('renders SuppliersPage when navigating to "/transport/suppliers"', async () => {
    renderApp(['/transport/suppliers']);
    expect(await screen.findByRole('heading', { name: 'Fornecedores' })).toBeInTheDocument();
  });

  it('renders SupplierFormPage when navigating to "/transport/suppliers/new"', async () => {
    renderApp(['/transport/suppliers/new']);
    expect(await screen.findByRole('heading', { name: 'Novo fornecedor' })).toBeInTheDocument();
  });

  it('renders SupplierDetailsPage when navigating to "/transport/suppliers/:id"', async () => {
    vi.mocked((await import('./lib/api')).getSupplier).mockReturnValue(new Promise(() => {}));
    renderApp(['/transport/suppliers/s1']);
    expect(
      await screen.findByRole('heading', { name: 'Detalhes do fornecedor' }),
    ).toBeInTheDocument();
  });

  it('renders SupplierEditPage when navigating to "/transport/suppliers/:id/edit"', async () => {
    vi.mocked((await import('./lib/api')).getSupplier).mockReturnValue(new Promise(() => {}));
    renderApp(['/transport/suppliers/s1/edit']);
    expect(await screen.findByText('Carregando fornecedor...')).toBeInTheDocument();
  });

  it('renders "Saídas" as a real navigation link', () => {
    renderApp();
    const link = screen.getByRole('link', { name: 'Saídas' });
    expect(link).toHaveAttribute('href', '/transport/departures');
  });

  it('renders DeparturesPage when navigating to "/transport/departures"', async () => {
    renderApp(['/transport/departures']);
    expect(
      await screen.findByRole('heading', { name: 'Saídas programadas' }),
    ).toBeInTheDocument();
  });

  it('renders DepartureFormPage when navigating to "/transport/departures/new"', async () => {
    renderApp(['/transport/departures/new']);
    expect(await screen.findByRole('heading', { name: 'Nova saída' })).toBeInTheDocument();
  });

  it('renders DepartureDetailsPage when navigating to "/transport/departures/:id"', async () => {
    vi.mocked((await import('./lib/api')).getDeparture).mockReturnValue(new Promise(() => {}));
    renderApp(['/transport/departures/d1']);
    expect(
      await screen.findByRole('heading', { name: 'Detalhes da saída' }),
    ).toBeInTheDocument();
  });

  it('renders DepartureEditPage when navigating to "/transport/departures/:id/edit"', async () => {
    vi.mocked((await import('./lib/api')).getDeparture).mockReturnValue(new Promise(() => {}));
    renderApp(['/transport/departures/d1/edit']);
    expect(await screen.findByText('Carregando saída...')).toBeInTheDocument();
  });

  it('renders "Agenda" as a real navigation link', () => {
    renderApp();
    const link = screen.getByRole('link', { name: 'Agenda' });
    expect(link).toHaveAttribute('href', '/transport/agenda');
  });

  it('renders TransportAgendaPage when navigating to "/transport/agenda"', async () => {
    renderApp(['/transport/agenda']);
    expect(
      await screen.findByRole('heading', { name: 'Agenda de saídas' }),
    ).toBeInTheDocument();
  });

  it('renders "Vendas" as a real navigation link', () => {
    renderApp();
    const link = screen.getByRole('link', { name: 'Vendas' });
    expect(link).toHaveAttribute('href', '/sales');
  });

  it('renders SalesPage when navigating to "/sales"', async () => {
    renderApp(['/sales']);
    expect(await screen.findByRole('heading', { name: 'Vendas' })).toBeInTheDocument();
  });

  it('renders SaleFormPage when navigating to "/sales/new"', async () => {
    renderApp(['/sales/new']);
    expect(
      await screen.findByRole('heading', { name: 'Nova venda' }),
    ).toBeInTheDocument();
  });

  it('renders SaleDetailsPage when navigating to "/sales/:id"', async () => {
    vi.mocked(
      (await import('./lib/api')).getSale,
    ).mockReturnValue(new Promise(() => {}));
    renderApp(['/sales/s1']);
    expect(
      await screen.findByRole('heading', { name: 'Detalhes da venda' }),
    ).toBeInTheDocument();
  });

  it('renders "Financeiro" as a real navigation link', () => {
    renderApp();
    const link = screen.getByRole('link', { name: 'Financeiro' });
    expect(link).toHaveAttribute('href', '/financial');
  });

  it('renders FinancialPage when navigating to "/financial"', async () => {
    renderApp(['/financial']);
    expect(await screen.findByRole('heading', { name: 'Financeiro' })).toBeInTheDocument();
    expect(await screen.findByText('Recebido no periodo')).toBeInTheDocument();
    expect(await screen.findByText('Entrada pacote')).toBeInTheDocument();
  });

  it('renders "Pescador" as a real navigation link', () => {
    renderApp();
    const link = screen.getByRole('link', { name: 'Pescador' });
    expect(link).toHaveAttribute('href', '/pescador');
  });

  it('renders PescadorPage when navigating to "/pescador"', async () => {
    renderApp(['/pescador']);
    expect(await screen.findByRole('heading', { name: 'Pescador' })).toBeInTheDocument();
    expect(await screen.findByText('Fornecedor Rio')).toBeInTheDocument();
    expect(await screen.findByText('Rio Package')).toBeInTheDocument();
  });
});
