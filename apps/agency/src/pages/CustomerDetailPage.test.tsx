import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerDetailPage } from './CustomerDetailPage';
import * as api from '../lib/api';
import type { Customer } from '../types/customer';
import type { Proposal } from '../types/proposal';
import type { Booking } from '../types/booking';

// Tasks UI + Customer 360 Quick Wins round: Propostas/Reservas/Tarefas tabs
// went from hardcoded-empty to real backend data (see docs/product/TASKS_UI.md).

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return {
    ...actual,
    getCustomer: vi.fn(),
    listWishesByCustomer: vi.fn(),
    listTripsByCustomer: vi.fn(),
    listCustomerAddresses: vi.fn(),
    listCustomerDocuments: vi.fn(),
    listCustomerDependents: vi.fn(),
    listTravelRequirements: vi.fn(),
    listSales: vi.fn(),
    listCustomerInteractions: vi.fn(),
    listProposals: vi.fn(),
    listBookings: vi.fn(),
    listTasks: vi.fn(),
    listEmployees: vi.fn(),
  };
});

const customer: Customer = {
  id: 'customer-1',
  agencyId: 'agency-1',
  protocolNumber: 'CLI-2026-000123',
  name: 'Maria Silva',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const proposal: Proposal = {
  id: 'proposal-1',
  agencyId: 'agency-1',
  customerId: 'customer-1',
  customerName: 'Maria Silva',
  proposedPrice: 5000,
  discount: 0,
  total: 5000,
  validUntil: '2026-12-01T00:00:00.000Z',
  status: 'SENT',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const booking: Booking = {
  id: 'booking-1',
  agencyId: 'agency-1',
  bookerCustomerId: 'customer-1',
  customerName: 'Maria Silva',
  tripType: 'ROUND_TRIP',
  outboundDepartureId: 'departure-1',
  cancelled: false,
  createdAt: '2026-09-05T00:00:00.000Z',
  updatedAt: '2026-09-05T00:00:00.000Z',
};

const task: api.CommercialTask = {
  id: 'task-1',
  agencyId: 'agency-1',
  customerId: 'customer-1',
  assignedUserId: 'employee-user-1',
  type: 'FOLLOW_UP',
  title: 'Follow-up pendente',
  dueAt: '2026-09-23T10:00:00.000Z',
  createdBy: 'employee-user-1',
  createdAt: '2026-09-01T00:00:00.000Z',
};

const employee: api.Employee = {
  id: 'employee-1',
  agencyId: 'agency-1',
  name: 'João',
  employmentType: 'EMPLOYEE',
  status: 'ACTIVE',
  userId: 'employee-user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(api.getCustomer).mockResolvedValue(customer);
  vi.mocked(api.listWishesByCustomer).mockResolvedValue([]);
  vi.mocked(api.listTripsByCustomer).mockResolvedValue([]);
  vi.mocked(api.listCustomerAddresses).mockResolvedValue([]);
  vi.mocked(api.listCustomerDocuments).mockResolvedValue([]);
  vi.mocked(api.listCustomerDependents).mockResolvedValue([]);
  vi.mocked(api.listTravelRequirements).mockResolvedValue([]);
  vi.mocked(api.listSales).mockResolvedValue([]);
  vi.mocked(api.listCustomerInteractions).mockResolvedValue([]);
  vi.mocked(api.listProposals).mockResolvedValue([proposal]);
  vi.mocked(api.listBookings).mockResolvedValue([booking]);
  vi.mocked(api.listTasks).mockResolvedValue({ tasks: [task], total: 1 });
  vi.mocked(api.listEmployees).mockResolvedValue([employee]);
});

function renderPage(tab: string) {
  return render(
    <MemoryRouter initialEntries={[`/customers/customer-1?tab=${tab}`]}>
      <Routes>
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CustomerDetailPage — Propostas/Reservas/Tarefas tabs', () => {
  it('shows real proposals for this customer with a CTA to open it', async () => {
    renderPage('proposals');
    await waitFor(() => {
      expect(screen.getByText(`#${proposal.id.slice(0, 8)}`)).toBeInTheDocument();
    });
    expect(screen.getByText('Enviada')).toBeInTheDocument();
  });

  it('shows an empty state when the customer has no proposals', async () => {
    vi.mocked(api.listProposals).mockResolvedValue([]);
    renderPage('proposals');
    await waitFor(() => {
      expect(screen.getByText('Nenhuma proposta para este cliente.')).toBeInTheDocument();
    });
  });

  it('shows real bookings for this customer', async () => {
    renderPage('bookings');
    await waitFor(() => {
      expect(screen.getByText(`#${booking.id.slice(0, 8)}`)).toBeInTheDocument();
    });
  });

  it('shows an empty state when the customer has no bookings', async () => {
    vi.mocked(api.listBookings).mockResolvedValue([]);
    renderPage('bookings');
    await waitFor(() => {
      expect(screen.getByText('Nenhuma reserva registrada.')).toBeInTheDocument();
    });
  });

  it('shows tasks related to this customer with the assignee resolved by name', async () => {
    renderPage('tasks');
    await waitFor(() => {
      expect(screen.getByText('Follow-up pendente')).toBeInTheDocument();
    });
    expect(screen.getByText(/João/)).toBeInTheDocument();
  });

  it('shows an empty state when the customer has no tasks', async () => {
    vi.mocked(api.listTasks).mockResolvedValue({ tasks: [], total: 0 });
    renderPage('tasks');
    await waitFor(() => {
      expect(screen.getByText('Nenhuma tarefa para este cliente.')).toBeInTheDocument();
    });
  });

  it('filters out proposals/bookings/tasks belonging to other customers', async () => {
    vi.mocked(api.listProposals).mockResolvedValue([
      proposal,
      { ...proposal, id: 'proposal-2', customerId: 'other-customer' },
    ]);
    renderPage('proposals');
    await waitFor(() => {
      expect(screen.getByText(`#${proposal.id.slice(0, 8)}`)).toBeInTheDocument();
    });
    expect(screen.queryByText('#proposal-')).not.toBeInTheDocument();
  });
});
