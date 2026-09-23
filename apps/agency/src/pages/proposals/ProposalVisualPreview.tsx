import { useEffect, useState } from 'react';
import { formatBRL } from '../../lib/formatCurrency';
import { formatDateBR } from '../../lib/formatDateBR';
import { loadMediaAssetBlobUrl, type EntityMediaItem, type Proposal, type ProposalItem, type ProposalSection } from '../../lib/api';

// Shared rendering used by both the Agency's real preview
// (ProposalPreviewPage) and the editor's embedded "Prévia" tab -- so the
// agency always sees *exactly* what the Customer App will render, not an
// approximation. See docs/product/PROPOSAL_CUSTOMER_EXPERIENCE.md.

const SECTION_TITLES: Record<string, string> = {
  OVERVIEW: 'Resumo',
  DESTINATIONS: 'Destinos',
  TRANSPORT: 'Transporte',
  ACCOMMODATION: 'Hospedagem',
  EXPERIENCES: 'Experiências',
  ITINERARY: 'Itinerário',
  INCLUSIONS: 'O que está incluído',
  EXCLUSIONS: 'O que não está incluído',
  COMMERCIAL_TERMS: 'Condições comerciais',
  PAYMENT_OPTIONS: 'Formas de pagamento',
  MEDIA: 'Galeria',
  DOCUMENTS: 'Documentos',
  NOTES: 'Observações',
};

export interface ProposalContentData {
  proposal: Proposal;
  sections: ProposalSection[];
  itemsBySection: Record<string, ProposalItem[]>;
  media: EntityMediaItem[];
}

export function ProposalVisualPreview({ data }: { data: ProposalContentData }) {
  const { proposal, sections, itemsBySection, media } = data;
  const cover = media.find((m) => m.usage === 'COVER') ?? media[0];
  const visibleSections = sections
    .filter((s) => s.isVisibleToCustomer)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <ProposalCover proposal={proposal} coverMedia={cover} />

      <div className="space-y-8 p-6 sm:p-8">
        {(proposal.destinationSummary || proposal.travelPeriod || proposal.travelerSummary) && (
          <div className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
            {proposal.destinationSummary && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Destino</p>
                <p className="mt-1 font-medium text-slate-900">{proposal.destinationSummary}</p>
              </div>
            )}
            {proposal.travelPeriod && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Período</p>
                <p className="mt-1 font-medium text-slate-900">{proposal.travelPeriod}</p>
              </div>
            )}
            {proposal.travelerSummary && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Viajantes</p>
                <p className="mt-1 font-medium text-slate-900">{proposal.travelerSummary}</p>
              </div>
            )}
          </div>
        )}

        {proposal.introText && <p className="leading-relaxed text-slate-700">{proposal.introText}</p>}

        {visibleSections.map((section) => (
          <ProposalSectionBlock key={section.id} section={section} items={itemsBySection[section.id] ?? []} />
        ))}

        <div className="rounded-xl border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Valor total</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{formatBRL(proposal.total)}</p>
          {proposal.discount > 0 && (
            <p className="mt-1 text-sm text-green-700">Desconto de {formatBRL(proposal.discount)} já aplicado</p>
          )}
          {proposal.validUntil && (
            <p className="mt-2 text-xs text-slate-500">Válida até {formatDateBR(proposal.validUntil)}</p>
          )}
          {proposal.conditions && <p className="mt-3 text-sm text-slate-700">{proposal.conditions}</p>}
        </div>

        <div className="flex justify-center pt-2">
          <button
            type="button"
            disabled
            className="rounded-full bg-[#2563eb] px-8 py-3 text-sm font-bold text-white opacity-90"
          >
            Falar com meu agente
          </button>
        </div>
      </div>
    </div>
  );
}

function ProposalCover({ proposal, coverMedia }: { proposal: Proposal; coverMedia?: EntityMediaItem | undefined }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!coverMedia) return;
    let cancelled = false;
    loadMediaAssetBlobUrl(coverMedia.mediaAssetId)
      .then((url: string) => {
        if (!cancelled) setBlobUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [coverMedia]);

  return (
    <div className="relative flex h-56 items-end bg-gradient-to-br from-slate-800 via-slate-700 to-blue-900 sm:h-72">
      {blobUrl && (
        <img src={blobUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      <div className="relative z-10 p-6 text-white sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{proposal.title || 'Sua proposta de viagem'}</h1>
        {proposal.subtitle && <p className="mt-1 text-sm text-slate-200 sm:text-base">{proposal.subtitle}</p>}
      </div>
    </div>
  );
}

function ProposalSectionBlock({ section, items }: { section: ProposalSection; items: ProposalItem[] }) {
  const sortedItems = items.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const isItinerary = section.type === 'ITINERARY';

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900">{section.title || SECTION_TITLES[section.type] || section.type}</h2>
      {section.description && <p className="mt-1 text-sm text-slate-600">{section.description}</p>}
      {sortedItems.length > 0 && (
        <ul className={isItinerary ? 'mt-4 space-y-4 border-l-2 border-blue-100 pl-4' : 'mt-3 space-y-2'}>
          {sortedItems.map((item) => (
            <li key={item.id} className={isItinerary ? 'relative' : 'rounded-lg bg-slate-50 p-3'}>
              {isItinerary && item.dayNumber && (
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Dia {item.dayNumber}</p>
              )}
              {item.title && <p className="text-sm font-semibold text-slate-900">{item.title}</p>}
              {item.description && <p className="text-sm text-slate-600">{item.description}</p>}
              {item.locationName && <p className="text-xs text-slate-500">{item.locationName}</p>}
              {item.price !== undefined && (
                <p className="text-xs font-medium text-slate-700">{formatBRL(item.price)}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
