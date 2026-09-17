import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Map as MapIcon, X, Bus, Plane, Compass } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Select } from '../components/ui/select';
import { StatusBadge } from '../components/ui/status-badge';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { Modal } from '../components/ui/modal';
import { ApiError, createTrip, listCustomers, listTrips } from '../lib/api';
import { getTripStatusLabel } from '../lib/statusLabels';
import { formatDateBR } from '../lib/formatDateBR';
import type { Trip, TripCategory, TripStatus } from '../types/trip';
import type { Customer } from '../types/customer';

function statusTone(s: TripStatus) {
  if (s === 'CONFIRMED' || s === 'COMPLETED') return 'positive' as const;
  if (s === 'IN_PROGRESS') return 'attention' as const;
  if (s === 'CANCELLED') return 'inactive' as const;
  return 'neutral' as const;
}

const CATEGORY_BADGE: Record<TripCategory, { label: string; icon: typeof Bus; className: string }> = {
  TERRESTRE: { label: 'Terrestre', icon: Bus, className: 'bg-(--color-kpi-green-bg) text-(--color-kpi-green-fg)' },
  AEREO: { label: 'Aérea', icon: Plane, className: 'bg-(--color-kpi-blue-bg) text-(--color-kpi-blue-fg)' },
  EXCURSAO: { label: 'Excursão', icon: Compass, className: 'bg-(--color-kpi-purple-bg) text-(--color-kpi-purple-fg)' },
  OUTRO: { label: 'Outro', icon: MapIcon, className: 'bg-(--color-kpi-orange-bg) text-(--color-kpi-orange-fg)' },
};

const CATEGORY_TABS: { value: 'ALL' | TripCategory; label: string }[] = [
  { value: 'ALL', label: 'Todas' },
  { value: 'TERRESTRE', label: 'Terrestre' },
  { value: 'AEREO', label: 'Aérea' },
  { value: 'EXCURSAO', label: 'Excursões' },
];

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
  const [statusFilter, setStatusFilter] = useState<'ALL' | TripStatus>('ALL');
  const [category, setCategory] = useState<'ALL' | TripCategory>('ALL');
  const [customerFilter, setCustomerFilter] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
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

  const hasFilters = category !== 'ALL' || !!customerFilter || !!periodStart || !!periodEnd;

  const load = useCallback(() => {
    setError(null);
    setTrips(null);
    Promise.all([
      listTrips({
        category: category === 'ALL' ? undefined : category,
        customerId: customerFilter || undefined,
        startDate: periodStart || undefined,
        endDate: periodEnd || undefined,
      }),
      listCustomers(),
    ])
      .then(([t, c]) => {
        setTrips(t);
        setCustomers(c);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as viagens.');
      });
  }, [category, customerFilter, periodStart, periodEnd]);

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
    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeCustomers = customers.filter((c) => c.status === 'ACTIVE');

  function clearFilters() {
    setSearch('');
    setStatusFilter('ALL');
    setCategory('ALL');
    setCustomerFilter('');
    setPeriodStart('');
    setPeriodEnd('');
  }

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
        description={`${trips.length} viagens ${hasFilters ? 'encontradas com os filtros aplicados' : 'registradas'}`}
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Viagens' }]}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nova viagem
          </Button>
        }
      />

      <div className="flex flex-wrap rounded-md border border-slate-200 bg-white p-0.5" role="tablist" aria-label="Filtrar por área">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={category === tab.value}
            onClick={() => setCategory(tab.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              category === tab.value
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
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

        <div className="min-w-[180px]">
          <label htmlFor="trips-customer-filter" className="mb-1 block text-xs font-medium text-slate-700">
            Cliente
          </label>
          <Select
            id="trips-customer-filter"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
          >
            <option value="">Todos os clientes</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>

        <div>
          <label htmlFor="trips-period-start" className="mb-1 block text-xs font-medium text-slate-700">
            Período — de
          </label>
          <Input
            id="trips-period-start"
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="trips-period-end" className="mb-1 block text-xs font-medium text-slate-700">
            até
          </label>
          <Input
            id="trips-period-end"
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap rounded-md border border-slate-200 bg-white p-0.5" role="group" aria-label="Filtrar por status">
          {(['ALL', 'PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setStatusFilter(opt)}
              aria-pressed={statusFilter === opt}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === opt
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opt === 'ALL' ? 'Todas' : getTripStatusLabel(opt)}
            </button>
          ))}
        </div>

        {(hasFilters || search || statusFilter !== 'ALL') && (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" />
            Limpar filtros
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhuma viagem encontrada"
          description={search || hasFilters ? 'Tente ajustar a busca ou os filtros.' : 'Crie a primeira viagem a partir de um desejo.'}
          icon={<MapIcon className="h-8 w-8" />}
          action={
            search || hasFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
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
        <div className="space-y-3">
          {filtered.map((trip) => {
            const customer = customerById.get(trip.customerId);
            const categoryBadge = CATEGORY_BADGE[trip.category];
            const CategoryIcon = categoryBadge?.icon;
            return (
              <Link
                key={trip.id}
                to={`/trips/${trip.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {categoryBadge && CategoryIcon && (
                      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${categoryBadge.className}`} title={categoryBadge.label}>
                        <CategoryIcon className="h-4 w-4" />
                      </span>
                    )}
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-900">{trip.name}</p>
                      <p className="text-xs text-slate-500">{customer?.name ?? 'Cliente'} · {trip.destination}</p>
                      <p className="text-xs text-slate-400">
                        {formatDateBR(trip.startDate, { assumeDateOnly: true })} —{' '}
                        {formatDateBR(trip.endDate, { assumeDateOnly: true })}
                      </p>
                      {trip.description && (
                        <p className="mt-1 text-xs text-slate-500 line-clamp-1">{trip.description}</p>
                      )}
                    </div>
                  </div>
                  <StatusBadge tone={statusTone(trip.status)}>
                    {getTripStatusLabel(trip.status)}
                  </StatusBadge>
                </div>
              </Link>
            );
          })}
        </div>
      )}

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
