import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerBookingsPage } from './CustomerBookingsPage';
import type { CustomerBookingView } from '../../types/customer-portal';

vi.mock('../../lib/customerApi', () => {
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
    listMyBookings: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const futureBooking: CustomerBookingView = {
  id: 'b1',
  tripType: 'ONE_WAY',
  cancelled: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  departureAt: '2027-06-01T10:00:00.000Z',
  arrivalExpectedAt: null,
  productName: 'Van Executiva',
  origin: 'São Paulo',
  destination: 'Rio de Janeiro',
  passengerCount: 2,
  isFuture: true,
};

const pastBooking: CustomerBookingView = {
  ...futureBooking,
  id: 'b2',
  departureAt: '2020-01-01T10:00:00.000Z',
  isFuture: false,
};

describe('CustomerBookingsPage', () => {
  it('renders route, product, passenger count and no raw ids for each booking', async () => {
    const { listMyBookings } = await import('../../lib/customerApi');
    vi.mocked(listMyBookings).mockResolvedValue([futureBooking]);

    render(
      <MemoryRouter initialEntries={['/customer-portal/bookings']}>
        <Routes>
          <Route path="/customer-portal/bookings" element={<CustomerBookingsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('São Paulo → Rio de Janeiro')).toBeInTheDocument();
    });
    expect(screen.getByText('Van Executiva')).toBeInTheDocument();
    expect(screen.getByText(/2 passageiros/)).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    // No raw UUID/foreign-key-looking id shown anywhere in the card text.
    expect(screen.queryByText(/b1/)).not.toBeInTheDocument();
  });

  it('labels a non-cancelled but departed booking as "Realizada", not "Ativa"', async () => {
    const { listMyBookings } = await import('../../lib/customerApi');
    vi.mocked(listMyBookings).mockResolvedValue([pastBooking]);

    render(
      <MemoryRouter initialEntries={['/customer-portal/bookings']}>
        <Routes>
          <Route path="/customer-portal/bookings" element={<CustomerBookingsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Realizada')).toBeInTheDocument();
    });
  });
});
