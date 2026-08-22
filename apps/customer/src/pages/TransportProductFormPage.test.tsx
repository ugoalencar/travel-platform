import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TransportProductFormPage } from './TransportProductFormPage';
import { createTransportProduct, listRoutes } from '../lib/api';
import type { Route as TransportRoute } from '../types/transport';

vi.mock('../lib/api', () => ({
  createTransportProduct: vi.fn(),
  listRoutes: vi.fn().mockResolvedValue([]),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const routes: TransportRoute[] = [
  {
    id: 'r1',
    agencyId: 'a1',
    origin: 'Sao Paulo',
    destination: 'Rio de Janeiro',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'r2',
    agencyId: 'a1',
    origin: 'Rio de Janeiro',
    destination: 'Sao Paulo',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function renderRouted() {
  return render(
    <MemoryRouter initialEntries={['/transport/products/new']}>
      <Routes>
        <Route path="/transport/products/new" element={<TransportProductFormPage />} />
        <Route path="/transport/products/:id" element={<div>Details page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TransportProductFormPage', () => {
  it('does not show the return-route field for ONE_WAY (the default)', async () => {
    vi.mocked(listRoutes).mockResolvedValue(routes);
    renderRouted();
    await screen.findByText('Sao Paulo → Rio de Janeiro');
    expect(screen.queryByTestId('return-route-field')).not.toBeInTheDocument();
  });

  it('shows the return-route field only after selecting ROUND_TRIP, and hides it again for ONE_WAY', async () => {
    vi.mocked(listRoutes).mockResolvedValue(routes);
    renderRouted();
    await screen.findByText('Sao Paulo → Rio de Janeiro');

    expect(screen.queryByTestId('return-route-field')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tipo de viagem'), {
      target: { value: 'ROUND_TRIP' },
    });
    expect(screen.getByTestId('return-route-field')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tipo de viagem'), { target: { value: 'ONE_WAY' } });
    expect(screen.queryByTestId('return-route-field')).not.toBeInTheDocument();
  });

  it('submits a ONE_WAY product without returnRouteId', async () => {
    vi.mocked(listRoutes).mockResolvedValue(routes);
    vi.mocked(createTransportProduct).mockResolvedValue({
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
    renderRouted();
    await screen.findByText('Sao Paulo → Rio de Janeiro');

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'SP-RJ Executivo' } });
    fireEvent.change(screen.getByLabelText('Rota de ida'), { target: { value: 'r1' } });
    fireEvent.change(screen.getByLabelText('Preço'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Details page')).toBeInTheDocument();
    expect(createTransportProduct).toHaveBeenCalledWith({
      name: 'SP-RJ Executivo',
      tripType: 'ONE_WAY',
      outboundRouteId: 'r1',
      price: 150,
    });
  });

  it('submits a ROUND_TRIP product with returnRouteId', async () => {
    vi.mocked(listRoutes).mockResolvedValue(routes);
    vi.mocked(createTransportProduct).mockResolvedValue({
      id: 'p2',
      agencyId: 'a1',
      name: 'SP-RJ Ida e Volta',
      tripType: 'ROUND_TRIP',
      outboundRouteId: 'r1',
      returnRouteId: 'r2',
      price: 280,
      active: true,
      publiclyBookable: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderRouted();
    await screen.findByText('Sao Paulo → Rio de Janeiro');

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'SP-RJ Ida e Volta' } });
    fireEvent.change(screen.getByLabelText('Tipo de viagem'), {
      target: { value: 'ROUND_TRIP' },
    });
    fireEvent.change(screen.getByLabelText('Rota de ida'), { target: { value: 'r1' } });
    fireEvent.change(screen.getByLabelText('Rota de volta'), { target: { value: 'r2' } });
    fireEvent.change(screen.getByLabelText('Preço'), { target: { value: '280' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Details page')).toBeInTheDocument();
    expect(createTransportProduct).toHaveBeenCalledWith({
      name: 'SP-RJ Ida e Volta',
      tripType: 'ROUND_TRIP',
      outboundRouteId: 'r1',
      returnRouteId: 'r2',
      price: 280,
    });
  });
});
