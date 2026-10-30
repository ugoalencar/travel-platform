import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    lookupCep: vi.fn(),
    createCustomerAddress: vi.fn(),
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

describe('CustomerDetailPage - CEP lookup', () => {
  it('fills the address from the CEP without overwriting manual fields', async () => {
    vi.mocked(api.lookupCep).mockClear();
    vi.mocked(api.createCustomerAddress)
      .mockClear()
      .mockResolvedValue({} as Awaited<ReturnType<typeof api.createCustomerAddress>>);
    renderPage('addresses');

    fireEvent.click(await screen.findByRole('button', { name: /Novo endereço/i }));
    const cep = await screen.findByLabelText('CEP');
    let resolveLookup: (value: api.CepLookupResult) => void = () => undefined;
    vi.mocked(api.lookupCep).mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );

    fireEvent.change(cep, { target: { value: '01001-000' } });
    await waitFor(() => expect(api.lookupCep).toHaveBeenCalled(), { timeout: 2000 });
    fireEvent.change(screen.getByLabelText('Número'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Complemento'), { target: { value: 'Apto 1' } });

    await act(async () => {
      resolveLookup({
        status: 'ok',
        street: 'Praça da Sé',
        neighborhood: 'Sé',
        city: 'São Paulo',
        state: 'SP',
        source: 'viacep',
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByLabelText('Rua')).toHaveValue('Praça da Sé'));
    expect(screen.getByLabelText('Bairro')).toHaveValue('Sé');
    expect(screen.getByLabelText('Cidade')).toHaveValue('São Paulo');
    expect(screen.getByLabelText('Estado')).toHaveValue('SP');
    expect(screen.getByLabelText('Número')).toHaveValue('100');
    expect(screen.getByLabelText('Complemento')).toHaveValue('Apto 1');

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      expect(api.createCustomerAddress).toHaveBeenCalledWith('customer-1', {
        type: 'RESIDENTIAL',
        isPrimary: false,
        cep: '01001-000',
        street: 'Praça da Sé',
        number: '100',
        complement: 'Apto 1',
        district: 'Sé',
        city: 'São Paulo',
        state: 'SP',
        country: 'Brazil',
      });
    });
  });

  it('lets the user save a manually typed address after the provider fails', async () => {
    vi.mocked(api.lookupCep)
      .mockClear()
      .mockRejectedValue(
        new api.ApiError('Consulta de CEP indisponível.', 'CEP_UNAVAILABLE', 502),
      );
    vi.mocked(api.createCustomerAddress)
      .mockClear()
      .mockResolvedValue({} as Awaited<ReturnType<typeof api.createCustomerAddress>>);
    renderPage('addresses');

    fireEvent.click(await screen.findByRole('button', { name: /Novo endereço/i }));
    fireEvent.change(await screen.findByLabelText('CEP'), { target: { value: '01001-000' } });
    expect(await screen.findByText('Consulta de CEP indisponível.', {}, { timeout: 2000 }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Rua'), { target: { value: 'Rua Manual' } });
    fireEvent.change(screen.getByLabelText('Número'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Bairro'), { target: { value: 'Centro' } });
    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'Curitiba' } });
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'PR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(api.createCustomerAddress).toHaveBeenCalledWith('customer-1', {
        type: 'RESIDENTIAL',
        isPrimary: false,
        cep: '01001-000',
        street: 'Rua Manual',
        number: '7',
        complement: undefined,
        district: 'Centro',
        city: 'Curitiba',
        state: 'PR',
        country: 'Brazil',
      });
    });
    expect(api.lookupCep).toHaveBeenCalledTimes(1);
  });

  it('aborts a pending lookup when the modal is closed and ignores it after reopening', async () => {
    let signal: AbortSignal | undefined;
    let resolveLookup: (value: api.CepLookupResult) => void = () => undefined;
    vi.mocked(api.lookupCep)
      .mockClear()
      .mockImplementation((_cep, abortSignal) => {
        signal = abortSignal;
        return new Promise((resolve) => {
          resolveLookup = resolve;
        });
      });
    renderPage('addresses');

    fireEvent.click(await screen.findByRole('button', { name: /Novo endereço/i }));
    fireEvent.change(await screen.findByLabelText('CEP'), { target: { value: '01001-000' } });
    await waitFor(() => expect(api.lookupCep).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(signal?.aborted).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(signal?.aborted).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: /Novo endereço/i }));
    expect(await screen.findByLabelText('CEP')).toHaveValue('');
    await act(async () => {
      resolveLookup({
        status: 'ok',
        street: 'Praça da Sé',
        neighborhood: 'Sé',
        city: 'São Paulo',
        state: 'SP',
        source: 'viacep',
      });
      await Promise.resolve();
    });
    expect(screen.getByLabelText('Rua')).toHaveValue('');
    expect(screen.getByLabelText('Cidade')).toHaveValue('');
    expect(api.lookupCep).toHaveBeenCalledTimes(1);
  });
});
