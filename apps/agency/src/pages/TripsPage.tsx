import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Map } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { StatusBadge } from '../components/ui/status-badge';
import { EmptyState } from '../components/ui/empty-state';
import { LoadingState } from '../components/ui/loading-state';
import { trips, getCustomerById } from '../lib/fixtures';
import { getTripStatusLabel } from '../lib/statusLabels';
import { formatDateBR } from '../lib/formatDateBR';
import { useMockLoading } from '../lib/useMockLoading';
import type { TripStatus } from '../types';

function statusTone(s: TripStatus) {
  if (s === 'CONFIRMED' || s === 'COMPLETED') return 'positive' as const;
  if (s === 'IN_PROGRESS') return 'attention' as const;
  if (s === 'CANCELLED') return 'inactive' as const;
  return 'neutral' as const;
}

export function TripsPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | TripStatus>('ALL');
  const loadState = useMockLoading();

  const filtered = trips.filter((t) => {
    const customer = getCustomerById(t.customerId);
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.destination.toLowerCase().includes(search.toLowerCase()) ||
      customer?.name.toLowerCase().includes(search.toLowerCase()) ||
      false;
    const matchesFilter = filter === 'ALL' || t.status === filter;
    return matchesSearch && matchesFilter;
  });

  if (loadState === 'loading') {
    return <LoadingState label="Carregando viagens…" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Viagens</h1>
          <p className="text-sm text-slate-500">{trips.length} viagens registradas</p>
        </div>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Nova viagem
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar por nome, destino ou cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap rounded-md border border-slate-200 bg-white p-0.5">
          {(['ALL', 'PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setFilter(opt)}
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

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhuma viagem encontrada"
          description={search ? 'Tente outro termo de busca.' : 'Crie a primeira viagem a partir de um desejo.'}
          icon={<Map className="h-8 w-8" />}
          action={
            search ? (
              <Button variant="outline" size="sm" onClick={() => { setSearch(''); setFilter('ALL'); }}>
                Limpar filtros
              </Button>
            ) : (
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Nova viagem
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((trip) => {
            const customer = getCustomerById(trip.customerId);
            return (
              <Link
                key={trip.id}
                to={`/trips/${trip.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50"
              >
                <div className="flex items-start justify-between">
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
                  <StatusBadge tone={statusTone(trip.status)}>
                    {getTripStatusLabel(trip.status)}
                  </StatusBadge>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
