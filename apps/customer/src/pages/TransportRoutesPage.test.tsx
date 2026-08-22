import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TransportRoutesPage } from './TransportRoutesPage';
import { listRoutes, ApiError } from '../lib/api';
import type { Route as TransportRoute } from '../types/transport';

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
    listRoutes: vi.fn().mockResolvedValue([]),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/transport/routes']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/transport/routes" element={<TransportRoutesPage />} />
        <Route path="/transport/routes/new" element={<div>Nova rota page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

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
];

describe('TransportRoutesPage', () => {
  it('shows a loading state initially', () => {
    vi.mocked(listRoutes).mockReturnValue(new Promise(() => {}));
    renderRouted();
    expect(screen.getByText('Carregando rotas...')).toBeInTheDocument();
  });

  it('renders real data with origin, destination and active', async () => {
    vi.mocked(listRoutes).mockResolvedValue(routes);
    renderRouted();
    expect(await screen.findByText('Sao Paulo')).toBeInTheDocument();
    expect(screen.getByText('Rio de Janeiro')).toBeInTheDocument();
    expect(screen.getByText('Sim')).toBeInTheDocument();
  });

  it('shows an empty state with no crash', async () => {
    vi.mocked(listRoutes).mockResolvedValue([]);
    renderRouted();
    expect(await screen.findByText('Nenhuma rota cadastrada ainda.')).toBeInTheDocument();
  });

  it('shows an error message on failure', async () => {
    vi.mocked(listRoutes).mockRejectedValue(new ApiError('Erro ao listar', 'INTERNAL_ERROR', 500));
    renderRouted();
    expect(await screen.findByText('Erro ao listar')).toBeInTheDocument();
  });

  it('navigates to /transport/routes/new when "+ Nova rota" is clicked', async () => {
    vi.mocked(listRoutes).mockResolvedValue([]);
    renderRouted();
    await screen.findByText('Nenhuma rota cadastrada ainda.');
    fireEvent.click(screen.getByRole('button', { name: '+ Nova rota' }));
    expect(await screen.findByText('Nova rota page')).toBeInTheDocument();
  });
});
