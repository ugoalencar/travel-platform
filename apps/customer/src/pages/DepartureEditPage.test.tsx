import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DepartureEditPage } from './DepartureEditPage';
import { getDeparture, updateDeparture } from '../lib/api';

vi.mock('../lib/api', () => ({
  getDeparture: vi.fn(),
  listSuppliers: vi.fn().mockResolvedValue([]),
  updateDeparture: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const departure = {
  id: 'd1',
  agencyId: 'a1',
  productId: 'p1',
  departureAt: '2026-09-01T10:00:00.000Z',
  capacity: 40,
  serviceType: 'OWN' as const,
  cancelled: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderRouted() {
  return render(
    <MemoryRouter initialEntries={['/transport/departures/d1/edit']}>
      <Routes>
        <Route path="/transport/departures/:id/edit" element={<DepartureEditPage />} />
        <Route path="/transport/departures/:id" element={<div>Details page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DepartureEditPage', () => {
  it('does not render a productId field', async () => {
    vi.mocked(getDeparture).mockResolvedValue(departure);
    renderRouted();
    await screen.findByDisplayValue('40');
    expect(screen.queryByLabelText('Produto')).not.toBeInTheDocument();
  });

  it('rejects a negative capacity client-side and disables submit', async () => {
    vi.mocked(getDeparture).mockResolvedValue(departure);
    renderRouted();
    await screen.findByDisplayValue('40');
    fireEvent.change(screen.getByLabelText('Capacidade'), { target: { value: '-1' } });
    expect(screen.getByText('Capacidade não pode ser negativa.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(updateDeparture).not.toHaveBeenCalled();
  });

  it('submits editable fields (not productId) and navigates to details', async () => {
    vi.mocked(getDeparture).mockResolvedValue(departure);
    vi.mocked(updateDeparture).mockResolvedValue({ ...departure, capacity: 30 });
    renderRouted();
    await screen.findByDisplayValue('40');
    fireEvent.change(screen.getByLabelText('Capacidade'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Details page')).toBeInTheDocument();
    const sentArgs = vi.mocked(updateDeparture).mock.calls[0]![1] as Record<string, unknown>;
    expect(sentArgs.capacity).toBe(30);
    expect(sentArgs).not.toHaveProperty('productId');
  });
});
