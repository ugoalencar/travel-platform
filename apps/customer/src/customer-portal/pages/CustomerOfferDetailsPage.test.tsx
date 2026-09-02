import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerOfferDetailsPage } from './CustomerOfferDetailsPage';
import type { Offer } from '../../types/offer';

vi.mock('../../lib/customerApi', () => {
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
    getAvailableOffer: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const offer: Offer = {
  id: 'o1',
  agencyId: 'a1',
  name: 'Pacote Cancún',
  description: 'Sete noites com café da manhã',
  price: 4500,
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2026-12-31T00:00:00.000Z',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('CustomerOfferDetailsPage', () => {
  it('renders name, description, price and validity period with a back link', async () => {
    const { getAvailableOffer } = await import('../../lib/customerApi');
    vi.mocked(getAvailableOffer).mockResolvedValue(offer);

    render(
      <MemoryRouter initialEntries={['/customer-portal/offers/o1']}>
        <Routes>
          <Route path="/customer-portal/offers/:id" element={<CustomerOfferDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Pacote Cancún')).toBeInTheDocument();
    });
    expect(screen.getByText('Sete noites com café da manhã')).toBeInTheDocument();
    expect(screen.getByText(/Válida a partir de:/)).toBeInTheDocument();
    expect(screen.getByText(/Válida até:/)).toBeInTheDocument();
    expect(screen.getByText('Voltar para ofertas')).toBeInTheDocument();
  });
});
