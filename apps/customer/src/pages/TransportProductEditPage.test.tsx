import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TransportProductEditPage } from './TransportProductEditPage';
import { getTransportProduct, updateTransportProduct } from '../lib/api';

vi.mock('../lib/api', () => ({ getTransportProduct: vi.fn(), updateTransportProduct: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted() {
  return render(
    <MemoryRouter initialEntries={['/transport/products/p1/edit']}>
      <Routes>
        <Route path="/transport/products/:id/edit" element={<TransportProductEditPage />} />
        <Route path="/transport/products/:id" element={<div>Details page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const product = {
  id: 'p1',
  agencyId: 'a1',
  name: 'SP-RJ Executivo',
  tripType: 'ONE_WAY' as const,
  outboundRouteId: 'r1',
  price: 150,
  active: true,
  publiclyBookable: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('TransportProductEditPage', () => {
  it('does not render tripType/route selectors as editable fields', async () => {
    vi.mocked(getTransportProduct).mockResolvedValue(product);
    renderRouted();
    await screen.findByDisplayValue('SP-RJ Executivo');
    expect(screen.queryByLabelText('Tipo de viagem')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Rota de ida')).not.toBeInTheDocument();
  });

  it('submits name/price/active/publiclyBookable/notes only', async () => {
    vi.mocked(getTransportProduct).mockResolvedValue(product);
    vi.mocked(updateTransportProduct).mockResolvedValue({ ...product, price: 200 });
    renderRouted();
    await screen.findByDisplayValue('SP-RJ Executivo');
    fireEvent.change(screen.getByLabelText('Preço'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Details page')).toBeInTheDocument();
    expect(updateTransportProduct).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ name: 'SP-RJ Executivo', price: 200, active: true, publiclyBookable: false }),
    );
    const sentArgs = vi.mocked(updateTransportProduct).mock.calls[0]![1] as Record<string, unknown>;
    expect(sentArgs).not.toHaveProperty('tripType');
    expect(sentArgs).not.toHaveProperty('outboundRouteId');
    expect(sentArgs).not.toHaveProperty('returnRouteId');
  });
});
