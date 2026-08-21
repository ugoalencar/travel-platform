import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TripsPage } from './TripsPage';
import { TripFormPage } from './TripFormPage';
import { TripDetailsPage } from './TripDetailsPage';
import { listTrips, getTrip, ApiError } from '../lib/api';
import type { Trip } from '../types/trip';

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
    getTrip: vi.fn(),
    getCustomer: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/trips']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/trips/new" element={<TripFormPage />} />
        <Route path="/trips/:id" element={<TripDetailsPage />} />
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

describe('TripsPage', () => {
  it('renders with a loading state first', () => {
    vi.mocked(listTrips).mockReturnValue(new Promise(() => {}));
    renderRouted();

    expect(screen.getByText('Carregando viagens...')).toBeInTheDocument();
  });

  it('renders real trip data with fields', async () => {
    vi.mocked(listTrips).mockResolvedValue([fullTrip]);
    renderRouted();

    expect(await screen.findByText('Lua de mel Paris')).toBeInTheDocument();
    expect(screen.getByText('Paris')).toBeInTheDocument();
    expect(screen.getByText('PLANNED')).toBeInTheDocument();
    expect(screen.getByText('Viagens')).toBeInTheDocument();
    expect(screen.getByText('Detalhes')).toBeInTheDocument();
  });

  it('empty state', async () => {
    vi.mocked(listTrips).mockResolvedValue([]);
    renderRouted();

    expect(
      await screen.findByText('Nenhuma viagem cadastrada ainda.'),
    ).toBeInTheDocument();
  });

  it('safe error state', async () => {
    vi.mocked(listTrips).mockRejectedValue(
      new ApiError('Internal server error', 'INTERNAL_ERROR', 500),
    );
    renderRouted();

    expect(await screen.findByText('Internal server error')).toBeInTheDocument();
  });

  it('navigates to /trips/new when "+ Nova viagem" is clicked', async () => {
    vi.mocked(listTrips).mockResolvedValue([]);
    renderRouted();

    await screen.findByRole('heading', { name: 'Viagens' });
    fireEvent.click(screen.getByRole('button', { name: '+ Nova viagem' }));

    expect(
      await screen.findByRole('heading', { name: 'Nova viagem' }),
    ).toBeInTheDocument();
  });

  it('"Detalhes" navigates to /trips/:id', async () => {
    vi.mocked(listTrips).mockResolvedValue([fullTrip]);
    vi.mocked(getTrip).mockReturnValue(new Promise(() => {}));
    renderRouted();

    fireEvent.click(await screen.findByRole('button', { name: 'Detalhes' }));

    expect(
      await screen.findByRole('heading', { name: 'Detalhes da viagem' }),
    ).toBeInTheDocument();
  });
});
