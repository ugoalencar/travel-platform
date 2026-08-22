import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DepartureDetailsPage } from './DepartureDetailsPage';
import { getDeparture, getSupplier, getTransportProduct, ApiError } from '../lib/api';

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
    getDeparture: vi.fn(),
    getTransportProduct: vi.fn(),
    getSupplier: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted() {
  return render(
    <MemoryRouter initialEntries={['/transport/departures/d1']}>
      <Routes>
        <Route path="/transport/departures/:id" element={<DepartureDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DepartureDetailsPage', () => {
  it('renders resolved product/supplier names and all fields', async () => {
    vi.mocked(getDeparture).mockResolvedValue({
      id: 'd1',
      agencyId: 'a1',
      productId: 'p1',
      departureAt: '2026-09-01T10:00:00.000Z',
      capacity: 40,
      supplierId: 's1',
      serviceType: 'OWN',
      cancelled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    vi.mocked(getTransportProduct).mockResolvedValue({
      id: 'p1',
      agencyId: 'a1',
      name: 'SP-RJ Executivo',
      tripType: 'ONE_WAY',
      outboundRouteId: 'r1',
      price: 150,
      active: true,
      publiclyBookable: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    vi.mocked(getSupplier).mockResolvedValue({
      id: 's1',
      agencyId: 'a1',
      name: 'Fast Bus Ltda',
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderRouted();
    expect(await screen.findByText('SP-RJ Executivo')).toBeInTheDocument();
    expect(await screen.findByText('Fast Bus Ltda')).toBeInTheDocument();
    expect(screen.getByText('OWN')).toBeInTheDocument();
  });

  it('shows a 404 message when not found', async () => {
    vi.mocked(getDeparture).mockRejectedValue(new ApiError('not found', 'NOT_FOUND', 404));
    renderRouted();
    expect(await screen.findByText('Saída não encontrada.')).toBeInTheDocument();
  });
});
