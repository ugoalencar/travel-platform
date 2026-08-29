import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderAt } from '../test/render';
import { OffersPage } from './OffersPage';
import { listOffers, ApiError } from '../lib/api';
import type { Offer } from '../lib/api';

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
    listOffers: vi.fn().mockResolvedValue([]),
    getOffer: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const activeOffer: Offer = {
  id: 'o1',
  agencyId: 'a1',
  name: 'Portugal em família',
  description: 'Pacote romântico',
  price: 1500,
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2026-11-30T00:00:00.000Z',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const expiredOffer: Offer = {
  ...activeOffer,
  id: 'o2',
  name: 'Inverno em Bariloche',
  status: 'EXPIRED',
  validUntil: '2026-08-15T00:00:00.000Z',
};

describe('OffersPage', () => {
  it('shows a loading state before offers resolve', () => {
    renderAt(<OffersPage />, '/offers');
    expect(screen.getByText('Carregando ofertas…')).toBeInTheDocument();
  });

  it('renders real offers fetched from GET /offers', async () => {
    vi.mocked(listOffers).mockResolvedValueOnce([activeOffer, expiredOffer]);
    renderAt(<OffersPage />, '/offers');

    expect(await screen.findByText('Portugal em família')).toBeInTheDocument();
    expect(screen.getByText('Inverno em Bariloche')).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('Expirada')).toBeInTheDocument();
  });

  it('shows the empty state when the agency has no offers', async () => {
    renderAt(<OffersPage />, '/offers');
    expect(await screen.findByText('Nenhum registro em ofertas')).toBeInTheDocument();
  });

  it('shows an error message when the offers request fails', async () => {
    vi.mocked(listOffers).mockRejectedValueOnce(new ApiError('boom', 'INTERNAL', 500));
    renderAt(<OffersPage />, '/offers');
    expect(await screen.findByText('boom')).toBeInTheDocument();
  });
});
