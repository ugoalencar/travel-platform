import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { StatusBadge } from '../components/ui/status-badge';
import { Tabs } from '../components/ui/tabs';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import {
  getTripById,
  getCustomerById,
  getProposalsByCustomerId,
  getBookingsByCustomerId,
  portugalItinerary,
} from '../lib/fixtures';
import { formatDateBR } from '../lib/formatDateBR';
import { formatBRL } from '../lib/formatCurrency';
import { getTripStatusLabel, getProposalStatusLabel, getBookingStatusLabel } from '../lib/statusLabels';
import { useMockLoading } from '../lib/useMockLoading';
import type { TripStatus } from '../types';

const TABS = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'itinerary', label: 'Itinerário' },
  { value: 'related', label: 'Relacionados' },
];

function tripStatusTone(s: TripStatus) {
  if (s === 'CONFIRMED' || s === 'COMPLETED') return 'positive' as const;
  if (s === 'IN_PROGRESS') return 'attention' as const;
  return 'neutral' as const;
}

export function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState('overview');
  const loadState = useMockLoading();

  const trip = id ? getTripById(id) : undefined;

  if (loadState === 'loading') {
    return <LoadingState label="Carregando viagem…" />;
  }

  if (!trip) {
    return (
      <div className="space-y-4">
        <Link to="/trips" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Viagens
        </Link>
        <ErrorState title="Viagem não encontrada" description="O ID informado não corresponde a nenhuma viagem registrada." />
      </div>
    );
  }

  const customer = getCustomerById(trip.customerId);
  const proposals = customer ? getProposalsByCustomerId(customer.id) : [];
  const bookings = customer ? getBookingsByCustomerId(customer.id) : [];

  const isPortugalTrip = trip.destination.includes('Portugal');
  const itinerary = isPortugalTrip ? portugalItinerary : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link to="/trips" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-3 w-3" /> Viagens
          </Link>
          <h1 className="text-xl font-bold text-slate-900">{trip.name}</h1>
          <p className="text-sm text-slate-500">
            {customer?.name ?? 'Cliente'} · {trip.destination}
          </p>
        </div>
        <StatusBadge tone={tripStatusTone(trip.status)}>
          {getTripStatusLabel(trip.status)}
        </StatusBadge>
      </div>

      <Tabs items={TABS} value={tab} onValueChange={setTab} />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>Detalhes da viagem</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Destino</p>
                      <p className="text-sm font-medium text-slate-900">{trip.destination}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Período</p>
                      <p className="text-sm font-medium text-slate-900">
                        {formatDateBR(trip.startDate, { assumeDateOnly: true })} —{' '}
                        {formatDateBR(trip.endDate, { assumeDateOnly: true })}
                      </p>
                    </div>
                  </div>
                </div>
                {trip.description && (
                  <div className="mt-4 rounded-md bg-slate-50 p-3">
                    <p className="text-xs text-slate-500 mb-1">Descrição</p>
                    <p className="text-sm text-slate-700">{trip.description}</p>
                  </div>
                )}
                {trip.notes && (
                  <div className="mt-3 rounded-md bg-blue-50 p-3">
                    <p className="text-xs text-blue-600 mb-1">Notas internas</p>
                    <p className="text-sm text-blue-800">{trip.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Resumo</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Status</span>
                  <StatusBadge tone={tripStatusTone(trip.status)}>
                    {getTripStatusLabel(trip.status)}
                  </StatusBadge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Criada em</span>
                  <span className="text-sm text-slate-900">{formatDateBR(trip.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Atualizada</span>
                  <span className="text-sm text-slate-900">{formatDateBR(trip.updatedAt)}</span>
                </div>
                {customer && (
                  <Link
                    to={`/customers/${customer.id}`}
                    className="flex items-center justify-between rounded-md bg-slate-50 p-2 text-sm hover:bg-slate-100"
                  >
                    <span className="text-slate-500">Cliente</span>
                    <span className="font-medium text-slate-900">{customer.name}</span>
                  </Link>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === 'itinerary' && (
        <div>
          {itinerary.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <Clock className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">Itinerário não disponível para esta viagem</p>
                <p className="text-xs text-slate-400 mt-1">O itinerário detalhado será exibido aqui quando disponível.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="relative ml-4 border-l-2 border-slate-200 pl-8 space-y-6">
              {itinerary.map((day, idx) => {
                const isLast = idx === itinerary.length - 1;
                return (
                  <div key={day.date} className="relative">
                    <div className={`absolute -left-[41px] top-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white ${idx === 0 ? 'bg-blue-600' : isLast ? 'bg-emerald-600' : 'bg-slate-400'}`}>
                      {idx + 1}
                    </div>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-slate-400">
                                {formatDateBR(day.date, { assumeDateOnly: true })}
                              </span>
                              <StatusBadge tone="neutral">{day.location}</StatusBadge>
                            </div>
                            <p className="text-sm font-medium text-slate-900">{day.description}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {day.highlights.map((h) => (
                                <span key={h} className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                  {h}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'related' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Propostas</CardTitle></CardHeader>
            <CardContent>
              {proposals.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">Nenhuma proposta</p>
              ) : (
                <ul className="space-y-2">
                  {proposals.map((p) => (
                    <li key={p.id} className="flex items-center justify-between rounded-md bg-slate-50 p-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{p.notes ?? 'Proposta'}</p>
                        <p className="text-xs text-slate-500">{formatBRL(p.total)}</p>
                      </div>
                      <StatusBadge tone={p.status === 'ACCEPTED' ? 'positive' : 'neutral'}>
                        {getProposalStatusLabel(p.status)}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Reservas</CardTitle></CardHeader>
            <CardContent>
              {bookings.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">Nenhuma reserva</p>
              ) : (
                <ul className="space-y-2">
                  {bookings.map((b) => (
                    <li key={b.id} className="flex items-center justify-between rounded-md bg-slate-50 p-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {b.tripType === 'ROUND_TRIP' ? 'Ida e volta' : 'Somente ida'}
                        </p>
                        <p className="text-xs text-slate-500">
                          Criada em {formatDateBR(b.createdAt)}
                        </p>
                      </div>
                      <StatusBadge tone={b.cancelled ? 'inactive' : 'positive'}>
                        {getBookingStatusLabel(b.cancelled)}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
