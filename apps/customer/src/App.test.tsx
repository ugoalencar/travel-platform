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

  it('renders placeholder nav items as non-interactive elements', () => {
    renderApp();
    const dashboard = screen.getByText('Dashboard');

    expect(dashboard.tagName).not.toBe('A');
    expect(dashboard.tagName).not.toBe('BUTTON');
    expect(dashboard).toHaveAttribute('aria-disabled', 'true');
    expect(dashboard).not.toHaveAttribute('href');
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

  it('does not navigate when a placeholder nav item is clicked', async () => {
    renderApp(['/customers']);
    const dashboard = screen.getByText('Dashboard');
    dashboard.click();

    // Still on /customers — the Clientes heading remains rendered and no
    // navigation occurred since placeholder items carry no routing wiring.
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
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
});
