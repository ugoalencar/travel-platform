import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Users, DollarSign, MapPin, FileText, ArrowRight, Pencil } from 'lucide-react';
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
import {
  ApiError,
  createWish,
  getCustomer,
  getWish,
  listCustomers,
  listTripsByCustomer,
  updateWish,
} from '../lib/api';
import { formatDateBR } from '../lib/formatDateBR';
import { formatBRL } from '../lib/formatCurrency';
import { getWishStatusLabel, getTripStatusLabel } from '../lib/statusLabels';
import type { WishStatus, TripStatus } from '../types';
import type { Wish } from '../types/wish';
import type { Customer } from '../types/customer';
import type { Trip } from '../types/trip';

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

const emptyForm = { destination: '', travelersCount: '2', budget: '', notes: '' };

export function WishDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [wish, setWish] = useState<Wish | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [showNewWish, setShowNewWish] = useState(false);
  const [showEditWish, setShowEditWish] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [newWishCustomerId, setNewWishCustomerId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!id) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);
    getWish(id)
      .then(async (w) => {
        setWish(w);
        const [c, t] = await Promise.all([
          getCustomer(w.customerId),
          listTripsByCustomer(w.customerId),
        ]);
        setCustomer(c);
        setTrips(t);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o desejo.');
        }
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    listCustomers()
      .then(setCustomers)
      .catch(() => setCustomers([]));
  }, []);

  if (loading) {
    return <LoadingState label="Carregando desejo…" />;
  }

  if (error) {
    return <ErrorState description={error} onRetry={load} />;
  }

  if (notFound || !wish) {
    return (
      <div className="space-y-4">
        <Link to="/wishes" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Desejos
        </Link>
        <ErrorState title="Desejo não encontrado" description="O ID informado não corresponde a nenhum desejo registrado." />
      </div>
    );
  }

  // Proposals are out of CORE-A scope; this tab renders honestly empty.
  const proposals: never[] = [];
  const activeCustomers = customers.filter((c) => c.status === 'ACTIVE');

  function openNewWish() {
    setForm(emptyForm);
    setNewWishCustomerId(activeCustomers[0]?.id ?? wish!.customerId);
    setFormError(null);
    setShowNewWish(true);
  }

  function openEditWish() {
    setForm({
      destination: wish!.destination ?? '',
      travelersCount: wish!.travelersCount !== undefined ? String(wish!.travelersCount) : '',
      budget: wish!.budget !== undefined ? String(wish!.budget) : '',
      notes: wish!.notes ?? '',
    });
    setFormError(null);
    setShowEditWish(true);
  }

  async function handleCreate() {
    if (!newWishCustomerId) {
      setFormError('Selecione um cliente.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const travelersCount = form.travelersCount ? Number(form.travelersCount) : undefined;
      const budget = form.budget ? Number(form.budget) : undefined;
      const created = await createWish({
        customerId: newWishCustomerId,
        destination: form.destination.trim() || undefined,
        travelersCount: Number.isFinite(travelersCount) ? travelersCount : undefined,
        budget: Number.isFinite(budget) ? budget : undefined,
        notes: form.notes.trim() || undefined,
      });
      setShowNewWish(false);
      void navigate(`/wishes/${created.id}`);
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o desejo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    setSaving(true);
    setFormError(null);
    try {
      const travelersCount = form.travelersCount ? Number(form.travelersCount) : undefined;
      const budget = form.budget ? Number(form.budget) : undefined;
      const updated = await updateWish(wish!.id, {
        destination: form.destination.trim() || undefined,
        travelersCount: Number.isFinite(travelersCount) ? travelersCount : undefined,
        budget: Number.isFinite(budget) ? budget : undefined,
        notes: form.notes.trim() || undefined,
      });
      setWish(updated);
      setShowEditWish(false);
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar as alterações.');
    } finally {
      setSaving(false);
    }
  }

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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openEditWish}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
          <Button size="sm" onClick={openNewWish}>
            <FileText className="h-4 w-4" />
            Criar desejo
          </Button>
        </div>
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
          ) : null}
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
        onClose={() => { setShowNewWish(false); setFormError(null); }}
        title="Novo desejo"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => { setShowNewWish(false); setFormError(null); }} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={() => { void handleCreate(); }} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <p role="alert" className="rounded-md bg-red-50 p-2 text-xs text-red-700">{formError}</p>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Cliente</label>
            <Select value={newWishCustomerId} onChange={(e) => setNewWishCustomerId(e.target.value)}>
              {activeCustomers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Destino</label>
            <Input
              placeholder="Ex: Portugal, Grécia…"
              value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Viajantes</label>
              <Input
                type="number"
                min="1"
                value={form.travelersCount}
                onChange={(e) => setForm({ ...form, travelersCount: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Orçamento (R$)</label>
              <Input
                type="number"
                placeholder="0,00"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Observações</label>
            <Textarea
              placeholder="Preferências, restrições, detalhes…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={showEditWish}
        onClose={() => { setShowEditWish(false); setFormError(null); }}
        title="Editar desejo"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => { setShowEditWish(false); setFormError(null); }} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={() => { void handleEdit(); }} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <p role="alert" className="rounded-md bg-red-50 p-2 text-xs text-red-700">{formError}</p>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Destino</label>
            <Input
              value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Viajantes</label>
              <Input
                type="number"
                min="1"
                value={form.travelersCount}
                onChange={(e) => setForm({ ...form, travelersCount: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Orçamento (R$)</label>
              <Input
                type="number"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Observações</label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
