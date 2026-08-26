import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import { createCampaign, listCampaigns, listOffers, transitionCampaignStatus } from '../../lib/offerGrowthApi';
import type { Campaign, CampaignStatus } from '../../types/offerGrowth';
import type { Offer } from '../../types/offer';
import { CAMPAIGN_STATUS_LABELS, labelFor } from '../../lib/offerGrowthLabels';
import { EntitlementNotice } from '../../components/offer-growth/EntitlementNotice';
import { Button } from '../../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'entitlement-disabled' }
  | { status: 'error'; message: string }
  | { status: 'ready'; campaigns: Campaign[]; offers: Offer[] };

const NEXT_STATUS: Partial<Record<CampaignStatus, CampaignStatus>> = {
  DRAFT: 'SCHEDULED',
  SCHEDULED: 'ACTIVE',
  ACTIVE: 'PAUSED',
  PAUSED: 'ACTIVE',
};

export function CampaignsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [offerId, setOfferId] = useState('');
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function load() {
    setState({ status: 'loading' });
    Promise.all([listCampaigns(), listOffers().catch(() => [])])
      .then(([campaigns, offers]) => setState({ status: 'ready', campaigns, offers }))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 403) {
          setState({ status: 'entitlement-disabled' });
          return;
        }
        setState({ status: 'error', message: 'Não foi possível carregar as campanhas.' });
      });
  }

  useEffect(load, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!name.trim()) {
      setFormError('Nome é obrigatório.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createCampaign({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        timezone,
        ...(offerId ? { offerIds: [offerId] } : {}),
      });
      setName('');
      setDescription('');
      setOfferId('');
      setShowForm(false);
      load();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Não foi possível criar a campanha.');
    } finally {
      setSubmitting(false);
    }
  }

  async function advanceStatus(campaign: Campaign) {
    const next = NEXT_STATUS[campaign.status];
    if (!next) return;
    await transitionCampaignStatus(campaign.id, next);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Offer & Growth</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Campanhas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Uma campanha coordena um período e um conjunto de ofertas — as publicações em cada canal
            ficam dentro dela.
          </p>
        </div>
        {state.status === 'ready' && (
          <Button onClick={() => setShowForm((value) => !value)}>
            {showForm ? 'Fechar' : 'Nova campanha'}
          </Button>
        )}
      </div>

      {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando campanhas...</p>}
      {state.status === 'entitlement-disabled' && <EntitlementNotice feature="CAMPAIGNS" />}
      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'ready' && showForm && (
        <form
          onSubmit={(event) => void handleCreate(event)}
          noValidate
          className="flex max-w-lg flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4"
        >
          {formError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="campaign-name" className="text-sm font-medium text-slate-700">
              Nome
            </label>
            <input
              id="campaign-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="campaign-description" className="text-sm font-medium text-slate-700">
              Descrição
            </label>
            <textarea
              id="campaign-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              rows={2}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="campaign-offer" className="text-sm font-medium text-slate-700">
              Oferta vinculada
            </label>
            <select
              id="campaign-offer"
              value={offerId}
              onChange={(event) => setOfferId(event.target.value)}
              className="h-9 rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="">Nenhuma</option>
              {state.offers.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  {offer.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="campaign-timezone" className="text-sm font-medium text-slate-700">
              Fuso horário
            </label>
            <input
              id="campaign-timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Criar campanha'}
          </Button>
        </form>
      )}

      {state.status === 'ready' && (
        <div className="flex flex-col gap-3">
          {state.campaigns.length === 0 && (
            <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
              Nenhuma campanha criada ainda.
            </div>
          )}
          {state.campaigns.map((campaign) => (
            <article key={campaign.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{campaign.name}</h2>
                  <p className="text-xs text-slate-500">{campaign.timezone}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={campaign.status} />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setExpandedId((id) => (id === campaign.id ? null : campaign.id))}
                  >
                    {expandedId === campaign.id ? 'Ocultar' : 'Detalhes'}
                  </Button>
                  {NEXT_STATUS[campaign.status] && (
                    <Button size="sm" onClick={() => void advanceStatus(campaign)}>
                      Avançar para {labelFor(CAMPAIGN_STATUS_LABELS, NEXT_STATUS[campaign.status]!)}
                    </Button>
                  )}
                </div>
              </div>
              {expandedId === campaign.id && (
                <dl className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2">
                  {campaign.description && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-medium uppercase text-slate-500">Descrição</dt>
                      <dd className="text-slate-700">{campaign.description}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs font-medium uppercase text-slate-500">Início</dt>
                    <dd className="text-slate-700">{formatDate(campaign.startsAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase text-slate-500">Fim</dt>
                    <dd className="text-slate-700">{formatDate(campaign.endsAt)}</dd>
                  </div>
                </dl>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
      {labelFor(CAMPAIGN_STATUS_LABELS, status)}
    </span>
  );
}

function formatDate(value?: string): string {
  return value ? new Date(value).toLocaleDateString('pt-BR') : '—';
}
