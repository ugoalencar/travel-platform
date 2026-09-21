import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderRouted } from '../test/render';

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
    getDashboardSummary: vi.fn().mockResolvedValue({
      openOpportunitiesCount: 2,
      followUpsDueTodayCount: 3,
      overdueFollowUpsCount: 1,
      proposalsWaitingCount: 4,
      sentProposalsCount: 5,
      acceptedProposalsCount: 6,
      openProposalValueSum: '1200.00',
      salesThisMonthCount: 7,
      salesThisMonthTotal: '45000.00',
      pendingSalesCount: 8,
      confirmedSalesCount: 9,
      paidSalesCount: 10,
      overdueReceivablesCount: 0,
      cancelledBookingsCount: 0,
      pescadorReviewQueueCount: 0,
      upcomingTripsCount: 11,
      postSalePendingCount: 0,
    }),
    getUpcomingTravel: vi.fn().mockResolvedValue({
      operational: [],
      commercial: [
        {
          tripId: 'trip-001',
          customerId: 'c1',
          destination: 'Portugal',
          startDate: '2026-09-01',
          endDate: '2026-09-10',
        },
      ],
    }),
    getSalesReportByPeriod: vi.fn().mockResolvedValue([
      { key: '2026-08', label: '2026-08', count: 3, total: 12000 },
      { key: '2026-09', label: '2026-09', count: 5, total: 45000 },
    ]),
    listPipelines: vi.fn().mockResolvedValue([
      { id: 'pipe-1', name: 'Vendas', description: '', active: true, notificationsEnabled: true },
    ]),
    listOpportunities: vi.fn().mockResolvedValue([
      {
        id: 'opp-1',
        customerId: 'c1',
        customerName: 'Carla Mendes',
        destination: 'Maldivas',
        expectedValue: 28500,
        pipelineId: 'pipe-1',
        stageId: 'stage-1',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-05T00:00:00.000Z',
      },
    ]),
    listOffers: vi.fn().mockResolvedValue([
      {
        id: 'offer-1',
        agencyId: 'a1',
        name: 'Cancún tudo incluído',
        description: 'Pacote completo',
        price: 6890,
        status: 'ACTIVE',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]),
    listCustomers: vi.fn().mockResolvedValue([
      {
        id: 'c1',
        agencyId: 'a1',
        protocolNumber: 'CLI-2026-000001',
        name: 'Carla Mendes',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]),
    createProposal: vi.fn().mockResolvedValue({
      id: 'proposal-1',
      agencyId: 'a1',
      customerId: 'c1',
      offerId: 'offer-1',
      proposedPrice: 6890,
      status: 'DRAFT',
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
    }),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DashboardPage', () => {
  it('shows KPI chips populated from the real dashboard aggregate', async () => {
    renderRouted('/');
    expect(await screen.findByText('Vendas (mês)')).toBeInTheDocument();
    expect(screen.getByText('Propostas aguardando resposta')).toBeInTheDocument();
    const upcomingTripsLabel = screen.getByText('Viagens futuras');
    // Scoped to the KPI chip itself (sidebar group-count badges can
    // coincidentally render the same digits elsewhere on the page).
    expect(upcomingTripsLabel.closest('div')?.querySelector('p:last-child')).toHaveTextContent('11');
    expect(screen.getByText('Vendas pendentes')).toBeInTheDocument();
    expect(screen.getByText('Follow-ups hoje')).toBeInTheDocument();
  });

  it('shows real opportunities from the default pipeline', async () => {
    renderRouted('/');
    expect(await screen.findByText('Oportunidades em andamento')).toBeInTheDocument();
    expect(screen.getByText('Carla Mendes')).toBeInTheDocument();
    expect(screen.getByText('Maldivas')).toBeInTheDocument();
  });

  it('shows the offers carousel and wires "Ofertar ao cliente" to a real proposal', async () => {
    const api = await import('../lib/api');
    renderRouted('/');

    expect(await screen.findByText('Ofertas em destaque')).toBeInTheDocument();
    expect(screen.getByText('Cancún tudo incluído')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ofertar ao cliente' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar proposta' }));

    await waitFor(() =>
      expect(api.createProposal).toHaveBeenCalledWith({
        customerId: 'c1',
        offerId: 'offer-1',
        proposedPrice: 6890,
      }),
    );
    expect(await screen.findByRole('link', { name: 'Ver proposta' })).toHaveAttribute(
      'href',
      '/proposals/proposal-1',
    );
  });

  it('shows an operational alert derived from real overdue follow-ups', async () => {
    renderRouted('/');
    expect(await screen.findByText('Alertas operacionais')).toBeInTheDocument();
    expect(screen.getByText('1 follow-up atrasado')).toBeInTheDocument();
  });
});
