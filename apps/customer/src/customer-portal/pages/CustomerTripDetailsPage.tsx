import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ApiError,
  getMyAgencyContact,
  getMyTrip,
  listMyDocuments,
  listMyPaymentSchedule,
  listMyTripAirSegments,
  listMyTripLandServices,
  listMyTripPhotos,
  listMyTripRequirements,
  loadMyTripPhotoBlobUrl,
  trackTripViewed,
  type CustomerTripPhoto,
} from '../../lib/customerApi';
import type { Trip } from '../../types/trip';
import type {
  CustomerAgencyContact,
  CustomerAirSegmentView,
  CustomerDocumentView,
  CustomerLandServiceView,
  CustomerPaymentScheduleItem,
} from '../../types/customer-portal';
import type { CustomerTravelRequirementView } from '../../types/travelRequirement';
import { tripStatusLabel } from '../../lib/statusLabels';
import { BackLink } from '../BackLink';
import { Tabs } from '../Tabs';
import { Timeline, type TimelineStep } from '../Timeline';
import { destinationEmoji, destinationGradient } from '../destinationArt';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; trip: Trip };

export function CustomerTripDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getMyTrip(id)
      .then((trip) => {
        if (!cancelled) setState({ status: 'success', trip });
        if (!cancelled) trackTripViewed(id);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar esta viagem.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-6">
      <BackLink to="/customer-portal/trips" label="Voltar para minhas viagens" />

      <div aria-live="polite">
        {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
        {state.status === 'error' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
      </div>

      {state.status === 'success' && (
        <>
          <TripSummary trip={state.trip} />
          <TripPhotoCarousel tripId={state.trip.id} />
          <Tabs tabs={TRIP_TABS}>
            {(activeKey) => {
              if (activeKey === 'itinerary') {
                return (
                  <div className="flex flex-col gap-4">
                    <TripItinerary trip={state.trip} />
                    <TripAirLandSections tripId={state.trip.id} />
                  </div>
                );
              }
              if (activeKey === 'documents') {
                return <TripDocuments />;
              }
              if (activeKey === 'payments') {
                return <TripPayments />;
              }
              return (
                <div className="flex flex-col gap-4">
                  <TripNextSteps tripId={state.trip.id} />
                  <TripPassengers />
                  <TripAgencyContact />
                </div>
              );
            }}
          </Tabs>
        </>
      )}
    </div>
  );
}

const TRIP_TABS = [
  { key: 'overview', label: 'Visão geral' },
  { key: 'itinerary', label: 'Itinerário' },
  { key: 'documents', label: 'Documentos' },
  { key: 'payments', label: 'Pagamentos' },
] as const;

// --- Resumo -----------------------------------------------------------

function TripSummary({ trip }: { trip: Trip }) {
  const startDate = new Date(trip.startDate);
  const endDate = new Date(trip.endDate);
  const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const gradient = destinationGradient(trip.destination);
  const emoji = destinationEmoji(trip.destination);

  return (
    <div className={`overflow-hidden rounded-2xl border-2 border-blue-100 bg-gradient-to-br ${gradient} shadow-md`}>
      <div className="flex flex-col gap-4 bg-white/55 p-6 backdrop-blur-sm sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            {emoji} Resumo da viagem
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{trip.name}</h1>
          <p className="mt-1 text-xl text-slate-700">{trip.destination}</p>
        </div>
        <span className="inline-block shrink-0 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900">
          {friendlyTripStatus(trip.status)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 bg-white/70 p-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">📅 Datas</h3>
          <div className="space-y-3">
            <DetailItem
              label="Início"
              value={startDate.toLocaleDateString('pt-BR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            />
            <DetailItem
              label="Fim"
              value={endDate.toLocaleDateString('pt-BR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            />
            <DetailItem label="Duração" value={`${durationDays} dias`} />
          </div>
        </div>

        {trip.description && (
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">📝 Descrição</h3>
            <p className="text-slate-700 leading-relaxed">{trip.description}</p>
          </div>
        )}
      </div>
      {/* Trip.notes (internal agency notes) is intentionally never rendered
          here -- the backend already excludes it from the response (see
          services/api/src/customer-portal.ts toTrip), so it isn't even
          available on this object, but this component also never reads a
          `notes` field as defense in depth. */}
    </div>
  );
}

function friendlyTripStatus(status: Trip['status']): string {
  const friendly: Record<Trip['status'], string> = {
    PLANNED: 'Em planejamento',
    CONFIRMED: 'Viagem confirmada!',
    IN_PROGRESS: 'Em andamento',
    COMPLETED: 'Concluída',
    CANCELLED: 'Cancelada',
  };
  return friendly[status] ?? tripStatusLabel(status);
}

// --- Carrossel de fotos --------------------------------------------------
// "o cliente gosta de imagens... cada viagem que ele consultar ter um
// carrossel de fotos que veio da agência" -- photos are uploaded by
// agency staff (TripDetailPage's "Fotos" tab, staff app) and rendered
// here. Renders nothing at all when the trip has no photos yet, rather
// than an empty-state box, since not every trip will have photos.

function TripPhotoCarousel({ tripId }: { tripId: string }) {
  const [photos, setPhotos] = useState<CustomerTripPhoto[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listMyTripPhotos(tripId)
      .then((list) => {
        if (!cancelled) setPhotos(list);
      })
      .catch(() => {
        if (!cancelled) setPhotos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  useEffect(() => {
    if (!photos || photos.length === 0) return;
    let cancelled = false;
    const objectUrls: string[] = [];
    Promise.all(
      photos.map(async (p) => {
        const url = await loadMyTripPhotoBlobUrl(tripId, p.id);
        objectUrls.push(url);
        return [p.id, url] as const;
      }),
    )
      .then((pairs) => {
        if (!cancelled) setUrls(Object.fromEntries(pairs));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photos, tripId]);

  if (photos === null || photos.length === 0) {
    return null;
  }

  const current = photos[active];

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-blue-100 bg-white shadow-md">
      <div className="relative aspect-video bg-slate-100">
        {current && urls[current.id] ? (
          <img
            src={urls[current.id]}
            alt={current.caption ?? `Foto da viagem ${active + 1} de ${photos.length}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">Carregando fotos…</div>
        )}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setActive((i) => (i - 1 + photos.length) % photos.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-white hover:bg-black/70"
              aria-label="Foto anterior"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setActive((i) => (i + 1) % photos.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-white hover:bg-black/70"
              aria-label="Próxima foto"
            >
              ›
            </button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
              {photos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Ir para foto ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${i === active ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {current?.caption && (
        <p className="p-3 text-sm text-slate-600">{current.caption}</p>
      )}
    </div>
  );
}

// --- Itinerário ---------------------------------------------------------

function TripItinerary({ trip }: { trip: Trip }) {
  const steps = buildLifecycleSteps(trip.status);
  return (
    <div className="rounded-xl border-2 border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
        🗓️ Itinerário
      </h3>
      <Timeline steps={steps} />
      <p className="mt-2 text-xs text-slate-500">
        Veja os detalhes de voos e serviços terrestres logo abaixo.
      </p>
    </div>
  );
}

function buildLifecycleSteps(status: Trip['status']): TimelineStep[] {
  const order: Trip['status'][] = ['PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];
  const labels: Record<Trip['status'], string> = {
    PLANNED: 'Viagem planejada',
    CONFIRMED: 'Reserva confirmada',
    IN_PROGRESS: 'Viagem em andamento',
    COMPLETED: 'Viagem concluída',
    CANCELLED: 'Viagem cancelada',
  };

  if (status === 'CANCELLED') {
    return [{ key: 'CANCELLED', label: labels.CANCELLED, state: 'current' }];
  }

  const currentIndex = order.indexOf(status);
  return order.map((step, index) => ({
    key: step,
    label: labels[step],
    state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming',
  }));
}

// --- Aéreo / Terrestre --------------------------------------------------

function TripAirLandSections({ tripId }: { tripId: string }) {
  const [air, setAir] = useState<CustomerAirSegmentView[] | null>(null);
  const [land, setLand] = useState<CustomerLandServiceView[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listMyTripAirSegments(tripId), listMyTripLandServices(tripId)])
      .then(([airSegments, landServices]) => {
        if (!cancelled) {
          setAir(airSegments);
          setLand(landServices);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAir([]);
          setLand([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-xl border-2 border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
          ✈️ Aéreo
        </h3>
        {air === null && <p className="text-sm text-slate-500">Carregando...</p>}
        {air !== null && air.length === 0 && (
          <p className="text-sm text-slate-500">Nenhum voo registrado para esta viagem.</p>
        )}
        {air !== null && air.length > 0 && (
          <ul className="space-y-3">
            {air.map((segment) => (
              <li key={segment.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                <p className="font-semibold text-slate-900">
                  {segment.origin} → {segment.destination}
                </p>
                <p className="text-slate-600">
                  {segment.airline}
                  {segment.flightNumber ? ` · voo ${segment.flightNumber}` : ''}
                </p>
                <p className="text-slate-600">
                  {new Date(segment.departureDate).toLocaleDateString('pt-BR')}
                  {segment.departureTime ? ` às ${segment.departureTime}` : ''}
                </p>
                {segment.bookingLocator && (
                  <p className="text-xs text-slate-500">Localizador: {segment.bookingLocator}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border-2 border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
          🏨 Terrestre
        </h3>
        {land === null && <p className="text-sm text-slate-500">Carregando...</p>}
        {land !== null && land.length === 0 && (
          <p className="text-sm text-slate-500">Nenhum serviço terrestre registrado.</p>
        )}
        {land !== null && land.length > 0 && (
          <ul className="space-y-3">
            {land.map((service) => (
              <li key={service.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                <p className="font-semibold text-slate-900">{service.description}</p>
                <p className="text-slate-600">
                  {new Date(service.startDate).toLocaleDateString('pt-BR')} –{' '}
                  {new Date(service.endDate).toLocaleDateString('pt-BR')}
                </p>
                {service.confirmationNumber && (
                  <p className="text-xs text-slate-500">
                    Confirmação: {service.confirmationNumber}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- Próximos passos -----------------------------------------------------
// Real requirements checklist (travel_requirements), scoped to this trip.
// Renders nothing when the trip has no requirements registered yet,
// rather than a fabricated generic checklist.

const REQUIREMENT_LABELS: Record<CustomerTravelRequirementView['type'], string> = {
  PASSAPORTE_VALIDO: 'Passaporte válido',
  VISTO: 'Visto',
  VACINACAO: 'Vacinação',
  SEGURO: 'Seguro viagem',
  AUTORIZACAO: 'Autorização de viagem',
  OUTROS: 'Outro requisito',
};

function TripNextSteps({ tripId }: { tripId: string }) {
  const [requirements, setRequirements] = useState<CustomerTravelRequirementView[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMyTripRequirements(tripId)
      .then((list) => {
        if (!cancelled) setRequirements(list);
      })
      .catch(() => {
        if (!cancelled) setRequirements([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (requirements === null || requirements.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border-2 border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
        ✅ Próximos passos
      </h3>
      <ul className="flex flex-col gap-3">
        {requirements.map((req) => (
          <li key={req.id} className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                req.fulfilled ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}
              aria-hidden="true"
            >
              {req.fulfilled ? '✓' : '!'}
            </span>
            <div>
              <p className="text-sm font-medium text-slate-900">
                {REQUIREMENT_LABELS[req.type] ?? req.type}
              </p>
              <p className="text-xs text-slate-500">
                {req.fulfilled ? 'Concluído' : req.required ? 'Pendente' : 'Opcional, ainda pendente'}
                {req.expirationDate &&
                  ` · válido até ${new Date(req.expirationDate).toLocaleDateString('pt-BR')}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Documentos (tab) -----------------------------------------------------
// Reuses the same real customer-wide document list shown on the
// standalone Documentos page -- Document has no trip_id relation in the
// schema, so this intentionally does not fabricate trip-only filtering.

function TripDocuments() {
  const [documents, setDocuments] = useState<CustomerDocumentView[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMyDocuments()
      .then((list) => {
        if (!cancelled) setDocuments(list);
      })
      .catch(() => {
        if (!cancelled) setDocuments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (documents === null) {
    return <p className="text-sm text-slate-500">Carregando...</p>;
  }
  if (documents.length === 0) {
    return <p className="text-sm text-slate-500">Nenhum documento cadastrado ainda.</p>;
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {documents.map((doc) => (
        <li key={doc.id} className="rounded-lg border border-slate-200 p-3 text-sm">
          <p className="font-semibold text-slate-900">{doc.documentType}</p>
          <p className="text-slate-600">Número: {doc.documentNumber}</p>
        </li>
      ))}
    </ul>
  );
}

// --- Pagamentos (tab) ------------------------------------------------------
// Reuses the same real customer-wide payment schedule shown on the
// standalone Pagamentos page -- receivables have no trip_id relation
// either, so this shows the customer's full real schedule, not a
// fabricated trip-only subset.

function TripPayments() {
  const [items, setItems] = useState<CustomerPaymentScheduleItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMyPaymentSchedule()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (items === null) {
    return <p className="text-sm text-slate-500">Carregando...</p>;
  }
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">Nenhuma parcela cadastrada.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm"
        >
          <div>
            <p className="font-semibold text-slate-900">{item.description}</p>
            <p className="text-slate-600">
              Vence em {new Date(item.dueAt).toLocaleDateString('pt-BR')}
            </p>
          </div>
          <p className="font-bold text-slate-900">
            {item.amountRemaining.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </li>
      ))}
    </ul>
  );
}

// --- Passageiros ----------------------------------------------------------

function TripPassengers() {
  // NOTE: the backend has no trip -> booking/passenger linkage today
  // (bookings reference booker_customer_id + departure ids, not trip_id --
  // see services/api/src/customer-portal.ts). Rather than guessing a match
  // by date/destination (fragile and could show the wrong travelers),
  // this section is honest about the gap and points to Reservas, where
  // passenger data does exist per booking. Wiring a real trip-scoped
  // passenger list is a backend/data-model change for a future wave.
  return (
    <div className="rounded-xl border-2 border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
        👥 Passageiros
      </h3>
      <p className="text-sm text-slate-600">
        Os passageiros ficam registrados em cada reserva. Confira em{' '}
        <a href="/customer-portal/bookings" className="text-[#2563eb] hover:underline">
          Minhas Reservas
        </a>
        .
      </p>
    </div>
  );
}

// --- Contato da agência -----------------------------------------------

function TripAgencyContact() {
  const [agency, setAgency] = useState<CustomerAgencyContact | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyAgencyContact()
      .then((data) => {
        if (!cancelled) setAgency(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o contato.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-xl border-2 border-blue-100 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
        📞 Contato da agência
      </h3>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && !agency && <p className="text-sm text-slate-500">Carregando...</p>}
      {agency && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-semibold text-slate-900">{agency.name}</p>
          {agency.email && (
            <a href={`mailto:${agency.email}`} className="text-[#2563eb] hover:underline">
              ✉️ {agency.email}
            </a>
          )}
          {agency.phone && (
            <a href={`tel:${agency.phone}`} className="text-[#2563eb] hover:underline">
              📱 {agency.phone}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}
