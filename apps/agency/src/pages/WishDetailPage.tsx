import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Users, DollarSign, MapPin, FileText, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { StatusBadge } from '../components/ui/status-badge';
import { Tabs } from '../components/ui/tabs';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { Modal } from '../components/ui/modal';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { getWishById, getCustomerById, getTripsByCustomerId, getProposalsByCustomerId, customers } from '../lib/fixtures';
import { formatDateBR } from '../lib/formatDateBR';
import { formatBRL } from '../lib/formatCurrency';
import { getWishStatusLabel, getTripStatusLabel, getProposalStatusLabel } from '../lib/statusLabels';
import { useMockLoading } from '../lib/useMockLoading';
import type { WishStatus, TripStatus, ProposalStatus } from '../types';

const TABS = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'proposals', label: 'Propostas' },
  { value: 'trips', label: 'Viagens' },
];

function wishStatusTone(s: WishStatus) {
  if (s === 'FULFILLED' || s === 'MATCHED') return 'positive' as const;
  if (s === 'ACTIVE' || s === 'PROPOSED') return 'attention' as const;
  return 'inactive' as const;
}

function tripStatusTone(s: TripStatus) {
  if (s === 'CONFIRMED' || s === 'COMPLETED') return 'positive' as const;
  if (s === 'IN_PROGRESS') return 'attention' as const;
  return 'neutral' as const;
}

function proposalStatusTone(s: ProposalStatus) {
  if (s === 'ACCEPTED') return 'positive' as const;
  if (s === 'SENT' || s === 'DRAFT') return 'neutral' as const;
  return 'inactive' as const;
}

export function WishDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState('overview');
  const [showNewWish, setShowNewWish] = useState(false);
  const [newWish, setNewWish] = useState({ destination: '', travelersCount: '2', budget: '', notes: '' });
  const loadState = useMockLoading();

  const wish = id ? getWishById(id) : undefined;

  if (loadState === 'loading') {
    return <LoadingState label="Carregando desejo…" />;
  }

  if (!wish) {
    return (
      <div className="space-y-4">
        <Link to="/wishes" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Desejos
        </Link>
        <ErrorState title="Desejo não encontrado" description="O ID informado não corresponde a nenhum desejo registrado." />
      </div>
    );
  }

  const customer = getCustomerById(wish.customerId);
  const trips = customer ? getTripsByCustomerId(customer.id) : [];
  const proposals = customer ? getProposalsByCustomerId(customer.id).filter((p) => p.wishId === wish.id) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link to="/wishes" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-3 w-3" /> Desejos
          </Link>
          <h1 className="text-xl font-bold text-slate-900">{wish.destination ?? 'Destino não definido'}</h1>
          <p className="text-sm text-slate-500">
            {customer?.name ?? 'Cliente'} · {wish.travelersCount ?? '—'} viajantes
          </p>
        </div>
        <StatusBadge tone={wishStatusTone(wish.status)}>
          {getWishStatusLabel(wish.status)}
        </StatusBadge>
      </div>

      <div className="flex items-center justify-between">
        <Tabs items={TABS} value={tab} onValueChange={setTab} />
        <Button size="sm" onClick={() => setShowNewWish(true)}>
          <FileText className="h-4 w-4" />
          Criar desejo
        </Button>
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader><CardTitle>Detalhes do desejo</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Destino</p>
                      <p className="text-sm font-medium text-slate-900">{wish.destination ?? '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Orçamento</p>
                      <p className="text-sm font-medium text-slate-900">{formatBRL(wish.budget)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Viajantes</p>
                      <p className="text-sm font-medium text-slate-900">{wish.travelersCount ?? '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Período</p>
                      <p className="text-sm font-medium text-slate-900">
                        {wish.startDate ? formatDateBR(wish.startDate, { assumeDateOnly: true }) : '—'} —{' '}
                        {wish.endDate ? formatDateBR(wish.endDate, { assumeDateOnly: true }) : '—'}
                      </p>
                    </div>
                  </div>
                </div>
                {wish.notes && (
                  <div className="mt-4 rounded-md bg-slate-50 p-3">
                    <p className="text-xs text-slate-500 mb-1">Observações</p>
                    <p className="text-sm text-slate-700">{wish.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs text-slate-500">Criado em</dt>
                  <dd className="text-sm text-slate-900">{formatDateBR(wish.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Última atualização</dt>
                  <dd className="text-sm text-slate-900">{formatDateBR(wish.updatedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Status atual</dt>
                  <dd>
                    <StatusBadge tone={wishStatusTone(wish.status)}>
                      {getWishStatusLabel(wish.status)}
                    </StatusBadge>
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'proposals' && (
        <div>
          {proposals.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <FileText className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">Nenhuma proposta vinculada</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {proposals.map((p) => (
                <Link
                  key={p.id}
                  to={`/proposals/${p.id}`}
                  className="block rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{p.notes ?? 'Proposta'}</p>
                      <p className="text-xs text-slate-500">{formatBRL(p.total)}</p>
                    </div>
                    <StatusBadge tone={proposalStatusTone(p.status)}>
                      {getProposalStatusLabel(p.status)}
                    </StatusBadge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'trips' && (
        <div>
          {trips.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <MapPin className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">Nenhuma viagem vinculada</p>
              </CardContent>
            </Card>
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
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge tone={tripStatusTone(trip.status)}>
                        {getTripStatusLabel(trip.status)}
                      </StatusBadge>
                      <ArrowRight className="h-4 w-4 text-slate-300" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal
        open={showNewWish}
        onClose={() => setShowNewWish(false)}
        title="Novo desejo"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowNewWish(false)}>Cancelar</Button>
            <Button size="sm" onClick={() => setShowNewWish(false)}>Salvar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Cliente</label>
            <Select defaultValue={customers[0]?.id}>
              {customers.filter((c) => c.status === 'ACTIVE').map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Destino</label>
            <Input
              placeholder="Ex: Portugal, Grécia…"
              value={newWish.destination}
              onChange={(e) => setNewWish({ ...newWish, destination: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Viajantes</label>
              <Input
                type="number"
                min="1"
                value={newWish.travelersCount}
                onChange={(e) => setNewWish({ ...newWish, travelersCount: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Orçamento (R$)</label>
              <Input
                type="number"
                placeholder="0,00"
                value={newWish.budget}
                onChange={(e) => setNewWish({ ...newWish, budget: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Observações</label>
            <Textarea
              placeholder="Preferências, restrições, detalhes…"
              value={newWish.notes}
              onChange={(e) => setNewWish({ ...newWish, notes: e.target.value })}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
