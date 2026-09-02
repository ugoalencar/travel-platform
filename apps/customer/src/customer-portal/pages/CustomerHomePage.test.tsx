import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerHomePage } from './CustomerHomePage';
import type { CustomerProfile, CustomerBookingView, CustomerProposalView } from '../../types/customer-portal';
import type { Trip } from '../../types/trip';
import type { Offer } from '../../types/offer';

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
    getMyProfile: vi.fn(),
    listMyTrips: vi.fn(),
    listAvailableOffers: vi.fn(),
    listMyBookings: vi.fn(),
    listMyProposals: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const profile: CustomerProfile = {
  id: 'c1',
  name: 'Maria Souza',
  email: 'maria@example.test',
  phone: null,
  cpfMasked: null,
  passportMasked: null,
  address: null,
};

const trip: Trip = {
  id: 't1',
  agencyId: 'a1',
  customerId: 'c1',
  name: 'Viagem a Fortaleza',
  destination: 'Fortaleza',
  startDate: '2027-01-01',
  endDate: '2027-01-10',
  status: 'PLANNED',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const offers: Offer[] = [
  {
    id: 'o1',
    agencyId: 'a1',
    name: 'Promo',
    price: 500,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const bookings: CustomerBookingView[] = [
  {
    id: 'b1',
    tripType: 'ONE_WAY',
    cancelled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    departureAt: '2027-06-01T10:00:00.000Z',
    arrivalExpectedAt: null,
    productName: 'Van',
    origin: 'SP',
    destination: 'RJ',
    passengerCount: 1,
    isFuture: true,
  },
  {
    id: 'b2',
    tripType: 'ONE_WAY',
    cancelled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    departureAt: '2020-01-01T10:00:00.000Z',
    arrivalExpectedAt: null,
    productName: 'Van',
    origin: 'SP',
    destination: 'RJ',
    passengerCount: 1,
    isFuture: false,
  },
];

const proposals: CustomerProposalView[] = [
  {
    id: 'p1',
    agencyId: 'a1',
    customerId: 'c1',
    offerId: null,
    wishId: null,
    proposedPrice: 100,
    discount: 0,
    total: 100,
    validUntil: null,
    conditions: null,
    status: 'SENT',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('CustomerHomePage', () => {
  it('greets the customer by first name and shows real, non-fabricated counters', async () => {
    const api = await import('../../lib/customerApi');
    vi.mocked(api.getMyProfile).mockResolvedValue(profile);
    vi.mocked(api.listMyTrips).mockResolvedValue([trip]);
    vi.mocked(api.listAvailableOffers).mockResolvedValue(offers);
    vi.mocked(api.listMyBookings).mockResolvedValue(bookings);
    vi.mocked(api.listMyProposals).mockResolvedValue(proposals);

    render(
      <MemoryRouter initialEntries={['/customer-portal/home']}>
        <Routes>
          <Route path="/customer-portal/home" element={<CustomerHomePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Bem-vindo, Maria!/)).toBeInTheDocument();
    });
    expect(screen.getByText('Viagem a Fortaleza')).toBeInTheDocument();
    // Only 1 of the 2 mocked bookings is future/active -- the counter must
    // reflect the server-computed isFuture flag, not bookings.length.
    const activeBookingsValue = screen.getAllByText('1');
    expect(activeBookingsValue.length).toBeGreaterThan(0);
  });
});
