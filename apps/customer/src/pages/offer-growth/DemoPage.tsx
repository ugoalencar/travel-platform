import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import {
  activateAutomation,
  createAutomation,
  createCampaign,
  createCoupon,
  createPublication,
  generatePublicationSnapshot,
  listCoupons,
  listEntitlements,
  listOffers,
  publishPublication,
  simulateInternalComment,
} from '../../lib/offerGrowthApi';
import type { Offer } from '../../types/offer';
import type { AgencyEntitlement, Automation, Campaign, Coupon, Publication } from '../../types/offerGrowth';
import { Button } from '../../components/ui/button';
import { EntitlementNotice, TestChannelBadge } from '../../components/offer-growth/EntitlementNotice';

const CHANNEL = 'INTERNAL_TEST_INSTAGRAM';

interface DemoResult {
  offer: Offer;
  campaign: Campaign;
  publication: Publication;
  coupon: Coupon;
  automation: Automation;
  opportunityId?: string;
  dedupedReplay: boolean;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; offers: Offer[]; entitlements: AgencyEntitlement[] };

// This screen is intentionally NOT the primary way to operate
// Campaigns/Publications/Automations/Coupons -- it is a clearly labeled
// QA/demo-only environment that exercises the full Pescador -> Offer ->
// Creative -> Campaign -> Publication -> Automation -> Engagement ->
// Opportunity chain in one click against the internal test connector.
// Real operators should use the dedicated screens under /offer-growth/*.
export function OfferGrowthDemoPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<DemoResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listOffers(),
      listEntitlements().catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 403) return [];
        throw error;
      }),
    ])
      .then(([offers, entitlements]) => {
        if (cancelled) return;
        setSelectedOfferId(offers[0]?.id ?? '');
        setState({ status: 'ready', offers, entitlements });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', message: 'Não foi possível carregar o ambiente de demonstração.' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const socialAutomationEnabled =
    state.status === 'ready' &&
    state.entitlements.some((item) => item.feature === 'SOCIAL_AUTOMATION' && item.enabled);

  async function runCancunDemo() {
    if (state.status !== 'ready') return;
    const selectedOffer = state.offers.find((offer) => offer.id === selectedOfferId) ?? state.offers[0];
    if (!selectedOffer || !socialAutomationEnabled) return;

    setBusy(true);
    setMessage(null);

    try {
      const campaign = await createCampaign({
        name: 'CANCUN SETEMBRO (DEMO)',
        description: 'Campanha demo para validar Offer & Growth E2E.',
        startsAt: '2026-09-01T00:00:00.000Z',
        endsAt: '2026-09-30T23:59:59.000Z',
        publicationStartsAt: '2026-09-01T00:00:00.000Z',
        publicationEndsAt: '2026-09-30T23:59:59.000Z',
        timezone: 'America/Sao_Paulo',
        offerIds: [selectedOffer.id],
      });
      const coupon = await createCoupon({
        code: 'CANCUN300',
        name: 'Desconto Cancun (demo)',
        type: 'FIXED_AMOUNT',
        value: 300,
        maxUses: 1,
        campaignId: campaign.id,
        offerId: selectedOffer.id,
      }).catch(async (error: unknown) => {
        if (error instanceof ApiError && error.status === 409) {
          const existing = (await listCoupons()).find((item) => item.code === 'CANCUN300');
          if (existing) return existing;
        }
        throw error;
      });
      const publication = await createPublication({
        campaignId: campaign.id,
        offerId: selectedOffer.id,
        channel: CHANNEL,
        creativeTemplateId: 'tpl-cancun-carousel',
      });
      const snapshotted = await generatePublicationSnapshot(publication.id, {
        channelLabel: 'Canal de teste/demo interno',
        offer: { id: selectedOffer.id, title: selectedOffer.name, price: selectedOffer.price },
      });
      const published = await publishPublication(snapshotted.id);
      const automation = await createAutomation({
        name: 'COMMENT CANCUN (demo)',
        trigger: 'COMMENT_KEYWORD',
        channel: CHANNEL,
        campaignId: campaign.id,
        publicationId: published.id,
        keyword: 'CANCUN',
        cooldownSeconds: 0,
        actions: [
          { type: 'PUBLIC_REPLY', message: 'Enviamos os detalhes no privado.' },
          { type: 'PRIVATE_MESSAGE', message: 'Use o cupom CANCUN300 para falar com um consultor.' },
          { type: 'SEND_COUPON', couponId: coupon.id, deliveryChannel: CHANNEL },
          { type: 'CREATE_OPPORTUNITY' },
        ],
      });
      const activeAutomation = await activateAutomation(automation.id);
      const event = {
        channel: CHANNEL,
        externalEventId: 'evt-cancun-demo-1',
        externalUserId: 'ig-cancun-demo-user',
        content: 'CANCUN',
        campaignId: campaign.id,
        publicationId: published.id,
        offerId: selectedOffer.id,
      };
      const simulation = await simulateInternalComment(event);
      const duplicateSimulation = await simulateInternalComment(event);

      const opportunityId = simulation.executions[0]?.createdOpportunityId;
      setResult({
        offer: selectedOffer,
        campaign,
        publication: published,
        coupon,
        automation: activeAutomation,
        ...(opportunityId ? { opportunityId } : {}),
        dedupedReplay: duplicateSimulation.executions[0]?.deduped ?? false,
      });
      setMessage('Demo Cancun executada com sucesso, sem duplicar dados no CRM.');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Não foi possível executar a demo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-md border border-fuchsia-300 bg-fuchsia-50 p-4">
        <div className="flex items-center gap-2">
          <TestChannelBadge />
          <h1 className="text-lg font-semibold text-fuchsia-900">Ambiente de demonstração</h1>
        </div>
        <p className="mt-2 text-sm text-fuchsia-800">
          Esta página existe apenas para QA/demonstração do fluxo completo Pescador → Oferta →
          Criativo → Campanha → Publicação → Automação → Engajamento → Oportunidade, usando o
          conector interno de teste. Para operar o dia a dia, use as telas em Campanhas,
          Publicações, Automações e Cupons.
        </p>
      </div>

      {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'ready' && !socialAutomationEnabled && <EntitlementNotice feature="SOCIAL_AUTOMATION" />}

      {state.status === 'ready' && (
        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Oferta
            <select
              className="h-9 rounded-md border border-slate-300 px-3 text-sm"
              value={selectedOfferId}
              onChange={(event) => setSelectedOfferId(event.target.value)}
            >
              {state.offers.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  {offer.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={() => void runCancunDemo()}
            disabled={!socialAutomationEnabled || busy || state.offers.length === 0}
          >
            {busy ? 'Preparando...' : 'Executar demo Cancun'}
          </Button>
        </div>
      )}

      {message && (
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
          {message}
          {result?.dedupedReplay && <span> Reenvio duplicado foi deduplicado corretamente.</span>}
          {result?.opportunityId && <span> Oportunidade {result.opportunityId}.</span>}
        </div>
      )}

      {result?.opportunityId && (
        <Link className="text-sm text-slate-700 underline" to={`/commercial/pipeline?opportunityId=${result.opportunityId}`}>
          Ver oportunidade no CRM
        </Link>
      )}
    </div>
  );
}
