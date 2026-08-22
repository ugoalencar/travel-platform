import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TransportAgendaPage } from './TransportAgendaPage';
import { getAgenda, ApiError } from '../lib/api';
import type { AgendaEntry } from '../types/transport';

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
  return { getAgenda: vi.fn().mockResolvedValue([]), ApiError: MockApiError };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const entries: AgendaEntry[] = [
  {
    departure: {
      id: 'd1',
      agencyId: 'a1',
      productId: 'p1',
      departureAt: '2026-09-01T10:00:00.000Z',
      capacity: 40,
      serviceType: 'OWN',
      cancelled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    productName: 'SP-RJ Executivo',
    outboundOrigin: 'Sao Paulo',
    outboundDestination: 'Rio de Janeiro',
    supplierName: 'Fast Bus Ltda',
    availableSeats: 40,
  },
];

describe('TransportAgendaPage', () => {
  it('shows a loading state initially', () => {
    vi.mocked(getAgenda).mockReturnValue(new Promise(() => {}));
    render(<TransportAgendaPage />);
    expect(screen.getByText('Carregando agenda...')).toBeInTheDocument();
  });

  it('renders real data with departure date/time, route, product, capacity, availableSeats, supplier', async () => {
    vi.mocked(getAgenda).mockResolvedValue(entries);
    render(<TransportAgendaPage />);
    expect(await screen.findByText('SP-RJ Executivo')).toBeInTheDocument();
    expect(screen.getByText('Sao Paulo → Rio de Janeiro')).toBeInTheDocument();
    expect(screen.getByText('Fast Bus Ltda')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    vi.mocked(getAgenda).mockResolvedValue([]);
    render(<TransportAgendaPage />);
    expect(await screen.findByText('Nenhuma saída na agenda.')).toBeInTheDocument();
  });

  it('shows an error message on failure', async () => {
    vi.mocked(getAgenda).mockRejectedValue(new ApiError('Erro', 'INTERNAL_ERROR', 500));
    render(<TransportAgendaPage />);
    expect(await screen.findByText('Erro')).toBeInTheDocument();
  });
});
