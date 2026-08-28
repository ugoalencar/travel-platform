import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TransportProductDetailsPage } from './TransportProductDetailsPage';
import { getRoute, getTransportProduct, ApiError } from '../lib/api';

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
  return { getTransportProduct: vi.fn(), getRoute: vi.fn(), ApiError: MockApiError };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted() {
  return render(
    <MemoryRouter initialEntries={['/transport/products/p1']}>
      <Routes>
        <Route path="/transport/products/:id" element={<TransportProductDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TransportProductDetailsPage', () => {
  it('renders resolved route name, tripType, price, active, publiclyBookable', async () => {
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
    vi.mocked(getRoute).mockResolvedValue({
      id: 'r1',
      agencyId: 'a1',
      origin: 'Sao Paulo',
      destination: 'Rio de Janeiro',
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderRouted();
    expect(await screen.findByText('SP-RJ Executivo')).toBeInTheDocument();
    expect(await screen.findByText('Sao Paulo → Rio de Janeiro')).toBeInTheDocument();
    expect(screen.getByText('ONE_WAY')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('shows a 404 message when not found', async () => {
    vi.mocked(getTransportProduct).mockRejectedValue(new ApiError('not found', 'NOT_FOUND', 404));
    renderRouted();
    expect(await screen.findByText('Produto não encontrado.')).toBeInTheDocument();
  });

  it('displays publiclyBookable semantic copy', async () => {
    vi.mocked(getTransportProduct).mockResolvedValue({
      id: 'p1',
      agencyId: 'a1',
      name: 'Produto',
      tripType: 'ONE_WAY',
      outboundRouteId: 'r1',
      price: 100,
      active: true,
      publiclyBookable: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    vi.mocked(getRoute).mockResolvedValue({
      id: 'r1',
      agencyId: 'a1',
      origin: 'A',
      destination: 'B',
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderRouted();
    expect(
      await screen.findByText('Sim — disponível para clientes e canais externos'),
    ).toBeInTheDocument();

    vi.mocked(getTransportProduct).mockResolvedValue({
      id: 'p1',
      agencyId: 'a1',
      name: 'Produto',
      tripType: 'ONE_WAY',
      outboundRouteId: 'r1',
      price: 100,
      active: true,
      publiclyBookable: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderRouted();
    expect(
      await screen.findByText('Não — apenas reserva manual interna'),
    ).toBeInTheDocument();
  });
});
