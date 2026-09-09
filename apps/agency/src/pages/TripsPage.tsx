import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Clock3, Search, Plus, Map as MapIcon } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Select } from '../components/ui/select';
import { StatusBadge } from '../components/ui/status-badge';
import { StatCard } from '../components/ui/stat-card';
import { SectionCard } from '../components/ui/section-card';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { Modal } from '../components/ui/modal';
import { ApiError, createTrip, listCustomers, listTrips } from '../lib/api';
import { getTripStatusLabel } from '../lib/statusLabels';
import { formatDateBR } from '../lib/formatDateBR';
import type { Trip, TripStatus } from '../types/trip';
import type { Customer } from '../types/customer';

function statusTone(s: TripStatus) {
  if (s === 'CONFIRMED' || s === 'COMPLETED') return 'positive' as const;
  if (s === 'IN_PROGRESS') return 'attention' as const;
  if (s === 'CANCELLED') return 'inactive' as const;
  return 'neutral' as const;
}

const emptyNewTrip = {
  customerId: '',
  name: '',
  destination: '',
  startDate: '',
  endDate: '',
  description: '',
};

export function TripsPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | TripStatus>('ALL');
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [newTrip, setNewTrip] = useState(emptyNewTrip);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const customerById = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers],
  );

  const load = useCallback(() => {
    setError(null);
    setTrips(null);
    Promise.all([listTrips(), listCustomers()])
      .then(([t, c]) => {
        setTrips(t);
        setCustomers(c);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as viagens.');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return <ErrorState description={error} onRetry={load} />;
  }

  if (!trips) {
    return <LoadingState label="Carregando viagens…" />;
  }

  const filtered = trips.filter((t) => {
    const customer = customerById.get(t.customerId);
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.destination.toLowerCase().includes(search.toLowerCase()) ||
      (customer?.name.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesFilter = filter === 'ALL' || t.status === filter;
    return matchesSearch && matchesFilter;
  });

  const activeCustomers = customers.filter((c) => c.status === 'ACTIVE');
  const confirmedCount = trips.filter((t) => t.status === 'CONFIRMED').length;
  const inProgressCount = trips.filter((t) => t.status === 'IN_PROGRESS').length;
  const plannedCount = trips.filter((t) => t.status === 'PLANNED').length;

  function openCreate() {
    setNewTrip({ ...emptyNewTrip, customerId: activeCustomers[0]?.id ?? '' });
    setShowNewTrip(true);
  }

  async function handleCreate() {
    if (!newTrip.customerId) {
      setFormError('Selecione um cliente.');
      return;
    }
    if (!newTrip.name.trim() || !newTrip.destination.trim()) {
      setFormError('Informe o nome e o destino da viagem.');
      return;
    }
    if (!newTrip.startDate || !newTrip.endDate) {
      setFormError('Informe as datas de início e fim.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createTrip({
        customerId: newTrip.customerId,
        name: newTrip.name.trim(),
        destination: newTrip.destination.trim(),
        startDate: newTrip.startDate,
        endDate: newTrip.endDate,
        description: newTrip.description.trim() || undefined,
      });
      setShowNewTrip(false);
      setNewTrip(emptyNewTrip);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar a viagem.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Viagens"
        description="Controle operacional de roteiros, clientes, datas e status de execução."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Viagens' }]}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nova viagem
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Viagens registradas"
          value={String(trips.length)}
          delta="Base operacional ativa"
          icon={<MapIcon className="h-4 w-4" />}
          accent="neutral"
        />
        <StatCard
          label="Confirmadas"
          value={String(confirmedCount)}
          delta="Prontas para execução"
          deltaTone="positive"
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="success"
        />
        <StatCard
          label="Em andamento"
          value={String(inProgressCount)}
          delta="Acompanhar passageiros"
          icon={<Clock3 className="h-4 w-4" />}
          accent="pending"
        />
        <StatCard
          label="Planejadas"
          value={String(plannedCount)}
          delta="Em desenho comercial"
          icon={<CalendarDays className="h-4 w-4" />}
          accent="revenue"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 max-w-sm">
          <label htmlFor="trips-search" className="sr-only">
            Buscar viagens
          </label>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input
            id="trips-search"
            placeholder="Buscar por nome, destino ou cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Buscar viagens"
          />
        </div>
        <div className="flex flex-wrap rounded-md border border-slate-200 bg-white p-0.5" role="group" aria-label="Filtrar por status">
          {(['ALL', 'PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setFilter(opt)}
              aria-pressed={filter === opt}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === opt
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opt === 'ALL' ? 'Todas' : getTripStatusLabel(opt)}
            </button>
          ))}
        </div>
      </div>

      <SectionCard title="Carteira de viagens" description="Lista escaneável para acompanhamento operacional" contentClassName="p-0">
        {filtered.length === 0 ? (
          <EmptyState
            title="Nenhuma viagem encontrada"
            description={search ? 'Tente outro termo de busca.' : 'Crie a primeira viagem a partir de um desejo.'}
            icon={<MapIcon className="h-8 w-8" />}
            action={
              search ? (
                <Button variant="outline" size="sm" onClick={() => { setSearch(''); setFilter('ALL'); }}>
                  Limpar filtros
                </Button>
              ) : (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Nova viagem
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Viagem</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Destino</th>
                  <th className="px-4 py-3">Periodo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((trip) => {
                  const customer = customerById.get(trip.customerId);
                  return (
                    <tr key={trip.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-4">
                        <Link
                          to={`/trips/${trip.id}`}
                          className="font-semibold text-slate-950 hover:text-indigo-600 hover:underline"
                        >
                          {trip.name}
                        </Link>
                        {trip.description && (
                          <p className="mt-1 max-w-xs truncate text-xs text-slate-500">{trip.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-slate-600">{customer?.name ?? 'Cliente'}</td>
                      <td className="px-4 py-4 text-slate-600">{trip.destination}</td>
                      <td className="px-4 py-4 text-xs text-slate-500">
                        {formatDateBR(trip.startDate, { assumeDateOnly: true })} —{' '}
                        {formatDateBR(trip.endDate, { assumeDateOnly: true })}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge tone={statusTone(trip.status)}>
                          {getTripStatusLabel(trip.status)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link
                          to={`/trips/${trip.id}`}
                          className="inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                        >
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Modal
        open={showNewTrip}
        onClose={() => { setShowNewTrip(false); setFormError(null); }}
        title="Nova viagem"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => { setShowNewTrip(false); setFormError(null); }} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => { void handleCreate(); }} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <p role="alert" className="rounded-md bg-red-50 p-2 text-xs text-red-700">{formError}</p>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Cliente</label>
            <Select
              value={newTrip.customerId}
              onChange={(e) => setNewTrip({ ...newTrip, customerId: e.target.value })}
            >
              {activeCustomers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Nome da viagem</label>
            <Input
              placeholder="Ex: Família Martins — Portugal"
              value={newTrip.name}
              onChange={(e) => setNewTrip({ ...newTrip, name: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Destino</label>
            <Input
              placeholder="Ex: Lisboa + Porto, Portugal"
              value={newTrip.destination}
              onChange={(e) => setNewTrip({ ...newTrip, destination: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Início</label>
              <Input
                type="date"
                value={newTrip.startDate}
                onChange={(e) => setNewTrip({ ...newTrip, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Fim</label>
              <Input
                type="date"
                value={newTrip.endDate}
                onChange={(e) => setNewTrip({ ...newTrip, endDate: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Descrição</label>
            <Textarea
              placeholder="Roteiro, hospedagem, detalhes…"
              value={newTrip.description}
              onChange={(e) => setNewTrip({ ...newTrip, description: e.target.value })}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
