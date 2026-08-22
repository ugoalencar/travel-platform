import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TransportProductsPage } from './TransportProductsPage';
import { listTransportProducts, ApiError } from '../lib/api';
import type { TransportProduct } from '../types/transport';

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
  return { listTransportProducts: vi.fn().mockResolvedValue([]), ApiError: MockApiError };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted() {
  return render(
    <MemoryRouter initialEntries={['/transport/products']}>
      <Routes>
        <Route path="/transport/products" element={<TransportProductsPage />} />
        <Route path="/transport/products/new" element={<div>Novo produto page</div>} />
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

describe('TransportProductsPage', () => {
  it('shows a loading state initially', () => {
    vi.mocked(listTransportProducts).mockReturnValue(new Promise(() => {}));
    renderRouted();
    expect(screen.getByText('Carregando produtos...')).toBeInTheDocument();
  });

  it('renders real data with name, tripType, price, active, publiclyBookable', async () => {
    vi.mocked(listTransportProducts).mockResolvedValue(products);
    renderRouted();
    expect(await screen.findByText('SP-RJ Executivo')).toBeInTheDocument();
    expect(screen.getByText('ONE_WAY')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    vi.mocked(listTransportProducts).mockResolvedValue([]);
    renderRouted();
    expect(await screen.findByText('Nenhum produto cadastrado ainda.')).toBeInTheDocument();
  });

  it('shows an error message on failure', async () => {
    vi.mocked(listTransportProducts).mockRejectedValue(new ApiError('Erro', 'INTERNAL_ERROR', 500));
    renderRouted();
    expect(await screen.findByText('Erro')).toBeInTheDocument();
  });

  it('navigates to new product form', async () => {
    vi.mocked(listTransportProducts).mockResolvedValue([]);
    renderRouted();
    await screen.findByText('Nenhum produto cadastrado ainda.');
    fireEvent.click(screen.getByRole('button', { name: '+ Novo produto' }));
    expect(await screen.findByText('Novo produto page')).toBeInTheDocument();
  });
});
