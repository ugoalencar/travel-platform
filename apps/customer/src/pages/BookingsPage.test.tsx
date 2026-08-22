import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BookingsPage } from './BookingsPage';
import { listBookings, listCustomers, listDepartures, ApiError } from '../lib/api';
import type { Booking } from '../types/booking';
import type { Customer } from '../types/customer';
import type { ScheduledDeparture } from '../types/transport';

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
    listBookings: vi.fn().mockResolvedValue([]),
    listCustomers: vi.fn().mockResolvedValue([]),
    listDepartures: vi.fn().mockResolvedValue([]),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted() {
  return render(
    <MemoryRouter initialEntries={['/bookings']}>
      <Routes>
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/bookings/new" element={<div>Nova reserva page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const customers: Customer[] = [
  {
    id: 'c1',
    agencyId: 'a1',
    name: 'Cliente Teste',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const departures: ScheduledDeparture[] = [
  {
    id: 'd1',
    agencyId: 'a1',
    productId: 'p1',
    departureAt: '2027-01-10T10:00:00.000Z',
    capacity: 10,
    serviceType: 'OWN',
    cancelled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const bookings: Booking[] = [
  {
    id: 'b1',
    agencyId: 'a1',
    bookerCustomerId: 'c1',
    tripType: 'ONE_WAY',
    outboundDepartureId: 'd1',
    cancelled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('BookingsPage', () => {
  it('shows a loading state initially', () => {
    vi.mocked(listBookings).mockReturnValue(new Promise(() => {}));
    renderRouted();
    expect(screen.getByText('Carregando reservas...')).toBeInTheDocument();
  });

  it('renders real data with resolved customer name and trip type', async () => {
    vi.mocked(listBookings).mockResolvedValue(bookings);
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(listDepartures).mockResolvedValue(departures);
    renderRouted();

    expect(await screen.findByText('Cliente Teste')).toBeInTheDocument();
    expect(screen.getByText('Somente ida')).toBeInTheDocument();
  });

  it('shows an empty state with no crash', async () => {
    vi.mocked(listBookings).mockResolvedValue([]);
    renderRouted();
    expect(await screen.findByText('Nenhuma reserva cadastrada ainda.')).toBeInTheDocument();
  });

  it('shows an error message on failure', async () => {
    vi.mocked(listBookings).mockRejectedValue(new ApiError('Erro ao listar', 'INTERNAL_ERROR', 500));
    renderRouted();
    expect(await screen.findByText('Erro ao listar')).toBeInTheDocument();
  });

  it('navigates to /bookings/new when "+ Nova reserva" is clicked', async () => {
    vi.mocked(listBookings).mockResolvedValue([]);
    renderRouted();
    await screen.findByText('Nenhuma reserva cadastrada ainda.');

    fireEvent.click(screen.getByRole('button', { name: '+ Nova reserva' }));

    expect(await screen.findByText('Nova reserva page')).toBeInTheDocument();
  });
});
