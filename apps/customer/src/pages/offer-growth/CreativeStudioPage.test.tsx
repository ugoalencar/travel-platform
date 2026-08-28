import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CreativeStudioPage } from './CreativeStudioPage';
import * as api from '../../lib/offerGrowthApi';
import { ApiError } from '../../lib/api';
import type { Offer } from '../../types/offer';

vi.mock('../../lib/offerGrowthApi');

const realOffer: Offer = {
  id: 'offer-real-1',
  agencyId: 'agency-a',
  name: 'Pacote Fernando de Noronha',
  description: 'Voo, pousada e passeios de barco inclusos',
  price: 8900,
  status: 'ACTIVE',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function renderPage(path: string) {
  window.localStorage.clear();
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/offer-growth/studio" element={<CreativeStudioPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CreativeStudioPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(api.listOffers).mockResolvedValue([realOffer]);
    vi.mocked(api.listAssets).mockResolvedValue([]);
  });

  it('seeds the editor with the REAL offer data from the ?offerId= query param, not the Cancun demo defaults', async () => {
    renderPage(`/offer-growth/studio?offerId=${realOffer.id}`);

    expect(await screen.findByRole('heading', { name: /Creative Studio/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue(realOffer.id);
    expect(screen.getAllByText('Pacote Fernando de Noronha').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Pacote Cancun/)).not.toBeInTheDocument();
  });

  it('shows the friendly entitlement-disabled message instead of a generic error', async () => {
    vi.mocked(api.listOffers).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    renderPage('/offer-growth/studio');

    expect(await screen.findByRole('status')).toHaveTextContent(/não habilitado/i);
  });

  it('uses business labels for block kind and binding source, never raw enum strings', async () => {
    renderPage(`/offer-growth/studio?offerId=${realOffer.id}`);

    await screen.findByRole('heading', { name: /Creative Studio/i });
    expect(screen.getAllByText('Título').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Origem: Oferta/).length).toBeGreaterThan(0);
  });
});
