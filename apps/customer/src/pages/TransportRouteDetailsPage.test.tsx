import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TransportRouteDetailsPage } from './TransportRouteDetailsPage';
import { getRoute, ApiError } from '../lib/api';

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
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(id = 'r1') {
  return render(
    <MemoryRouter initialEntries={[`/transport/routes/${id}`]}>
      <Routes>
        <Route path="/transport/routes/:id" element={<TransportRouteDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TransportRouteDetailsPage', () => {
  it('renders route fields on success', async () => {
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
    expect(await screen.findByText('Sao Paulo')).toBeInTheDocument();
    expect(screen.getByText('Rio de Janeiro')).toBeInTheDocument();
  });

  it('shows a 404 message when not found', async () => {
    vi.mocked(getRoute).mockRejectedValue(new ApiError('not found', 'NOT_FOUND', 404));
    renderRouted();
    expect(await screen.findByText('Rota não encontrada.')).toBeInTheDocument();
  });
});
