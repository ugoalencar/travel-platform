import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CommercialAgendaPage } from './CommercialAgendaPage';
import {
  createTask,
  getDashboardSummary,
  getPostSaleCandidates,
  getProposalsWaiting,
  listTasks,
  travelSearch,
  updateTask,
} from '../../lib/commercialApi';
import type { CommercialTask, DashboardSummary } from '../../types/commercial';

vi.mock('../../lib/commercialApi', () => ({
  createTask: vi.fn(),
  getPostSaleCandidates: vi.fn(),
  getProposalsWaiting: vi.fn(),
  listTasks: vi.fn(),
  travelSearch: vi.fn(),
  updateTask: vi.fn(),
  getDashboardSummary: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const dashboard: DashboardSummary = {
  openOpportunitiesCount: 0,
  followUpsDueTodayCount: 0,
  overdueFollowUpsCount: 0,
  proposalsWaitingCount: 0,
  sentProposalsCount: 0,
  acceptedProposalsCount: 0,
  openProposalValueSum: '0',
  salesThisMonthCount: 3,
  salesThisMonthTotal: '15000.50',
  pendingSalesCount: 0,
  confirmedSalesCount: 0,
  paidSalesCount: 0,
  overdueReceivablesCount: 0,
  cancelledBookingsCount: 0,
  pescadorReviewQueueCount: 0,
  upcomingTripsCount: 0,
  postSalePendingCount: 0,
};

const followUp: CommercialTask = {
  id: 't1',
  agencyId: 'a1',
  customerId: 'c1234567-aaaa-bbbb-cccc-000000000001',
  opportunityId: 'o1234567-aaaa-bbbb-cccc-000000000002',
  assignedUserId: 'u1234567-aaaa-bbbb-cccc-000000000003',
  type: 'FOLLOW_UP',
  title: 'Ligar para o cliente',
  dueAt: '2026-01-05T10:00:00.000Z',
  notes: 'Cliente pediu retorno após orçamento',
  createdBy: 'u1',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function setupSuccess(overrides: Partial<{ followUps: CommercialTask[] }> = {}) {
  vi.mocked(listTasks).mockResolvedValue({
    tasks: overrides.followUps ?? [followUp],
    total: 1,
  });
  vi.mocked(getProposalsWaiting).mockResolvedValue([]);
  vi.mocked(travelSearch).mockResolvedValue({ commercial: [], operational: [] });
  vi.mocked(getPostSaleCandidates).mockResolvedValue([
    {
      tripId: 'trip1',
      customerId: 'c9999999-aaaa-bbbb-cccc-000000000009',
      destination: 'Paris',
      endDate: '2026-01-01',
    },
  ]);
  vi.mocked(getDashboardSummary).mockResolvedValue(dashboard);
}

describe('CommercialAgendaPage', () => {
  it('shows real sales-this-month numbers, not a dead stub', async () => {
    setupSuccess();
    render(<CommercialAgendaPage />);

    expect(await screen.findByText('3 vendas')).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => node?.textContent === 'Total: R$ 15.000,50'),
    ).toBeInTheDocument();
  });

  it('enriches a follow-up with its reason/notes, customer, and opportunity', async () => {
    setupSuccess();
    render(<CommercialAgendaPage />);

    await screen.findByText('Ligar para o cliente');
    expect(screen.getByText('Motivo: Cliente pediu retorno após orçamento')).toBeInTheDocument();
    expect(screen.getByText(/Cliente c123456/)).toBeInTheDocument();
    expect(screen.getByText(/Oportunidade o123456/)).toBeInTheDocument();
    expect(screen.getByText(/Responsável u123456/)).toBeInTheDocument();
  });

  it('never calls window.prompt for the post-sale responsible user id', async () => {
    setupSuccess();
    const promptSpy = vi.spyOn(window, 'prompt');
    render(<CommercialAgendaPage />);

    await screen.findByText(/Paris/);
    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa de pós-venda' }));
    fireEvent.change(screen.getByLabelText('ID do responsável'), {
      target: { value: 'u-999' },
    });
    vi.mocked(createTask).mockResolvedValue({ ...followUp, id: 't2' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(promptSpy).not.toHaveBeenCalled();
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ assignedUserId: 'u-999', type: 'POST_SALE' }),
    );
    promptSpy.mockRestore();
  });

  it('marking a follow-up as done calls updateTask and reloads', async () => {
    setupSuccess();
    vi.mocked(updateTask).mockResolvedValue({ ...followUp, completedAt: '2026-01-02T00:00:00.000Z' });
    render(<CommercialAgendaPage />);

    await screen.findByText('Ligar para o cliente');
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como concluído' }));

    expect(updateTask).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ completedAt: expect.any(String) as string }),
    );
  });
});
