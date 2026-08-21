import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TripFormPage } from './TripFormPage';
import { TripsPage } from './TripsPage';
import { createTrip, listCustomers, listTrips, ApiError } from '../lib/api';
import type { Trip } from '../types/trip';
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
    listTrips: vi.fn().mockResolvedValue([]),
    listCustomers: vi.fn().mockResolvedValue([]),
    createTrip: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/trips/new']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/trips/new" element={<TripFormPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const customers: Customer[] = [
  {
    id: 'c1',
    agencyId: 'a1',
    name: 'Maria Silva',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'c2',
    agencyId: 'a1',
    name: 'João Souza',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const createdTrip: Trip = {
  id: 't1',
  agencyId: 'a1',
  customerId: 'c1',
  name: 'Lua de mel',
  destination: 'Paris',
  startDate: '2026-06-01',
  endDate: '2026-06-10',
  status: 'PLANNED',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function fillCustomer(customerId = 'c1') {
  const select = await screen.findByLabelText('Cliente');
  fireEvent.change(select, { target: { value: customerId } });
}

describe('TripFormPage', () => {
  it('renders customer selector populated from mocked listCustomers()', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    expect(screen.getByRole('heading', { name: 'Nova viagem' })).toBeInTheDocument();
    const select = await screen.findByLabelText('Cliente');
    expect(within(select).getByText('Maria Silva')).toBeInTheDocument();
    expect(within(select).getByText('João Souza')).toBeInTheDocument();
  });

  it('valid submit calls createTrip with customerId and no agencyId/tenantId/status/saleId', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createTrip).mockResolvedValue(createdTrip);
    renderRouted();

    await fillCustomer('c1');
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Lua de mel' } });
    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: 'Paris' } });
    fireEvent.change(screen.getByLabelText('Data de início'), {
      target: { value: '2026-06-01' },
    });
    fireEvent.change(screen.getByLabelText('Data de fim'), {
      target: { value: '2026-06-10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createTrip).mock.calls[0]?.[0] as unknown as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      customerId: 'c1',
      name: 'Lua de mel',
      destination: 'Paris',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
    });
    expect(payload).not.toHaveProperty('agencyId');
    expect(payload).not.toHaveProperty('tenantId');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('saleId');
  });

  it('missing customer shows validation error and does not submit', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    await screen.findByLabelText('Cliente');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Cliente é obrigatório.')).toBeInTheDocument();
    expect(createTrip).not.toHaveBeenCalled();
  });

  it('shows submitting state and disables the submit button while saving', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    let resolvePromise: (value: Trip) => void = () => {};
    vi.mocked(createTrip).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    renderRouted();

    await fillCustomer('c1');
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Lua de mel' } });
    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: 'Paris' } });
    fireEvent.change(screen.getByLabelText('Data de início'), {
      target: { value: '2026-06-01' },
    });
    fireEvent.change(screen.getByLabelText('Data de fim'), {
      target: { value: '2026-06-10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('button', { name: 'Salvando...' })).toBeDisabled();

    resolvePromise(createdTrip);
    await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(1));
  });

  it('cancel does not call createTrip and navigates back to /trips', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(listTrips).mockResolvedValue([]);
    renderRouted();

    await screen.findByLabelText('Cliente');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(createTrip).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Viagens' })).toBeInTheDocument();
  });

  it('400 error displays the backend message', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createTrip).mockRejectedValue(
      new ApiError('Field "name" is required', 'VALIDATION_ERROR', 400),
    );
    renderRouted();

    await fillCustomer('c1');
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Lua de mel' } });
    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: 'Paris' } });
    fireEvent.change(screen.getByLabelText('Data de início'), {
      target: { value: '2026-06-01' },
    });
    fireEvent.change(screen.getByLabelText('Data de fim'), {
      target: { value: '2026-06-10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Field "name" is required'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/VALIDATION_ERROR/)).not.toBeInTheDocument();
  });

  it('403 error shows a safe permission message', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createTrip).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    renderRouted();

    await fillCustomer('c1');
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Lua de mel' } });
    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: 'Paris' } });
    fireEvent.change(screen.getByLabelText('Data de início'), {
      target: { value: '2026-06-01' },
    });
    fireEvent.change(screen.getByLabelText('Data de fim'), {
      target: { value: '2026-06-10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Você não tem permissão para criar viagens.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/FORBIDDEN/)).not.toBeInTheDocument();
  });

  it('status is not rendered as an editable field', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    await screen.findByLabelText('Cliente');
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
  });

  it('saleId is not rendered as an editable field', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    await screen.findByLabelText('Cliente');
    expect(screen.queryByLabelText('Venda')).not.toBeInTheDocument();
    expect(screen.queryByText('saleId')).not.toBeInTheDocument();
  });

  it('500/unknown error shows a generic safe message', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createTrip).mockRejectedValue(
      new ApiError('Internal server error', 'INTERNAL_ERROR', 500),
    );
    renderRouted();

    await fillCustomer('c1');
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Lua de mel' } });
    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: 'Paris' } });
    fireEvent.change(screen.getByLabelText('Data de início'), {
      target: { value: '2026-06-01' },
    });
    fireEvent.change(screen.getByLabelText('Data de fim'), {
      target: { value: '2026-06-10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Não foi possível salvar a viagem. Tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/INTERNAL_ERROR/)).not.toBeInTheDocument();
  });
});
