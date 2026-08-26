import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BookingDetailsPage } from './BookingDetailsPage';
import { getBooking, getCustomer, getDeparture, cancelBooking, ApiError } from '../lib/api';

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
    getBooking: vi.fn(),
    getCustomer: vi.fn(),
    getDeparture: vi.fn(),
    cancelBooking: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(id = 'b1') {
  return render(
    <MemoryRouter initialEntries={[`/bookings/${id}`]}>
      <Routes>
        <Route path="/bookings/:id" element={<BookingDetailsPage />} />
        <Route path="/bookings" element={<div>Bookings list page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BookingDetailsPage', () => {
  it('renders booker, trip type, departure and passengers', async () => {
    vi.mocked(getBooking).mockResolvedValue({
      booking: {
        id: 'b1',
        agencyId: 'a1',
        bookerCustomerId: 'c1',
        tripType: 'ROUND_TRIP',
        outboundDepartureId: 'd1',
        returnDepartureId: 'd2',
        cancelled: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      passengers: [
        {
          id: 'bp1',
          agencyId: 'a1',
          bookingId: 'b1',
          name: 'Joao',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    vi.mocked(getCustomer).mockResolvedValue({
      id: 'c1',
      agencyId: 'a1',
      name: 'Cliente Teste',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    vi.mocked(getDeparture).mockResolvedValue({
      id: 'd1',
      agencyId: 'a1',
      productId: 'p1',
      departureAt: '2027-01-10T10:00:00.000Z',
      capacity: 10,
      serviceType: 'OWN',
      cancelled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    renderRouted();

    expect(await screen.findByText('Cliente Teste')).toBeInTheDocument();
    expect(screen.getByText('Ida e volta')).toBeInTheDocument();
    expect(screen.getByText('Joao')).toBeInTheDocument();
    expect(screen.getByText('Passageiros (1)')).toBeInTheDocument();
  });

  it('shows a 404 message and a way back when the booking is not found', async () => {
    vi.mocked(getBooking).mockRejectedValue(new ApiError('Not found', 'NOT_FOUND', 404));
    renderRouted();

    expect(await screen.findByText('Reserva não encontrada.')).toBeInTheDocument();
  });

  it('shows cancel button for active bookings and confirms cancellation', async () => {
    const activeBooking = {
      id: 'b1',
      agencyId: 'a1',
      bookerCustomerId: 'c1',
      tripType: 'ONE_WAY' as const,
      outboundDepartureId: 'd1',
      cancelled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    vi.mocked(getBooking).mockResolvedValue({
      booking: activeBooking,
      passengers: [],
    });
    vi.mocked(getCustomer).mockResolvedValue({
      id: 'c1',
      agencyId: 'a1',
      name: 'Cliente',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    vi.mocked(getDeparture).mockResolvedValue({
      id: 'd1',
      agencyId: 'a1',
      productId: 'p1',
      departureAt: '2027-01-10T10:00:00.000Z',
      capacity: 10,
      serviceType: 'OWN',
      cancelled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    vi.mocked(cancelBooking).mockResolvedValue({
      booking: { ...activeBooking, cancelled: true },
    });

    renderRouted();

    await screen.findByText('Cliente');
    expect(screen.getByRole('button', { name: 'Cancelar reserva' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    expect(screen.getByText('Tem certeza?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sim, cancelar' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sim, cancelar' }));
    expect(await screen.findByText('Cancelada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument();
  });

  it('hides cancel button for already cancelled bookings', async () => {
    vi.mocked(getBooking).mockResolvedValue({
      booking: {
        id: 'b1',
        agencyId: 'a1',
        bookerCustomerId: 'c1',
        tripType: 'ONE_WAY',
        outboundDepartureId: 'd1',
        cancelled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      passengers: [],
    });
    vi.mocked(getCustomer).mockResolvedValue({
      id: 'c1',
      agencyId: 'a1',
      name: 'Cliente',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    vi.mocked(getDeparture).mockResolvedValue({
      id: 'd1',
      agencyId: 'a1',
      productId: 'p1',
      departureAt: '2027-01-10T10:00:00.000Z',
      capacity: 10,
      serviceType: 'OWN',
      cancelled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    renderRouted();

    await screen.findByText('Reserva (Cancelada)');
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument();
  });
});
