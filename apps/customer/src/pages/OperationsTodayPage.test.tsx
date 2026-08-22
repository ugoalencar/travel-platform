import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OperationsTodayPage } from './OperationsTodayPage';
import { createOperation, listDepartures, listOperations, ApiError } from '../lib/api';
import type { ScheduledDeparture } from '../types/transport';
import type { TransportOperation } from '../types/operations';

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
    listOperations: vi.fn().mockResolvedValue([]),
    listDepartures: vi.fn().mockResolvedValue([]),
    createOperation: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted() {
  return render(
    <MemoryRouter initialEntries={['/operations/today']}>
      <Routes>
        <Route path="/operations/today" element={<OperationsTodayPage />} />
        <Route path="/operations/:id" element={<div>Operation details page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const now = new Date();
const todayIso = now.toISOString();

const departures: ScheduledDeparture[] = [
  {
    id: 'd1',
    agencyId: 'a1',
    productId: 'p1',
    departureAt: todayIso,
    capacity: 40,
    serviceType: 'OWN',
    cancelled: false,
    createdAt: todayIso,
    updatedAt: todayIso,
  },
];

const operations: TransportOperation[] = [
  {
    id: 'op1',
    agencyId: 'a1',
    departureId: 'd1',
    createdAt: todayIso,
    updatedAt: todayIso,
  },
];

describe('OperationsTodayPage', () => {
  it('shows a loading state initially', () => {
    vi.mocked(listOperations).mockReturnValue(new Promise(() => {}));
    renderRouted();
    expect(screen.getByText('Carregando operações...')).toBeInTheDocument();
  });

  it('shows an empty state when there are no operations and no pending departures', async () => {
    vi.mocked(listOperations).mockResolvedValue([]);
    vi.mocked(listDepartures).mockResolvedValue([]);
    renderRouted();
    expect(await screen.findByText('Nenhuma operação hoje.')).toBeInTheDocument();
  });

  it('renders an existing operation with a link to its checklist', async () => {
    vi.mocked(listOperations).mockResolvedValue(operations);
    vi.mocked(listDepartures).mockResolvedValue(departures);
    renderRouted();
    expect(await screen.findByText('Operação op1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver checklist' }));
    expect(await screen.findByText('Operation details page')).toBeInTheDocument();
  });

  it('offers to create an operation for a departure today without one, and navigates on success', async () => {
    vi.mocked(listOperations).mockResolvedValue([]);
    vi.mocked(listDepartures).mockResolvedValue(departures);
    vi.mocked(createOperation).mockResolvedValue({
      operation: { id: 'op-new', agencyId: 'a1', departureId: 'd1', createdAt: todayIso, updatedAt: todayIso },
      checkpoints: [],
    });
    renderRouted();
    const button = await screen.findByRole('button', { name: 'Iniciar operação' });
    fireEvent.click(button);
    expect(await screen.findByText('Operation details page')).toBeInTheDocument();
  });

  it('shows an error message on failure', async () => {
    vi.mocked(listOperations).mockRejectedValue(new ApiError('Erro', 'INTERNAL_ERROR', 500));
    renderRouted();
    expect(await screen.findByText('Erro')).toBeInTheDocument();
  });
});
