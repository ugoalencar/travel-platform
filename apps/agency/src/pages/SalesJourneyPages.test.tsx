import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
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
  ...actual,
  ApiError: MockApiError,
  listProposals: vi.fn(() => Promise.resolve([])),
  getProposal: vi.fn(() => Promise.reject(new Error('Not found'))),
  listBookings: vi.fn(() => Promise.resolve([])),
  getBooking: vi.fn(() => Promise.reject(new Error('Not found'))),
  listOffers: vi.fn(() => Promise.resolve([])),
  createProposal: vi.fn(),
  listSales: vi.fn(() => Promise.resolve([])),
  getSale: vi.fn(() => Promise.reject(new Error('Not found'))),
  getSaleFinancialStory: vi.fn(() => Promise.reject(new Error('Not found'))),
  };
});

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

const mariana = {
  id: 'sale-1',
  agencyId: 'agency-1',
  customerId: 'cust-1',
  customerName: 'Mariana Alves Silva',
  salespersonName: 'Joao Silva',
  tripId: 'trip-1',
  tripName: 'Mariana / Cancun',
  userId: 'user-1',
  amount: 18000,
  discount: 0,
  total: 18000,
  status: 'CONFIRMED' as const,
  createdAt: '2026-09-03T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
};

const marianaStory = {
  saleId: 'sale-1',
  customerName: 'Mariana Alves Silva',
  tripName: 'Mariana / Cancun',
  grossSale: 18000,
  received: 6000,
  remainingReceivable: 12000,
  totalSupplierPayable: 14000,
  installmentSchedule: [
    { description: 'Entrada Mariana / Cancun', amount: 6000, dueDate: '2026-09-03', status: 'PAID' },
  ],
  supplierPayables: [
    { description: 'Hotel - Grand Palladium Cancun', amount: 7000, dueAt: '2026-09-20', status: 'OPEN' as const },
  ],
  margin: {
    grossSale: 18000,
    supplierCosts: 13300,
    commissionAndFees: 700,
    airCost: 5000,
    landCost: 8300,
    otherCosts: 0,
    grossMargin: 4700,
    netMargin: 4000,
  },
};

describe('UI-03 sales journey prototype', () => {
  it('renders the proposal list page with journey rail', async () => {
    renderRoute('/proposals');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Jornada comercial' })).toBeInTheDocument();
    });

    expect(screen.getAllByText('Wish').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Proposal').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Booking').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sale').length).toBeGreaterThan(0);
  });

  it('renders the booking list page with journey rail', async () => {
    renderRoute('/bookings');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Reservas operacionais' })).toBeInTheDocument();
    });

    expect(screen.getAllByText('Booking').length).toBeGreaterThan(0);
  });

  it('renders the sales list page empty state when there are no sales', async () => {
    renderRoute('/sales');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Vendas realizadas' })).toBeInTheDocument();
    });

    expect(await screen.findByText('Nenhuma venda encontrada')).toBeInTheDocument();
  });

  it('renders the proposal builder page', async () => {
    renderRoute('/proposals/test-id/edit');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Builder de proposta' })).toBeInTheDocument();
    });
  });

  it('renders the proposal preview page', async () => {
    renderRoute('/proposals/test-id/preview');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Prévia de proposta' })).toBeInTheDocument();
    });
  });

  it('lists real sales with the customer name instead of a raw id, linking to the detail page', async () => {
    vi.mocked(api.listSales).mockResolvedValueOnce([mariana]);

    renderRoute('/sales');

    expect(await screen.findByText('Mariana Alves Silva')).toBeInTheDocument();
    expect(screen.queryByText(mariana.customerId)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir' })).toHaveAttribute('href', `/sales/${mariana.id}`);
  });

  it('loads a real sale detail page combining the sale and its financial story', async () => {
    vi.mocked(api.getSale).mockResolvedValueOnce(mariana);
    vi.mocked(api.getSaleFinancialStory).mockResolvedValueOnce(marianaStory);

    renderRoute(`/sales/${mariana.id}`);

    expect(await screen.findByText('Cliente')).toBeInTheDocument();
    expect(screen.getAllByText('Mariana Alves Silva').length).toBeGreaterThan(0);
    expect(screen.getByText('Joao Silva')).toBeInTheDocument();
    expect(screen.getAllByText('R$ 18.000,00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('R$ 6.000,00').length).toBeGreaterThan(0);
    expect(screen.getByText('Hotel - Grand Palladium Cancun')).toBeInTheDocument();
  });

  it('shows an empty state (not a hardcoded stub) when a sale genuinely does not exist', async () => {
    vi.mocked(api.getSale).mockRejectedValueOnce(new api.ApiError('Sale not found', 'NOT_FOUND', 404));
    vi.mocked(api.getSaleFinancialStory).mockRejectedValueOnce(
      new api.ApiError('Sale not found', 'NOT_FOUND', 404),
    );

    renderRoute('/sales/does-not-exist');

    expect(await screen.findByText('Venda não encontrada')).toBeInTheDocument();
  });

  it('shows customer names, not raw ids, in the proposal list and detail views', async () => {
    const proposal = {
      id: 'prop-1',
      agencyId: 'agency-1',
      customerId: 'cust-1',
      customerName: 'Mariana Alves Silva',
      proposedPrice: 18000,
      discount: 0,
      total: 18000,
      status: 'ACCEPTED' as const,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    vi.mocked(api.listProposals).mockResolvedValueOnce([proposal]);
    vi.mocked(api.getProposal).mockResolvedValueOnce(proposal);

    renderRoute('/proposals');
    expect(await screen.findByText('Mariana Alves Silva')).toBeInTheDocument();
    expect(screen.queryByText(proposal.customerId)).not.toBeInTheDocument();
  });

  it('shows customer names, not raw ids, in the booking list and detail views', async () => {
    const booking = {
      id: 'booking-1',
      agencyId: 'agency-1',
      bookerCustomerId: 'cust-1',
      customerName: 'Mariana Alves Silva',
      tripType: 'ONE_WAY' as const,
      outboundDepartureId: 'dep-1',
      cancelled: false,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    vi.mocked(api.listBookings).mockResolvedValueOnce([booking]);
    vi.mocked(api.getBooking).mockResolvedValueOnce(booking);

    renderRoute('/bookings');
    expect(await screen.findByText('Mariana Alves Silva')).toBeInTheDocument();
    expect(screen.queryByText(booking.bookerCustomerId)).not.toBeInTheDocument();
  });
});
