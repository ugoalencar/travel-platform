import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OffersPage } from './OffersPage';
import { OfferFormPage } from './OfferFormPage';
import { OfferDetailsPage } from './OfferDetailsPage';
import { listOffers, getOffer, ApiError } from '../lib/api';
import type { Offer } from '../types/offer';

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
    createOffer: vi.fn(),
    updateOffer: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/offers']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/offers" element={<OffersPage />} />
        <Route path="/offers/new" element={<OfferFormPage />} />
        <Route path="/offers/:id" element={<OfferDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const activeOffer: Offer = {
  id: 'o1',
  agencyId: 'a1',
  name: 'Pacote Paris',
  description: 'Pacote romantico',
  price: 1500,
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2099-01-01T00:00:00.000Z',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  featured: false,
  showOnCustomerApp: true,
  displayPriority: 100,
};

const expiredOffer: Offer = {
  id: 'o2',
  agencyId: 'a1',
  name: 'Pacote Verao Antigo',
  price: 800,
  validUntil: '2020-01-01T00:00:00.000Z',
  status: 'EXPIRED',
  createdAt: '2019-01-01T00:00:00.000Z',
  updatedAt: '2019-01-01T00:00:00.000Z',
  featured: false,
  showOnCustomerApp: true,
  displayPriority: 100,
};

describe('OffersPage', () => {
  it('renders with a loading state first', () => {
    vi.mocked(listOffers).mockReturnValue(new Promise(() => {}));
    renderRouted();

    expect(screen.getByText('Carregando ofertas...')).toBeInTheDocument();
  });

  it('renders real offer data with fields', async () => {
    vi.mocked(listOffers).mockResolvedValue([activeOffer]);
    renderRouted();

    expect(await screen.findByText('Pacote Paris')).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('Ofertas')).toBeInTheDocument();
    expect(screen.getByText('Detalhes')).toBeInTheDocument();
  });

  it('empty state', async () => {
    vi.mocked(listOffers).mockResolvedValue([]);
    renderRouted();

    expect(
      await screen.findByText('Nenhuma oferta cadastrada ainda.'),
    ).toBeInTheDocument();
  });

  it('safe error state', async () => {
    vi.mocked(listOffers).mockRejectedValue(
      new ApiError('Internal server error', 'INTERNAL_ERROR', 500),
    );
    renderRouted();

    expect(await screen.findByText('Internal server error')).toBeInTheDocument();
  });

  it('navigates to /offers/new when "+ Nova oferta" is clicked', async () => {
    vi.mocked(listOffers).mockResolvedValue([]);
    renderRouted();

    await screen.findByRole('heading', { name: 'Ofertas' });
    fireEvent.click(screen.getByRole('button', { name: '+ Nova oferta' }));

    expect(
      await screen.findByRole('heading', { name: 'Nova oferta' }),
    ).toBeInTheDocument();
  });

  it('"Detalhes" navigates to /offers/:id', async () => {
    vi.mocked(listOffers).mockResolvedValue([activeOffer]);
    vi.mocked(getOffer).mockReturnValue(new Promise(() => {}));
    renderRouted();

    fireEvent.click(await screen.findByRole('button', { name: 'Detalhes' }));

    expect(
      await screen.findByRole('heading', { name: 'Detalhes da oferta' }),
    ).toBeInTheDocument();
  });

  it('renders an expired offer distinctly with EXPIRED status, exactly as returned by the API', async () => {
    vi.mocked(listOffers).mockResolvedValue([expiredOffer]);
    renderRouted();

    expect(await screen.findByText('Pacote Verao Antigo')).toBeInTheDocument();
    expect(screen.getByText('Expirada')).toBeInTheDocument();
  });

  it('renders active and expired offers with visually distinguishable status text', async () => {
    vi.mocked(listOffers).mockResolvedValue([activeOffer, expiredOffer]);
    renderRouted();

    expect(await screen.findByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('Expirada')).toBeInTheDocument();
  });

  it('viewing/listing an expired offer triggers no write call — only the GET/list fetch fires', async () => {
    const { createOffer, updateOffer } = await import('../lib/api');
    vi.mocked(listOffers).mockResolvedValue([expiredOffer]);
    renderRouted();

    await screen.findByText('Pacote Verao Antigo');

    expect(listOffers).toHaveBeenCalledTimes(1);
    expect(createOffer).not.toHaveBeenCalled();
    expect(updateOffer).not.toHaveBeenCalled();
  });
});
