import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TripDetailsPage } from './TripDetailsPage';
import { TripsPage } from './TripsPage';
import { TripEditPage } from './TripEditPage';
import { getTrip, getCustomer, listTrips, ApiError } from '../lib/api';
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
    getTrip: vi.fn(),
    getCustomer: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/trips/t1']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/trips/:id" element={<TripDetailsPage />} />
        <Route path="/trips/:id/edit" element={<TripEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const fullTrip: Trip = {
  id: 't1',
  agencyId: 'a1',
  customerId: 'c1',
  name: 'Lua de mel Paris',
  destination: 'Paris',
  description: 'Viagem de casamento',
  startDate: '2026-06-01',
  endDate: '2026-06-10',
  status: 'PLANNED',
  notes: 'Rotor dmg',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const customer: Customer = {
  id: 'c1',
  agencyId: 'a1',
  name: 'Maria Silva',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('TripDetailsPage', () => {
  it('renders with a loading state first', () => {
    vi.mocked(getTrip).mockReturnValue(new Promise(() => {}));
    renderRouted();

    expect(screen.getByText('Carregando viagem...')).toBeInTheDocument();
  });

  it('renders real trip data with all fields, including customer name', async () => {
    vi.mocked(getTrip).mockResolvedValue(fullTrip);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    expect(await screen.findByText('Lua de mel Paris')).toBeInTheDocument();
    expect(screen.getByText('Paris')).toBeInTheDocument();
    expect(screen.getByText('PLANNED')).toBeInTheDocument();
    expect(screen.getByText('Viagem de casamento')).toBeInTheDocument();
    expect(screen.getByText('Rotor dmg')).toBeInTheDocument();
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('Detalhes da viagem')).toBeInTheDocument();
  });

  it('falls back to placeholder when customer lookup fails', async () => {
    vi.mocked(getTrip).mockResolvedValue(fullTrip);
    vi.mocked(getCustomer).mockRejectedValue(new ApiError('Not found', 'NOT_FOUND', 404));
    renderRouted();

    await screen.findByText('Lua de mel Paris');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('404 shows a safe generic message', async () => {
    vi.mocked(getTrip).mockRejectedValue(new ApiError('Trip not found', 'NOT_FOUND', 404));
    renderRouted();

    expect(await screen.findByText('Viagem não encontrada.')).toBeInTheDocument();
    expect(screen.queryByText(/NOT_FOUND/)).not.toBeInTheDocument();
  });

  it('generic/other errors show a safe message', async () => {
    vi.mocked(getTrip).mockRejectedValue(
      new ApiError('Internal server error', 'INTERNAL_ERROR', 500),
    );
    renderRouted();

    expect(
      await screen.findByText('Não foi possível carregar a viagem. Tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/INTERNAL_ERROR/)).not.toBeInTheDocument();
  });

  it('"Editar" navigates to /trips/:id/edit', async () => {
    vi.mocked(getTrip).mockResolvedValue(fullTrip);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));

    expect(
      await screen.findByRole('heading', { name: 'Editar viagem' }),
    ).toBeInTheDocument();
  });

  it('"Voltar" navigates to /trips', async () => {
    vi.mocked(getTrip).mockResolvedValue(fullTrip);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    vi.mocked(listTrips).mockResolvedValue([]);
    renderRouted();

    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }));

    expect(await screen.findByRole('heading', { name: 'Viagens' })).toBeInTheDocument();
  });

  it('status is displayed as read-only information', async () => {
    vi.mocked(getTrip).mockResolvedValue(fullTrip);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    await screen.findByText('PLANNED');
    expect(screen.queryByRole('button', { name: /PLANNED/ })).not.toBeInTheDocument();
  });

  it('calls getTrip with the correct id', async () => {
    vi.mocked(getTrip).mockResolvedValue(fullTrip);
    vi.mocked(getCustomer).mockResolvedValue(customer);
    renderRouted();

    await waitFor(() => expect(getTrip).toHaveBeenCalledWith('t1'));
  });
});
