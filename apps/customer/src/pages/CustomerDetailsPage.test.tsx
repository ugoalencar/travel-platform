import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerDetailsPage } from './CustomerDetailsPage';
import { CustomersPage } from './CustomersPage';
import { getCustomer, listCustomers, ApiError } from '../lib/api';
import type { Customer } from '../types/customer';

vi.mock('../lib/api', () => {
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
    listCustomers: vi.fn().mockResolvedValue([]),
    getCustomer: vi.fn(),
    listWishes: vi.fn().mockResolvedValue([]),
    listProposals: vi.fn().mockResolvedValue([]),
    listSales: vi.fn().mockResolvedValue([]),
    listBookings: vi.fn().mockResolvedValue([]),
    listReceivables: vi.fn().mockResolvedValue([]),
    listTrips: vi.fn().mockResolvedValue([]),
    ApiError: MockApiError,
  };
});

vi.mock('../lib/commercialApi', () => ({
  listOpportunities: vi.fn().mockResolvedValue({ opportunities: [], total: 0 }),
  listInteractions: vi.fn().mockResolvedValue({ interactions: [], total: 0 }),
  listTasks: vi.fn().mockResolvedValue({ tasks: [], total: 0 }),
  listPipelines: vi.fn().mockResolvedValue([]),
  listStages: vi.fn().mockResolvedValue([]),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const fullCustomer: Customer = {
  id: 'c1',
  agencyId: 'a1',
  name: 'Maria Silva',
  email: 'maria@example.com',
  phone: '+55 11 90000-0000',
  cpf: '123.456.789-00',
  passport: 'AB123456',
  notes: 'VIP client',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('CustomerDetailsPage', () => {
  it('"Detalhes" navigates to /customers/:id', async () => {
    vi.mocked(listCustomers).mockResolvedValue([fullCustomer]);
    vi.mocked(getCustomer).mockReturnValue(new Promise(() => {}));

    renderRouted(['/customers']);

    fireEvent.click(await screen.findByRole('button', { name: 'Detalhes' }));

    expect(
      await screen.findByRole('heading', { name: 'Detalhes do cliente' }),
    ).toBeInTheDocument();
  });

  it('renders with a loading state first', () => {
    vi.mocked(getCustomer).mockReturnValue(new Promise(() => {}));
    renderRouted(['/customers/c1']);

    expect(screen.getByText('Carregando cliente...')).toBeInTheDocument();
  });

  it('renders real customer data with all fields', async () => {
    vi.mocked(getCustomer).mockResolvedValue(fullCustomer);
    renderRouted(['/customers/c1']);

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('maria@example.com')).toBeInTheDocument();
    expect(screen.getByText('+55 11 90000-0000')).toBeInTheDocument();
    expect(screen.getByText('123.456.789-00')).toBeInTheDocument();
    expect(screen.getByText('AB123456')).toBeInTheDocument();
    expect(screen.getByText('VIP client')).toBeInTheDocument();
  });

  it('optional fields render "—" when missing', async () => {
    vi.mocked(getCustomer).mockResolvedValue({
      id: 'c2',
      agencyId: 'a1',
      name: 'João Souza',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const { container } = renderRouted(['/customers/c2']);

    await screen.findByText('João Souza');
    // Scope to the customer details <dl> only — not Customer 360 summary
    const dl = container.querySelector('dl');
    expect(dl).toBeInTheDocument();
    const dashes = Array.from(dl!.querySelectorAll('dd')).filter(
      (dd) => dd.textContent === '—',
    );
    expect(dashes).toHaveLength(5);
  });

  it('404 shows a safe generic message, never implying cross-tenant existence', async () => {
    vi.mocked(getCustomer).mockRejectedValue(
      new ApiError('Customer not found', 'NOT_FOUND', 404),
    );
    renderRouted(['/customers/c1']);

    expect(await screen.findByText('Cliente não encontrado.')).toBeInTheDocument();
    expect(screen.queryByText(/outra agência/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NOT_FOUND/)).not.toBeInTheDocument();
  });

  it('generic/other errors show a safe message', async () => {
    vi.mocked(getCustomer).mockRejectedValue(
      new ApiError('Internal server error', 'INTERNAL_ERROR', 500),
    );
    renderRouted(['/customers/c1']);

    expect(
      await screen.findByText('Não foi possível carregar o cliente. Tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/INTERNAL_ERROR/)).not.toBeInTheDocument();
  });

  it('calls getCustomer with the correct id', async () => {
    vi.mocked(getCustomer).mockResolvedValue(fullCustomer);
    renderRouted(['/customers/c1']);

    await waitFor(() => expect(getCustomer).toHaveBeenCalledWith('c1'));
  });

  it('"Voltar" navigates to /customers', async () => {
    vi.mocked(getCustomer).mockResolvedValue(fullCustomer);
    vi.mocked(listCustomers).mockResolvedValue([]);
    renderRouted(['/customers/c1']);

    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }));

    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
  });

  describe('Customer 360 "at a glance" summary', () => {
    it('shows "—" placeholders when there is no activity yet', async () => {
      vi.mocked(getCustomer).mockResolvedValue(fullCustomer);
      renderRouted(['/customers/c1']);

      expect(await screen.findByText('Resumo')).toBeInTheDocument();
      expect(screen.getByText('Próxima ação')).toBeInTheDocument();
      expect(screen.getByText('Última interação')).toBeInTheDocument();
      expect(screen.getByText('Próximo retorno')).toBeInTheDocument();
      expect(screen.getByText('Contexto atual')).toBeInTheDocument();
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
    });

    it('surfaces the next open follow-up, last interaction, and current proposal', async () => {
      vi.mocked(getCustomer).mockResolvedValue(fullCustomer);

      const commercialApi = await import('../lib/commercialApi');
      vi.mocked(commercialApi.listTasks).mockResolvedValue({
        tasks: [
          {
            id: 't1',
            agencyId: 'a1',
            customerId: 'c1',
            assignedUserId: 'u1',
            type: 'FOLLOW_UP',
            title: 'Confirmar datas',
            dueAt: '2026-02-01T10:00:00.000Z',
            createdBy: 'u1',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
      });
      vi.mocked(commercialApi.listInteractions).mockResolvedValue({
        interactions: [
          {
            id: 'i1',
            agencyId: 'a1',
            customerId: 'c1',
            userId: 'u1',
            channel: 'PHONE',
            direction: 'OUTBOUND',
            occurredAt: '2026-01-15T10:00:00.000Z',
            summary: 'Ligação de acompanhamento',
            createdAt: '2026-01-15T10:00:00.000Z',
          },
        ],
        total: 1,
      });

      const api = await import('../lib/api');
      vi.mocked(api.listProposals).mockResolvedValue([
        {
          id: 'p1',
          agencyId: 'a1',
          customerId: 'c1',
          proposedPrice: 1000,
          discount: 0,
          total: 1000,
          status: 'SENT',
          createdAt: '2026-01-10T00:00:00.000Z',
          updatedAt: '2026-01-10T00:00:00.000Z',
        },
      ]);

      renderRouted(['/customers/c1']);

      await screen.findByText('Resumo');
      expect(screen.getAllByText(/Confirmar datas/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Ligação de acompanhamento/).length).toBeGreaterThan(0);
      expect(screen.getByText(/Proposta SENT/)).toBeInTheDocument();
    });
  });
});
