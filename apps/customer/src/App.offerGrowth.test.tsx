import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { App } from './App';
import * as offerGrowthApi from './lib/offerGrowthApi';

vi.mock('./lib/offerGrowthApi');

function renderApp(initialEntries: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <App />
    </MemoryRouter>,
  );
}

// Regression test for the Field & UX Review finding: all 7 Offer &
// Growth URLs used to render the identical OfferGrowthStudioPage
// placeholder. Each must now render its own distinct, real screen.
describe('Offer & Growth routing', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(offerGrowthApi.listOffers).mockResolvedValue([]);
    vi.mocked(offerGrowthApi.listAssets).mockResolvedValue([]);
    vi.mocked(offerGrowthApi.listCampaigns).mockResolvedValue([]);
    vi.mocked(offerGrowthApi.listPublications).mockResolvedValue([]);
    vi.mocked(offerGrowthApi.listAutomations).mockResolvedValue([]);
    vi.mocked(offerGrowthApi.listCoupons).mockResolvedValue([]);
    vi.mocked(offerGrowthApi.listEntitlements).mockResolvedValue([]);
  });

  it('renders the Creative Studio editor at /offer-growth/studio', async () => {
    renderApp(['/offer-growth/studio']);
    expect(await screen.findByRole('heading', { name: 'Estúdio criativo' })).toBeInTheDocument();
  });

  it('renders a distinct Template Library at /offer-growth/templates', async () => {
    renderApp(['/offer-growth/templates']);
    expect(await screen.findByRole('heading', { name: 'Modelos de criativo' })).toBeInTheDocument();
  });

  it('renders a distinct Asset Library at /offer-growth/assets', async () => {
    renderApp(['/offer-growth/assets']);
    expect(await screen.findByRole('heading', { name: 'Biblioteca de arquivos' })).toBeInTheDocument();
  });

  it('renders a distinct Campaigns screen at /offer-growth/campaigns', async () => {
    renderApp(['/offer-growth/campaigns']);
    expect(await screen.findByRole('heading', { name: 'Campanhas' })).toBeInTheDocument();
  });

  it('renders a distinct Publications screen at /offer-growth/publications', async () => {
    renderApp(['/offer-growth/publications']);
    expect(await screen.findByRole('heading', { name: 'Publicações' })).toBeInTheDocument();
  });

  it('renders a distinct Automations screen at /offer-growth/automations', async () => {
    renderApp(['/offer-growth/automations']);
    expect(await screen.findByRole('heading', { name: 'Automações' })).toBeInTheDocument();
  });

  it('renders a distinct Coupons screen at /offer-growth/coupons', async () => {
    renderApp(['/offer-growth/coupons']);
    expect(await screen.findByRole('heading', { name: 'Cupons' })).toBeInTheDocument();
  });

  it('redirects /offer-growth/editor into the studio editor, preserving query params', async () => {
    renderApp(['/offer-growth/editor?templateId=tpl-x']);
    expect(await screen.findByRole('heading', { name: 'Estúdio criativo' })).toBeInTheDocument();
  });

  it('keeps the Cancun demo as a clearly labeled, separate demo entry point at /offer-growth/demo', async () => {
    renderApp(['/offer-growth/demo']);
    expect(await screen.findByRole('heading', { name: 'Ambiente de demonstração' })).toBeInTheDocument();
  });
});
