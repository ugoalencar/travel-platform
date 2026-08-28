import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Map, Heart, FileText, CalendarCheck, Phone, Mail } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { StatusBadge } from '../components/ui/status-badge';
import { Tabs } from '../components/ui/tabs';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import {
  getCustomerById,
  getWishesByCustomerId,
  getTripsByCustomerId,
  getProposalsByCustomerId,
  getBookingsByCustomerId,
  getPassengersByBookingId,
} from '../lib/fixtures';
import { formatDateBR } from '../lib/formatDateBR';
import { formatBRL } from '../lib/formatCurrency';
import { getCustomerStatusLabel, getWishStatusLabel, getTripStatusLabel, getProposalStatusLabel, getBookingStatusLabel } from '../lib/statusLabels';
import { useMockLoading } from '../lib/useMockLoading';
import type { CustomerStatus, WishStatus, TripStatus, ProposalStatus } from '../types';

const TABS = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'trips', label: 'Viagens' },
  { value: 'wishes', label: 'Desejos' },
  { value: 'proposals', label: 'Propostas' },
  { value: 'bookings', label: 'Reservas' },
];

function wishStatusTone(s: WishStatus) {
  if (s === 'FULFILLED' || s === 'MATCHED') return 'positive' as const;
  if (s === 'ACTIVE') return 'attention' as const;
  if (s === 'CANCELLED' || s === 'EXPIRED') return 'inactive' as const;
  return 'neutral' as const;
}

function tripStatusTone(s: TripStatus) {
  if (s === 'CONFIRMED' || s === 'COMPLETED') return 'positive' as const;
  if (s === 'IN_PROGRESS') return 'attention' as const;
  return 'neutral' as const;
}

function proposalStatusTone(s: ProposalStatus) {
  if (s === 'ACCEPTED') return 'positive' as const;
  if (s === 'SENT' || s === 'DRAFT') return 'neutral' as const;
  if (s === 'DECLINED' || s === 'CANCELLED' || s === 'EXPIRED') return 'inactive' as const;
  return 'neutral' as const;
}

function customerStatusTone(s: CustomerStatus) {
  if (s === 'ACTIVE') return 'positive' as const;
  if (s === 'INACTIVE') return 'inactive' as const;
  return 'attention' as const;
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState('overview');
  const loadState = useMockLoading();

  const customer = id ? getCustomerById(id) : undefined;

  if (loadState === 'loading') {
    return <LoadingState label="Carregando cliente…" />;
  }

  if (!customer) {
    return (
      <div className="space-y-4">
        <Link to="/customers" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <ErrorState title="Cliente não encontrado" description="O ID informado não corresponde a nenhum cliente cadastrado." />
      </div>
    );
  }

  const wishes = getWishesByCustomerId(customer.id);
  const trips = getTripsByCustomerId(customer.id);
  const proposals = getProposalsByCustomerId(customer.id);
  const bookings = getBookingsByCustomerId(customer.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link to="/customers" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-3 w-3" /> Clientes
          </Link>
          <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
        </div>
        <StatusBadge tone={customerStatusTone(customer.status)}>
          {getCustomerStatusLabel(customer.status)}
        </StatusBadge>
      </div>

      <Tabs items={TABS} value={tab} onValueChange={setTab} />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>Informações do cliente</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-slate-500">E-mail</dt>
                    <dd className="flex items-center gap-1.5 text-sm text-slate-900">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      {customer.email ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Telefone</dt>
                    <dd className="flex items-center gap-1.5 text-sm text-slate-900">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      {customer.phone ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Cadastro</dt>
                    <dd className="text-sm text-slate-900">{formatDateBR(customer.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Última atualização</dt>
                    <dd className="text-sm text-slate-900">{formatDateBR(customer.updatedAt)}</dd>
                  </div>
                </dl>
                {customer.notes && (
                  <div className="mt-4 rounded-md bg-slate-50 p-3">
                    <p className="text-xs text-slate-500 mb-1">Observações</p>
                    <p className="text-sm text-slate-700">{customer.notes}</p>
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
                  <span className="text-sm text-slate-500">Desejos</span>
                  <span className="text-sm font-semibold text-slate-900">{wishes.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Viagens</span>
                  <span className="text-sm font-semibold text-slate-900">{trips.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Propostas</span>
                  <span className="text-sm font-semibold text-slate-900">{proposals.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Reservas</span>
                  <span className="text-sm font-semibold text-slate-900">{bookings.length}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === 'trips' && (
        <div>
          {trips.length === 0 ? (
            <EmptyState
              title="Nenhuma viagem"
              description="Este cliente ainda não possui viagens registradas."
              icon={<Map className="h-8 w-8" />}
            />
          ) : (
            <div className="space-y-3">
              {trips.map((trip) => (
                <Link
                  key={trip.id}
                  to={`/trips/${trip.id}`}
                  className="block rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{trip.name}</p>
                      <p className="text-xs text-slate-500">{trip.destination}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatDateBR(trip.startDate, { assumeDateOnly: true })} —{' '}
                        {formatDateBR(trip.endDate, { assumeDateOnly: true })}
                      </p>
                    </div>
                    <StatusBadge tone={tripStatusTone(trip.status)}>
                      {getTripStatusLabel(trip.status)}
                    </StatusBadge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'wishes' && (
        <div>
          {wishes.length === 0 ? (
            <EmptyState
              title="Nenhum desejo"
              description="Registre o primeiro desejo deste cliente."
              icon={<Heart className="h-8 w-8" />}
            />
          ) : (
            <div className="space-y-3">
              {wishes.map((w) => (
                <Link
                  key={w.id}
                  to={`/wishes/${w.id}`}
                  className="block rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{w.destination ?? 'Destino não definido'}</p>
                      <p className="text-xs text-slate-500">
                        {w.travelersCount ?? '—'} viajantes · {formatBRL(w.budget)}
                      </p>
                      {w.startDate && (
                        <p className="mt-1 text-xs text-slate-400">
                          {formatDateBR(w.startDate, { assumeDateOnly: true })} —{' '}
                          {w.endDate ? formatDateBR(w.endDate, { assumeDateOnly: true }) : '—'}
                        </p>
                      )}
                    </div>
                    <StatusBadge tone={wishStatusTone(w.status)}>
                      {getWishStatusLabel(w.status)}
                    </StatusBadge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'proposals' && (
        <div>
          {proposals.length === 0 ? (
            <EmptyState
              title="Nenhuma proposta"
              description="Nenhuma proposta foi criada para este cliente."
              icon={<FileText className="h-8 w-8" />}
            />
          ) : (
            <div className="space-y-3">
              {proposals.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{p.notes ?? 'Proposta'}</p>
                      <p className="text-xs text-slate-500">
                        {formatBRL(p.total)} (desconto: {formatBRL(p.discount)})
                      </p>
                      {p.validUntil && (
                        <p className="mt-1 text-xs text-slate-400">
                          Válida até {formatDateBR(p.validUntil, { assumeDateOnly: true })}
                        </p>
                      )}
                    </div>
                    <StatusBadge tone={proposalStatusTone(p.status)}>
                      {getProposalStatusLabel(p.status)}
                    </StatusBadge>
                  </div>
                  {p.conditions && (
                    <p className="mt-2 text-xs text-slate-500 bg-slate-50 rounded p-2">{p.conditions}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'bookings' && (
        <div>
          {bookings.length === 0 ? (
            <EmptyState
              title="Nenhuma reserva"
              description="Nenhuma reserva foi realizada para este cliente."
              icon={<CalendarCheck className="h-8 w-8" />}
            />
          ) : (
            <div className="space-y-3">
              {bookings.map((b) => {
                const passengers = getPassengersByBookingId(b.id);
                return (
                  <div key={b.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          Reserva {b.tripType === 'ROUND_TRIP' ? 'Ida e volta' : 'Somente ida'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {passengers.length} passageiro{passengers.length !== 1 ? 's' : ''}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Criada em {formatDateBR(b.createdAt)}
                        </p>
                      </div>
                      <StatusBadge tone={b.cancelled ? 'inactive' : 'positive'}>
                        {getBookingStatusLabel(b.cancelled)}
                      </StatusBadge>
                    </div>
                    {passengers.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {passengers.map((p) => (
                          <span key={p.id} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            {p.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
