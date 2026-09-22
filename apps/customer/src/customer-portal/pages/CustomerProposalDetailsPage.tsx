import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ApiError,
  getMyAgencyContact,
  getMyProposal,
  loadProposalMediaBlobUrl,
  trackProposalViewed,
} from '../../lib/customerApi';
import type {
  CustomerAgencyContact,
  CustomerProposalDetail,
  CustomerProposalItemView,
  CustomerProposalSectionView,
} from '../../types/customer-portal';
import { proposalStatusLabel } from '../../lib/statusLabels';
import { BackLink } from '../BackLink';

// Mobile-first Proposal Viewer (Proposal Visual 2.0). Renders exactly the
// aggregated payload the backend already assembled in one call
// (getMyProposalDetailById) -- no per-section fetch, no N+1. See
// docs/product/PROPOSAL_CUSTOMER_EXPERIENCE.md.

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

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; proposal: CustomerProposalDetail };

export function CustomerProposalDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getMyProposal(id)
      .then((proposal) => {
        if (!cancelled) setState({ status: 'success', proposal });
        if (!cancelled) trackProposalViewed(id);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar esta proposta.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-4">
      <BackLink to="/customer-portal/proposals" label="Voltar para minhas propostas" />

      <div aria-live="polite">
        {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
        {state.status === 'error' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
      </div>

      {state.status === 'success' && <ProposalViewer proposal={state.proposal} />}
    </div>
  );
}

function ProposalViewer({ proposal }: { proposal: CustomerProposalDetail }) {
  const isExpired = proposal.status === 'EXPIRED' || proposal.status === 'CANCELLED';
  const cover = proposal.media.find((m) => m.isCover) ?? proposal.media[0];
  const visibleSections = proposal.sections.slice().sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="-mx-4 flex flex-col gap-8 sm:mx-0">
      <ProposalCover proposal={proposal} cover={cover} />

      <div className="flex flex-col gap-8 px-4 sm:px-0">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">💡 Informativo</p>
          <p className="mt-1">Esta proposta é apenas informativa. Fale com sua agência para negociar ou confirmar.</p>
        </div>

        {(proposal.destinationSummary || proposal.travelPeriod || proposal.travelerSummary) && (
          <div className="grid grid-cols-1 gap-3 rounded-xl border-2 border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
            {proposal.destinationSummary && <SummaryField label="Destino" value={proposal.destinationSummary} />}
            {proposal.travelPeriod && <SummaryField label="Período" value={proposal.travelPeriod} />}
            {proposal.travelerSummary && <SummaryField label="Viajantes" value={proposal.travelerSummary} />}
          </div>
        )}

        {proposal.introText && <p className="leading-relaxed text-slate-700">{proposal.introText}</p>}

        {visibleSections.map((section) => (
          <ProposalSection key={section.id} section={section} />
        ))}

        <div className={`rounded-xl border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 shadow-sm ${isExpired ? 'opacity-75' : ''}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Valor total</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">
                {proposal.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${isExpired ? 'bg-slate-100 text-slate-800' : 'bg-indigo-100 text-indigo-900'}`}>
              {proposalStatusLabel(proposal.status)}
            </span>
          </div>
          {proposal.discount > 0 && (
            <p className="mt-2 text-sm font-medium text-green-700">
              Desconto de {proposal.discount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} já aplicado
            </p>
          )}
          {proposal.validUntil && (
            <p className="mt-2 text-xs text-slate-500">
              Válida até {new Date(proposal.validUntil).toLocaleDateString('pt-BR', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          )}
          {proposal.conditions && <p className="mt-3 text-sm text-slate-700">{proposal.conditions}</p>}
        </div>

        <ProposalCta proposal={proposal} />
      </div>
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function ProposalCover({
  proposal,
  cover,
}: {
  proposal: CustomerProposalDetail;
  cover?: CustomerProposalDetail['media'][number] | undefined;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!cover) return;
    let cancelled = false;
    loadProposalMediaBlobUrl(cover.downloadUrl)
      .then((url) => {
        if (!cancelled) setBlobUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [cover]);

  return (
    <div className="relative flex h-56 items-end overflow-hidden bg-gradient-to-br from-slate-800 via-slate-700 to-blue-900 sm:h-72 sm:rounded-2xl">
      {blobUrl && <img src={blobUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      <div className="relative z-10 p-5 text-white sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{proposal.title || 'Sua proposta de viagem'}</h1>
        {proposal.subtitle && <p className="mt-1 text-sm text-slate-200 sm:text-base">{proposal.subtitle}</p>}
      </div>
    </div>
  );
}

function ProposalSection({ section }: { section: CustomerProposalSectionView }) {
  const items = section.items.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const isItinerary = section.type === 'ITINERARY';

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900">{section.title || SECTION_TITLES[section.type] || section.type}</h2>
      {section.description && <p className="mt-1 text-sm text-slate-600">{section.description}</p>}
      {items.length > 0 && (
        <ul className={isItinerary ? 'mt-4 space-y-4 border-l-2 border-blue-100 pl-4' : 'mt-3 space-y-2'}>
          {items.map((item) => (
            <ProposalItemRow key={item.id} item={item} sectionType={section.type} isItinerary={isItinerary} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProposalItemRow({
  item,
  sectionType,
  isItinerary,
}: {
  item: CustomerProposalItemView;
  sectionType: string;
  isItinerary: boolean;
}) {
  const icon = sectionType === 'INCLUSIONS' ? '✅' : sectionType === 'EXCLUSIONS' ? '❌' : null;

  return (
    <li className={isItinerary ? 'relative' : 'flex items-start gap-2 rounded-lg bg-slate-50 p-3'}>
      {isItinerary && item.dayNumber && (
        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Dia {item.dayNumber}</p>
      )}
      {icon && <span aria-hidden="true">{icon}</span>}
      <div className="min-w-0">
        {item.title && <p className="text-sm font-semibold text-slate-900">{item.title}</p>}
        {item.description && <p className="text-sm text-slate-600">{item.description}</p>}
        {item.locationName && <p className="text-xs text-slate-500">{item.locationName}</p>}
        {item.price !== null && (
          <p className="text-xs font-medium text-slate-700">
            {item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        )}
      </div>
    </li>
  );
}

// CTA: "Falar com meu agente" is the only action implemented this round --
// reuses the agency's already-fetched contact info (phone/email), no new
// backend. "Aceitar proposta" is intentionally NOT implemented here: it
// would need new authorization rules for a customer-triggered status
// transition (the existing accept flow is staff-only), documented as a
// future gap rather than built ad hoc.
function ProposalCta({ proposal }: { proposal: CustomerProposalDetail }) {
  const [agency, setAgency] = useState<CustomerAgencyContact | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyAgencyContact()
      .then((contact) => {
        if (!cancelled) setAgency(contact);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const isActionable = proposal.status === 'SENT';

  if (!isActionable || !agency) return null;

  const contactHref = agency.phone
    ? `https://wa.me/${agency.phone.replace(/\D/g, '')}`
    : agency.email
      ? `mailto:${agency.email}`
      : undefined;

  if (!contactHref) return null;

  return (
    <div className="flex justify-center pb-4">
      {/* No dedicated tracking event exists for this CTA in this round's
          taxonomy (it's a Proposal action, not a Communication) -- see
          gaps futuros in docs/product/PROPOSAL_CUSTOMER_EXPERIENCE.md. */}
      <a
        href={contactHref}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-[#2563eb] px-8 py-3 text-center text-sm font-bold text-white shadow-md hover:bg-[#1d4ed8] transition-colors"
      >
        💬 Falar com meu agente
      </a>
    </div>
  );
}
