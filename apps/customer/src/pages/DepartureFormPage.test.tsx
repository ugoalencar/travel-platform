import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DepartureFormPage } from './DepartureFormPage';
import { createDeparture, listSuppliers, listTransportProducts } from '../lib/api';
import type { Supplier, TransportProduct } from '../types/transport';

vi.mock('../lib/api', () => ({
  createDeparture: vi.fn(),
  listTransportProducts: vi.fn().mockResolvedValue([]),
  listSuppliers: vi.fn().mockResolvedValue([]),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

function renderRouted() {
  return render(
    <MemoryRouter initialEntries={['/transport/departures/new']}>
      <Routes>
        <Route path="/transport/departures/new" element={<DepartureFormPage />} />
        <Route path="/transport/departures/:id" element={<div>Details page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DepartureFormPage', () => {
  it('rejects a negative capacity client-side without calling the API', async () => {
    vi.mocked(listTransportProducts).mockResolvedValue(products);
    vi.mocked(listSuppliers).mockResolvedValue(suppliers);
    renderRouted();
    await screen.findByText('SP-RJ Executivo');

    fireEvent.change(screen.getByLabelText('Produto'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Data/hora de saída'), {
      target: { value: '2026-09-01T10:00' },
    });
    fireEvent.change(screen.getByLabelText('Capacidade'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByText('Capacidade não pode ser negativa.')).toBeInTheDocument();
    expect(createDeparture).not.toHaveBeenCalled();
  });

  it('submits with product, capacity, serviceType and optional supplier', async () => {
    vi.mocked(listTransportProducts).mockResolvedValue(products);
    vi.mocked(listSuppliers).mockResolvedValue(suppliers);
    vi.mocked(createDeparture).mockResolvedValue({
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
    renderRouted();
    await screen.findByText('SP-RJ Executivo');

    fireEvent.change(screen.getByLabelText('Produto'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Data/hora de saída'), {
      target: { value: '2026-09-01T10:00' },
    });
    fireEvent.change(screen.getByLabelText('Capacidade'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Fornecedor (opcional)'), {
      target: { value: 's1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Details page')).toBeInTheDocument();
    expect(createDeparture).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'p1', capacity: 40, supplierId: 's1', serviceType: 'OWN' }),
    );
  });
});
