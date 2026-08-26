import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfferGrowthStudioPage } from './OfferGrowthStudioPage';
import * as api from '../lib/offerGrowthApi';
import type { Offer } from '../types/offer';

vi.mock('../lib/offerGrowthApi');

const offer: Offer = {
  id: 'offer-1',
  agencyId: 'agency-a',
  name: 'Pacote Cancun',
  description: 'Hotel, transfer e passeios inclusos',
  price: 5290,
  validFrom: '2026-09-01T00:00:00.000Z',
  validUntil: '2026-09-30T00:00:00.000Z',
  status: 'ACTIVE',
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
};

function renderPage(path = '/offer-growth/studio') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/offer-growth/studio" element={<OfferGrowthStudioPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OfferGrowthStudioPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();

    vi.mocked(api.listOffers).mockResolvedValue([offer]);
    vi.mocked(api.listAssets).mockResolvedValue([
      {
        id: 'asset-hero',
        agencyId: 'agency-a',
        type: 'IMAGE',
        source: 'PESCADOR',
        storageUrl: 'https://cdn.example.com/cancun-hero.jpg',
        sourceCaptureId: 'capture-1',
        metaTags: ['hero', 'cancun'],
        metaVariants: [],
        createdAt: '2026-08-25T00:00:00.000Z',
        updatedAt: '2026-08-25T00:00:00.000Z',
      },
      {
        id: 'asset-logo',
        agencyId: 'agency-a',
        type: 'LOGO',
        source: 'UPLOAD',
        storageUrl: 'https://cdn.example.com/logo.png',
        metaTags: ['brand'],
        metaVariants: [],
        createdAt: '2026-08-25T00:00:00.000Z',
        updatedAt: '2026-08-25T00:00:00.000Z',
      },
    ]);
    vi.mocked(api.listCampaigns).mockResolvedValue([]);
    vi.mocked(api.listPublications).mockResolvedValue([]);
    vi.mocked(api.listAutomations).mockResolvedValue([]);
    vi.mocked(api.listCoupons).mockResolvedValue([]);
    vi.mocked(api.listEntitlements).mockResolvedValue([
      { feature: 'SOCIAL_AUTOMATION', enabled: true, limits: {} },
    ]);
    vi.mocked(api.createCampaign).mockResolvedValue({
      id: 'campaign-1',
      agencyId: 'agency-a',
      name: 'CANCUN SETEMBRO',
      timezone: 'America/Sao_Paulo',
      status: 'DRAFT',
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z',
    });
    vi.mocked(api.createPublication).mockResolvedValue({
      id: 'pub-1',
      agencyId: 'agency-a',
      campaignId: 'campaign-1',
      offerId: 'offer-1',
      channel: 'INTERNAL_TEST_INSTAGRAM',
      status: 'DRAFT',
      creativeTemplateId: 'tpl-cancun-carousel',
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z',
    });
    vi.mocked(api.generatePublicationSnapshot).mockResolvedValue({
      id: 'pub-1',
      agencyId: 'agency-a',
      campaignId: 'campaign-1',
      offerId: 'offer-1',
      channel: 'INTERNAL_TEST_INSTAGRAM',
      status: 'DRAFT',
      creativeTemplateId: 'tpl-cancun-carousel',
      snapshot: { slides: [] },
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z',
    });
    vi.mocked(api.publishPublication).mockResolvedValue({
      id: 'pub-1',
      agencyId: 'agency-a',
      campaignId: 'campaign-1',
      offerId: 'offer-1',
      channel: 'INTERNAL_TEST_INSTAGRAM',
      status: 'PUBLISHED',
      creativeTemplateId: 'tpl-cancun-carousel',
      snapshot: { slides: [] },
      externalPublicationId: 'mock-pub-1',
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z',
    });
    vi.mocked(api.createAutomation).mockResolvedValue({ id: 'auto-1', status: 'DRAFT' } as never);
    vi.mocked(api.activateAutomation).mockResolvedValue({ id: 'auto-1', status: 'ACTIVE' } as never);
    vi.mocked(api.createCoupon).mockResolvedValue({ id: 'coupon-1', code: 'CANCUN300' } as never);
    vi.mocked(api.simulateInternalComment).mockResolvedValueOnce({
      engagementId: 'eng-1',
      executions: [
        {
          automationId: 'auto-1',
          deduped: false,
          executionId: 'exec-1',
          createdCouponId: 'coupon-1',
          createdOpportunityId: 'opp-1',
        },
      ],
    });
    vi.mocked(api.simulateInternalComment).mockResolvedValueOnce({
      engagementId: 'eng-2',
      executions: [{ automationId: 'auto-1', deduped: true }],
    });
  });

  it('renders the Cancun carousel editor with binding and asset picker context', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: /Creative Studio/i })).toBeInTheDocument();
    expect(screen.getAllByText('Pacote Cancun').length).toBeGreaterThan(0);
    expect(screen.getByText('TEST / INTERNAL CHANNEL')).toBeInTheDocument();
    expect(screen.getByText('Hero + destination')).toBeInTheDocument();
    expect(screen.getByText('Hotel/details')).toBeInTheDocument();
    expect(screen.getByText('CTA/coupon keyword')).toBeInTheDocument();
    expect(screen.getByText(/asset-hero/)).toBeInTheDocument();
    expect(screen.getByText(/PESCADOR/)).toBeInTheDocument();
  });

  it('supports add duplicate remove reorder and preview for carousel slides', async () => {
    renderPage();

    await screen.findByText('Slide 1');
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar slide 1' }));
    expect(screen.getAllByText(/Hero \+ destination/)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Mover slide 2 para cima' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover slide 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar slide' }));
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar preview' }));

    expect(screen.getByText(/Preview atualizado/)).toBeInTheDocument();
  });

  it('runs the full Cancun demo flow against the Stream C client contract', async () => {
    renderPage();

    await screen.findByRole('heading', { name: /Creative Studio/i });
    fireEvent.click(screen.getByRole('button', { name: 'Preparar demo Cancun' }));

    await waitFor(() => expect(api.createCampaign).toHaveBeenCalledWith(expect.objectContaining({
      name: 'CANCUN SETEMBRO',
      offerIds: ['offer-1'],
    })));
    expect(api.createPublication).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 'campaign-1',
      offerId: 'offer-1',
      channel: 'INTERNAL_TEST_INSTAGRAM',
    }));
    expect(api.createAutomation).toHaveBeenCalledWith(expect.objectContaining({
      trigger: 'COMMENT_KEYWORD',
      keyword: 'CANCUN',
    }));
    expect(api.createCoupon).toHaveBeenCalledWith(expect.objectContaining({ code: 'CANCUN300' }));
    expect(api.simulateInternalComment).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Duplicate replay deduped/)).toBeInTheDocument();
    expect(screen.getByText(/Opportunity opp-1/)).toBeInTheDocument();
  });

  it('shows disabled automation UX when SOCIAL_AUTOMATION entitlement is off', async () => {
    vi.mocked(api.listEntitlements).mockResolvedValue([
      { feature: 'SOCIAL_AUTOMATION', enabled: false, limits: {} },
    ]);

    renderPage();

    expect(await screen.findByText(/recurso n.o habilitado/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preparar demo Cancun' })).toBeDisabled();
  });
});
