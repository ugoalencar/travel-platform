import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PublicationsPage } from './PublicationsPage';
import * as api from '../../lib/offerGrowthApi';
import { ApiError } from '../../lib/api';
import type { Publication } from '../../types/offerGrowth';

vi.mock('../../lib/offerGrowthApi');

const publication: Publication = {
  id: 'pub-1',
  agencyId: 'agency-a',
  campaignId: 'campaign-1',
  offerId: 'offer-1',
  channel: 'INTERNAL_TEST_INSTAGRAM',
  status: 'PUBLISHED',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function renderPage() {
  render(
    <MemoryRouter>
      <PublicationsPage />
    </MemoryRouter>,
  );
}

describe('PublicationsPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listPublications).mockResolvedValue([publication]);
    vi.mocked(api.listCampaigns).mockResolvedValue([]);
    vi.mocked(api.listOffers).mockResolvedValue([]);
  });

  it('shows an explicit TESTE/DEMO badge for a publication using the internal test connector', async () => {
    renderPage();
    await screen.findByText('INTERNAL_TEST_INSTAGRAM');
    expect(screen.getByText(/Teste \/ Demo/i)).toBeInTheDocument();
    expect(screen.getByText('Publicada')).toBeInTheDocument();
  });

  it('shows the friendly entitlement-disabled message, not a generic error', async () => {
    vi.mocked(api.listPublications).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    renderPage();

    expect(await screen.findByRole('status')).toHaveTextContent(/não habilitado/i);
  });
});
