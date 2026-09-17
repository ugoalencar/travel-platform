import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerTripDetailsPage } from './CustomerTripDetailsPage';
import type { Trip } from '../../types/trip';
import type { CustomerTravelRequirementView } from '../../types/travelRequirement';

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
    getMyTrip: vi.fn(),
    getMyAgencyContact: vi.fn(),
    listMyTripAirSegments: vi.fn(),
    listMyTripLandServices: vi.fn(),
    listMyTripPhotos: vi.fn(),
    listMyTripRequirements: vi.fn(),
    listMyDocuments: vi.fn(),
    listMyPaymentSchedule: vi.fn(),
    loadMyTripPhotoBlobUrl: vi.fn(),
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
  name: 'Viagem a Fortaleza',
  destination: 'Fortaleza',
  startDate: '2027-01-01',
  endDate: '2027-01-10',
  status: 'CONFIRMED',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const requirements: CustomerTravelRequirementView[] = [
  {
    id: 'req1',
    agencyId: 'a1',
    customerId: 'c1',
    travelerType: 'CUSTOMER',
    tripId: 't1',
    type: 'PASSAPORTE_VALIDO',
    required: true,
    fulfilled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

async function renderPage() {
  const api = await import('../../lib/customerApi');
  vi.mocked(api.getMyTrip).mockResolvedValue(trip);
  vi.mocked(api.getMyAgencyContact).mockResolvedValue({
    name: 'Horizonte Viagens',
    email: null,
    phone: null,
  });
  vi.mocked(api.listMyTripAirSegments).mockResolvedValue([]);
  vi.mocked(api.listMyTripLandServices).mockResolvedValue([]);
  vi.mocked(api.listMyTripPhotos).mockResolvedValue([]);
  vi.mocked(api.listMyTripRequirements).mockResolvedValue(requirements);
  vi.mocked(api.listMyDocuments).mockResolvedValue([]);
  vi.mocked(api.listMyPaymentSchedule).mockResolvedValue([]);

  render(
    <MemoryRouter initialEntries={['/customer-portal/trips/t1']}>
      <Routes>
        <Route path="/customer-portal/trips/:id" element={<CustomerTripDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CustomerTripDetailsPage', () => {
  it('renders the real "Próximos passos" checklist on the Visão geral tab', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Viagem a Fortaleza')).toBeInTheDocument();
    });
    expect(await screen.findByText('✅ Próximos passos')).toBeInTheDocument();
    expect(screen.getByText('Passaporte válido')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
  });

  it('switches to the Itinerário tab and shows the timeline', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Viagem a Fortaleza'));

    fireEvent.click(screen.getByRole('tab', { name: 'Itinerário' }));

    expect(await screen.findByText('🗓️ Itinerário')).toBeInTheDocument();
  });

  it('switches to the Documentos tab and calls listMyDocuments', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Viagem a Fortaleza'));

    const api = await import('../../lib/customerApi');
    fireEvent.click(screen.getByRole('tab', { name: 'Documentos' }));

    await waitFor(() => {
      expect(api.listMyDocuments).toHaveBeenCalled();
    });
  });

  it('switches to the Pagamentos tab and calls listMyPaymentSchedule', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Viagem a Fortaleza'));

    const api = await import('../../lib/customerApi');
    fireEvent.click(screen.getByRole('tab', { name: 'Pagamentos' }));

    await waitFor(() => {
      expect(api.listMyPaymentSchedule).toHaveBeenCalled();
    });
  });
});
