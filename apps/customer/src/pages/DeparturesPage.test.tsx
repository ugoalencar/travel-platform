import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DeparturesPage } from './DeparturesPage';
import { listDepartures, listSuppliers, listTransportProducts, ApiError } from '../lib/api';
import type { ScheduledDeparture, Supplier, TransportProduct } from '../types/transport';

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
    listDepartures: vi.fn().mockResolvedValue([]),
    listTransportProducts: vi.fn().mockResolvedValue([]),
    listSuppliers: vi.fn().mockResolvedValue([]),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted() {
  return render(
    <MemoryRouter initialEntries={['/transport/departures']}>
      <Routes>
        <Route path="/transport/departures" element={<DeparturesPage />} />
        <Route path="/transport/departures/new" element={<div>Nova saída page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const products: TransportProduct[] = [
  {
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
  },
];

const suppliers: Supplier[] = [
  {
    id: 's1',
    agencyId: 'a1',
    name: 'Fast Bus Ltda',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const departures: ScheduledDeparture[] = [
  {
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
  },
];

describe('DeparturesPage', () => {
  it('shows a loading state initially', () => {
    vi.mocked(listDepartures).mockReturnValue(new Promise(() => {}));
    renderRouted();
    expect(screen.getByText('Carregando saídas...')).toBeInTheDocument();
  });

  it('renders real data with resolved product/supplier name and availableSeats', async () => {
    vi.mocked(listDepartures).mockResolvedValue(departures);
    vi.mocked(listTransportProducts).mockResolvedValue(products);
    vi.mocked(listSuppliers).mockResolvedValue(suppliers);
    renderRouted();
    expect(await screen.findByText('SP-RJ Executivo')).toBeInTheDocument();
    expect(screen.getByText('Fast Bus Ltda')).toBeInTheDocument();
    expect(screen.getAllByText('40')).toHaveLength(2); // capacity and availableSeats
  });

  it('shows an empty state', async () => {
    vi.mocked(listDepartures).mockResolvedValue([]);
    renderRouted();
    expect(await screen.findByText('Nenhuma saída programada ainda.')).toBeInTheDocument();
  });

  it('shows an error message on failure', async () => {
    vi.mocked(listDepartures).mockRejectedValue(new ApiError('Erro', 'INTERNAL_ERROR', 500));
    renderRouted();
    expect(await screen.findByText('Erro')).toBeInTheDocument();
  });

  it('navigates to new departure form', async () => {
    vi.mocked(listDepartures).mockResolvedValue([]);
    renderRouted();
    await screen.findByText('Nenhuma saída programada ainda.');
    fireEvent.click(screen.getByRole('button', { name: '+ Nova saída' }));
    expect(await screen.findByText('Nova saída page')).toBeInTheDocument();
  });
});
