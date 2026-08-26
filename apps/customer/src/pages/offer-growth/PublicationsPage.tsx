import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import {
  createPublication,
  listCampaigns,
  listOffers,
  listPublications,
} from '../../lib/offerGrowthApi';
import type { Campaign, Publication } from '../../types/offerGrowth';
import type { Offer } from '../../types/offer';
import { PUBLICATION_STATUS_LABELS, isTestChannel, labelFor } from '../../lib/offerGrowthLabels';
import { EntitlementNotice, TestChannelBadge } from '../../components/offer-growth/EntitlementNotice';
import { Button } from '../../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'entitlement-disabled' }
  | { status: 'error'; message: string }
  | { status: 'ready'; publications: Publication[]; campaigns: Campaign[]; offers: Offer[] };

export function PublicationsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState('');
  const [offerId, setOfferId] = useState('');
  const [channel, setChannel] = useState('INTERNAL_TEST_INSTAGRAM');
  const [scheduledAt, setScheduledAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function load() {
    setState({ status: 'loading' });
    Promise.all([listPublications(), listCampaigns().catch(() => []), listOffers().catch(() => [])])
      .then(([publications, campaigns, offers]) => setState({ status: 'ready', publications, campaigns, offers }))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 403) {
          setState({ status: 'entitlement-disabled' });
          return;
        }
        setState({ status: 'error', message: 'Não foi possível carregar as publicações.' });
      });
  }

  useEffect(load, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!campaignId || !offerId) {
      setFormError('Campanha e oferta são obrigatórias.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createPublication({
        campaignId,
        offerId,
        channel,
        ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
      });
      setShowForm(false);
      setCampaignId('');
      setOfferId('');
      setScheduledAt('');
      load();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Não foi possível criar a publicação.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Offer & Growth</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Publicações</h1>
          <p className="mt-1 text-sm text-slate-500">
            Uma publicação é uma instância específica de um canal dentro de uma campanha — data,
            criativo e status próprios.
          </p>
        </div>
        {state.status === 'ready' && (
          <Button onClick={() => setShowForm((value) => !value)}>
            {showForm ? 'Fechar' : 'Nova publicação'}
          </Button>
        )}
      </div>

      {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando publicações...</p>}
      {state.status === 'entitlement-disabled' && <EntitlementNotice feature="SOCIAL_PUBLISHING" />}
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
            <label htmlFor="publication-campaign" className="text-sm font-medium text-slate-700">
              Campanha
            </label>
            <select
              id="publication-campaign"
              value={campaignId}
              onChange={(event) => setCampaignId(event.target.value)}
              className="h-9 rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="">Selecione</option>
              {state.campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="publication-offer" className="text-sm font-medium text-slate-700">
              Oferta
            </label>
            <select
              id="publication-offer"
              value={offerId}
              onChange={(event) => setOfferId(event.target.value)}
              className="h-9 rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="">Selecione</option>
              {state.offers.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  {offer.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="publication-channel" className="text-sm font-medium text-slate-700">
              Canal
            </label>
            <select
              id="publication-channel"
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
              className="h-9 rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="INTERNAL_TEST_INSTAGRAM">Instagram (canal de teste/demo interno)</option>
            </select>
            {isTestChannel(channel) && (
              <p className="text-xs text-slate-500">
                Este canal é um conector interno de teste — nenhuma conexão real com Meta/Instagram é
                usada.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="publication-scheduled" className="text-sm font-medium text-slate-700">
              Agendar para
            </label>
            <input
              id="publication-scheduled"
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Criar publicação'}
          </Button>
        </form>
      )}

      {state.status === 'ready' && (
        <div className="flex flex-col gap-3">
          {state.publications.length === 0 && (
            <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
              Nenhuma publicação criada ainda.
            </div>
          )}
          {state.publications.map((publication) => (
            <article key={publication.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-900">{publication.channel}</h2>
                  {isTestChannel(publication.channel) && <TestChannelBadge />}
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {labelFor(PUBLICATION_STATUS_LABELS, publication.status)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setExpandedId((id) => (id === publication.id ? null : publication.id))
                    }
                  >
                    {expandedId === publication.id ? 'Ocultar' : 'Detalhes'}
                  </Button>
                </div>
              </div>
              {expandedId === publication.id && (
                <dl className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium uppercase text-slate-500">Criativo</dt>
                    <dd className="text-slate-700">{publication.creativeTemplateId ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase text-slate-500">Agendada para</dt>
                    <dd className="text-slate-700">
                      {publication.scheduledAt
                        ? new Date(publication.scheduledAt).toLocaleString('pt-BR')
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase text-slate-500">Publicada em</dt>
                    <dd className="text-slate-700">
                      {publication.publishedAt
                        ? new Date(publication.publishedAt).toLocaleString('pt-BR')
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase text-slate-500">Snapshot</dt>
                    <dd className="text-slate-700">
                      {publication.snapshot ? 'Gerado e congelado' : 'Ainda não gerado'}
                    </dd>
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
