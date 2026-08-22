import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TransportRouteEditPage } from './TransportRouteEditPage';
import { getRoute, updateRoute } from '../lib/api';

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
    getRoute: vi.fn(),
    updateRoute: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted() {
  return render(
    <MemoryRouter initialEntries={['/transport/routes/r1/edit']}>
      <Routes>
        <Route path="/transport/routes/:id/edit" element={<TransportRouteEditPage />} />
        <Route path="/transport/routes/:id" element={<div>Details page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TransportRouteEditPage', () => {
  it('loads current values and includes the active toggle', async () => {
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
    expect(await screen.findByDisplayValue('Sao Paulo')).toBeInTheDocument();
    expect(screen.getByLabelText('Ativa')).toBeChecked();
  });

  it('submits updates and navigates to details', async () => {
    vi.mocked(getRoute).mockResolvedValue({
      id: 'r1',
      agencyId: 'a1',
      origin: 'Sao Paulo',
      destination: 'Rio de Janeiro',
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    vi.mocked(updateRoute).mockResolvedValue({
      id: 'r1',
      agencyId: 'a1',
      origin: 'Sao Paulo',
      destination: 'Rio de Janeiro',
      active: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    renderRouted();
    await screen.findByDisplayValue('Sao Paulo');
    fireEvent.click(screen.getByLabelText('Ativa'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Details page')).toBeInTheDocument();
    expect(updateRoute).toHaveBeenCalledWith('r1', expect.objectContaining({ active: false }));
  });
});
