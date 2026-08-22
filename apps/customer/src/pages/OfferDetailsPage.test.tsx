import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OfferDetailsPage } from './OfferDetailsPage';
import { getOffer, createOffer, updateOffer, ApiError } from '../lib/api';
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

function renderRouted(initialEntries: string[] = ['/offers/o1']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
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
};

describe('OfferDetailsPage', () => {
  it('renders with a loading state first', () => {
    vi.mocked(getOffer).mockReturnValue(new Promise(() => {}));
    renderRouted();

    expect(screen.getByText('Carregando oferta...')).toBeInTheDocument();
  });

  it('renders real offer data with fields', async () => {
    vi.mocked(getOffer).mockResolvedValue(activeOffer);
    renderRouted();

    expect(await screen.findByText('Pacote Paris')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('Pacote romantico')).toBeInTheDocument();
  });

  it('renders an expired offer with the EXPIRED status exactly as returned, read-only', async () => {
    vi.mocked(getOffer).mockResolvedValue(expiredOffer);
    renderRouted();

    expect(await screen.findByText('Pacote Verao Antigo')).toBeInTheDocument();
    expect(screen.getByText('EXPIRED')).toBeInTheDocument();
    // status is displayed as plain text, never as an interactive control
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
  });

  it('404 shows a safe not-found message', async () => {
    vi.mocked(getOffer).mockRejectedValue(new ApiError('Offer not found', 'NOT_FOUND', 404));
    renderRouted();

    expect(await screen.findByText('Oferta não encontrada.')).toBeInTheDocument();
  });

  it('safe error state for unknown errors', async () => {
    vi.mocked(getOffer).mockRejectedValue(
      new ApiError('Internal server error', 'INTERNAL_ERROR', 500),
    );
    renderRouted();

    expect(
      await screen.findByText('Não foi possível carregar a oferta. Tente novamente.'),
    ).toBeInTheDocument();
  });

  it('viewing an expired offer triggers no write call — only the GET fetch fires', async () => {
    vi.mocked(getOffer).mockResolvedValue(expiredOffer);
    renderRouted();

    await screen.findByText('Pacote Verao Antigo');

    expect(getOffer).toHaveBeenCalledTimes(1);
    expect(createOffer).not.toHaveBeenCalled();
    expect(updateOffer).not.toHaveBeenCalled();
  });

  it('renders "Editar" and "Voltar" actions', async () => {
    vi.mocked(getOffer).mockResolvedValue(activeOffer);
    renderRouted();

    await screen.findByText('Pacote Paris');
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
  });
});
