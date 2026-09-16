import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
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
      overdueFollowUpsCount: 0,
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
    listProposalsWaiting: vi.fn().mockResolvedValue([
      {
        id: 'p1',
        agencyId: 'a1',
        customerId: 'c1',
        status: 'SENT',
        total: '3200.00',
        validUntil: '2026-10-01',
        notes: 'Proposta família Martins',
      },
    ]),
    listRecentInteractions: vi.fn().mockResolvedValue([
      {
        id: 'i1',
        agencyId: 'a1',
        customerId: 'c1',
        userId: 'u1',
        channel: 'WHATSAPP',
        direction: 'INBOUND',
        occurredAt: '2026-08-27T10:00:00.000Z',
        summary: 'Cliente confirmou interesse na proposta',
        createdAt: '2026-08-27T10:00:00.000Z',
      },
    ]),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DashboardPage', () => {
  it('shows stat cards populated from the real dashboard aggregate', async () => {
    renderRouted('/');
    expect(await screen.findByText('Vendas (mês)')).toBeInTheDocument();
    expect(screen.getAllByText('Propostas aguardando resposta').length).toBeGreaterThan(0);
    expect(screen.getByText('Viagens futuras')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText('Vendas pendentes')).toBeInTheDocument();
    expect(screen.getByText('Follow-ups hoje')).toBeInTheDocument();
  });

  it('shows recent customer activity from /commercial/interactions', async () => {
    renderRouted('/');
    expect(await screen.findByText('Atividade recente de clientes')).toBeInTheDocument();
    expect(screen.getByText('Cliente confirmou interesse na proposta')).toBeInTheDocument();
  });

  it('shows proposals waiting for a response from /commercial/proposals-waiting', async () => {
    renderRouted('/');
    expect((await screen.findAllByText('Propostas aguardando resposta')).length).toBeGreaterThan(0);
    expect(screen.getByText('Proposta família Martins')).toBeInTheDocument();
  });
});
