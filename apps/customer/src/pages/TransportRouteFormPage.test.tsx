import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TransportRouteFormPage } from './TransportRouteFormPage';
import { createRoute } from '../lib/api';

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
    createRoute: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted() {
  return render(
    <MemoryRouter initialEntries={['/transport/routes/new']}>
      <Routes>
        <Route path="/transport/routes/new" element={<TransportRouteFormPage />} />
        <Route path="/transport/routes/:id" element={<div>Details page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TransportRouteFormPage', () => {
  it('requires origin and destination', () => {
    renderRouted();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByText('Origem e destino são obrigatórios.')).toBeInTheDocument();
    expect(createRoute).not.toHaveBeenCalled();
  });

  it('submits only submitted fields and navigates to the created route', async () => {
    vi.mocked(createRoute).mockResolvedValue({
      id: 'r1',
      agencyId: 'a1',
      origin: 'Sao Paulo',
      destination: 'Rio de Janeiro',
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderRouted();

    fireEvent.change(screen.getByLabelText('Origem'), { target: { value: 'Sao Paulo' } });
    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: 'Rio de Janeiro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Details page')).toBeInTheDocument();
    expect(createRoute).toHaveBeenCalledWith({ origin: 'Sao Paulo', destination: 'Rio de Janeiro' });
  });
});
