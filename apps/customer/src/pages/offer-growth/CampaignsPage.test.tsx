import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CampaignsPage } from './CampaignsPage';
import * as api from '../../lib/offerGrowthApi';
import { ApiError } from '../../lib/api';
import type { Campaign } from '../../types/offerGrowth';

vi.mock('../../lib/offerGrowthApi');

const campaign: Campaign = {
  id: 'campaign-1',
  agencyId: 'agency-a',
  name: 'Campanha Verão',
  timezone: 'America/Sao_Paulo',
  status: 'DRAFT',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function renderPage() {
  render(
    <MemoryRouter>
      <CampaignsPage />
    </MemoryRouter>,
  );
}

describe('CampaignsPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listCampaigns).mockResolvedValue([campaign]);
    vi.mocked(api.listOffers).mockResolvedValue([]);
    vi.mocked(api.createCampaign).mockResolvedValue({
      ...campaign,
      id: 'campaign-2',
      name: 'Nova campanha',
    });
  });

  it('lists real campaigns with business-language status', async () => {
    renderPage();
    expect(await screen.findByText('Campanha Verão')).toBeInTheDocument();
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
  });

  it('creates a campaign through the real form and reloads the list', async () => {
    renderPage();
    await screen.findByText('Campanha Verão');

    fireEvent.click(screen.getByRole('button', { name: 'Nova campanha' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Campanha Inverno' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar campanha' }));

    await vi.waitFor(() =>
      expect(api.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Campanha Inverno' }),
      ),
    );
  });

  it('shows the friendly entitlement-disabled message, not a generic error', async () => {
    vi.mocked(api.listCampaigns).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    renderPage();

    expect(await screen.findByRole('status')).toHaveTextContent(/não habilitado/i);
  });
});
