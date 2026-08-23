import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerTripsPage } from './CustomerTripsPage';
import type { Trip } from '../../types/trip';

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
    listMyTrips: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const trip: Trip = {
  id: 't1',
  agencyId: 'a1',
  customerId: 'c1',
  name: 'Viagem de teste',
  destination: 'Fortaleza',
  startDate: '2027-01-01',
  endDate: '2027-01-10',
  status: 'PLANNED',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('CustomerTripsPage', () => {
  it('renders the customer own trips returned by listMyTrips', async () => {
    const { listMyTrips } = await import('../../lib/customerApi');
    vi.mocked(listMyTrips).mockResolvedValue([trip]);

    render(
      <MemoryRouter initialEntries={['/customer-portal/trips']}>
        <Routes>
          <Route path="/customer-portal/trips" element={<CustomerTripsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Viagem de teste')).toBeInTheDocument();
    });
    expect(screen.getByText('Fortaleza')).toBeInTheDocument();
  });

  it('renders an empty state when there are no trips', async () => {
    const { listMyTrips } = await import('../../lib/customerApi');
    vi.mocked(listMyTrips).mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/customer-portal/trips']}>
        <Routes>
          <Route path="/customer-portal/trips" element={<CustomerTripsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Nenhuma viagem por aqui ainda.')).toBeInTheDocument();
    });
  });
});
