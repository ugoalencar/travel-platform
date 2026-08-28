import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OperationDetailsPage } from './OperationDetailsPage';
import {
  confirmArrival,
  confirmDeparture,
  getOperation,
  getDeparture,
  getTransportProduct,
  getRoute,
  ApiError,
} from '../lib/api';
import type { OperationWithCheckpoints } from '../types/operations';

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
    getOperation: vi.fn(),
    confirmArrival: vi.fn(),
    confirmDeparture: vi.fn(),
    getDeparture: vi.fn(),
    getTransportProduct: vi.fn(),
    getRoute: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(id = 'op1') {
  return render(
    <MemoryRouter initialEntries={[`/operations/${id}`]}>
      <Routes>
        <Route path="/operations/:id" element={<OperationDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const baseOperation: OperationWithCheckpoints = {
  operation: { id: 'op1', agencyId: 'a1', departureId: 'd1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  checkpoints: [],
};

function setupHeaderMocks() {
  vi.mocked(getDeparture).mockResolvedValue({
    id: 'd1',
    agencyId: 'a1',
    productId: 'p1',
    departureAt: '2026-06-15T10:00:00.000Z',
    capacity: 40,
    serviceType: 'OWN',
    cancelled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  vi.mocked(getTransportProduct).mockResolvedValue({
    id: 'p1',
    agencyId: 'a1',
    name: 'Expresso SP-RJ',
    tripType: 'ONE_WAY',
    outboundRouteId: 'r1',
    price: 150,
    active: true,
    publiclyBookable: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  vi.mocked(getRoute).mockResolvedValue({
    id: 'r1',
    agencyId: 'a1',
    origin: 'Sao Paulo',
    destination: 'Rio de Janeiro',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
}

beforeEach(() => {
  vi.mocked(getDeparture).mockResolvedValue({
    id: 'd1',
    agencyId: 'a1',
    productId: 'p1',
    departureAt: '2026-06-15T10:00:00.000Z',
    capacity: 40,
    serviceType: 'OWN',
    cancelled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  vi.mocked(getTransportProduct).mockResolvedValue({
    id: 'p1',
    agencyId: 'a1',
    name: 'Produto Teste',
    tripType: 'ONE_WAY',
    outboundRouteId: 'r1',
    price: 100,
    active: true,
    publiclyBookable: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  vi.mocked(getRoute).mockResolvedValue({
    id: 'r1',
    agencyId: 'a1',
    origin: 'Origem',
    destination: 'Destino',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
});

describe('OperationDetailsPage', () => {
  it('shows a loading state initially', () => {
    vi.mocked(getOperation).mockReturnValue(new Promise(() => {}));
    renderRouted();
    expect(screen.getByText('Carregando operação...')).toBeInTheDocument();
  });

  it('shows an error message on failure', async () => {
    vi.mocked(getOperation).mockRejectedValue(new ApiError('Erro', 'NOT_FOUND', 404));
    renderRouted();
    expect(await screen.findByText('Erro')).toBeInTheDocument();
  });

  it('shows an empty state when there are no monitored checkpoints', async () => {
    vi.mocked(getOperation).mockResolvedValue(baseOperation);
    renderRouted();
    expect(
      await screen.findByText('Nenhum checkpoint monitorado nesta operação.'),
    ).toBeInTheDocument();
  });

  it('shows CONFIRMAR CHEGADA only for ARRIVAL/BOTH types, and CONFIRMAR SAÍDA only for DEPARTURE/BOTH', async () => {
    vi.mocked(getOperation).mockResolvedValue({
      operation: baseOperation.operation,
      checkpoints: [
        {
          id: 'c1',
          agencyId: 'a1',
          operationId: 'op1',
          routePointId: 'rp1',
          checkpointType: 'ARRIVAL',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          expectedAt: '2026-06-01T10:30:00.000Z',
        },
        {
          id: 'c2',
          agencyId: 'a1',
          operationId: 'op1',
          routePointId: 'rp2',
          checkpointType: 'DEPARTURE',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    renderRouted();
    await screen.findByText(/Ponto rp1/);
    expect(screen.getAllByRole('button', { name: 'CONFIRMAR CHEGADA' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'CONFIRMAR SAÍDA' })).toHaveLength(1);
  });

  it('confirming arrival replaces the button with "confirmado às HH:MM" and disables re-confirmation', async () => {
    vi.mocked(getOperation)
      .mockResolvedValueOnce({
        operation: baseOperation.operation,
        checkpoints: [
          {
            id: 'c1',
            agencyId: 'a1',
            operationId: 'op1',
            routePointId: 'rp1',
            checkpointType: 'ARRIVAL',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            expectedAt: '2026-06-01T10:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        operation: baseOperation.operation,
        checkpoints: [
          {
            id: 'c1',
            agencyId: 'a1',
            operationId: 'op1',
            routePointId: 'rp1',
            checkpointType: 'ARRIVAL',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            expectedAt: '2026-06-01T10:00:00.000Z',
            arrivalCheckedAt: '2026-06-01T10:15:00.000Z',
          },
        ],
      });
    vi.mocked(confirmArrival).mockResolvedValue({
      id: 'c1',
      agencyId: 'a1',
      operationId: 'op1',
      routePointId: 'rp1',
      checkpointType: 'ARRIVAL',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      arrivalCheckedAt: '2026-06-01T10:15:00.000Z',
    });

    renderRouted();
    const button = await screen.findByRole('button', { name: 'CONFIRMAR CHEGADA' });
    fireEvent.click(button);

    expect(await screen.findByText(/Chegada confirmada às/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'CONFIRMAR CHEGADA' })).not.toBeInTheDocument();
  });

  it('shows expected/actual/delay once a confirmation is recorded', async () => {
    vi.mocked(getOperation).mockResolvedValue({
      operation: baseOperation.operation,
      checkpoints: [
        {
          id: 'c1',
          agencyId: 'a1',
          operationId: 'op1',
          routePointId: 'rp1',
          checkpointType: 'DEPARTURE',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          expectedAt: '2026-06-01T10:00:00.000Z',
          departureCheckedAt: '2026-06-01T10:20:00.000Z',
        },
      ],
    });
    renderRouted();
    expect(await screen.findByText(/Saída confirmada às/)).toBeInTheDocument();
    expect(screen.getByText(/20 min de atraso/)).toBeInTheDocument();
  });

  it('rejects (shows error) when confirming an already-confirmed checkpoint via server 409', async () => {
    vi.mocked(getOperation).mockResolvedValue({
      operation: baseOperation.operation,
      checkpoints: [
        {
          id: 'c1',
          agencyId: 'a1',
          operationId: 'op1',
          routePointId: 'rp1',
          checkpointType: 'ARRIVAL',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    vi.mocked(confirmArrival).mockRejectedValue(
      new ApiError('This checkpoint\'s arrival was already confirmed', 'CONFLICT', 409),
    );
    renderRouted();
    const button = await screen.findByRole('button', { name: 'CONFIRMAR CHEGADA' });
    fireEvent.click(button);
    expect(await screen.findByText(/already confirmed/)).toBeInTheDocument();
  });

  it('rejects cross-tenant operation with 404 shown as an error', async () => {
    vi.mocked(getOperation).mockRejectedValue(new ApiError('Operation not found', 'NOT_FOUND', 404));
    renderRouted();
    expect(await screen.findByText('Operation not found')).toBeInTheDocument();
    void confirmDeparture;
  });

  it('displays route point name instead of raw UUID', async () => {
    setupHeaderMocks();
    vi.mocked(getOperation).mockResolvedValue({
      operation: baseOperation.operation,
      checkpoints: [
        {
          id: 'c1',
          agencyId: 'a1',
          operationId: 'op1',
          routePointId: 'rp1',
          routePointName: 'Terminal Guarulhos',
          checkpointType: 'ARRIVAL',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    renderRouted();
    expect(await screen.findByText('Terminal Guarulhos')).toBeInTheDocument();
    expect(screen.queryByText(/rp1/)).not.toBeInTheDocument();
  });

  it('shows operation header with route, product, departure, and status', async () => {
    setupHeaderMocks();
    vi.mocked(getOperation).mockResolvedValue(baseOperation);
    renderRouted();
    expect(await screen.findByText('Sao Paulo → Rio de Janeiro')).toBeInTheDocument();
    expect(screen.getByText('Expresso SP-RJ')).toBeInTheDocument();
    expect(screen.getByText('Operação ativa')).toBeInTheDocument();
  });
});
