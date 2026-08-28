import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Heart } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { StatusBadge } from '../components/ui/status-badge';
import { EmptyState } from '../components/ui/empty-state';
import { LoadingState } from '../components/ui/loading-state';
import { wishes, getCustomerById } from '../lib/fixtures';
import { getWishStatusLabel } from '../lib/statusLabels';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import { useMockLoading } from '../lib/useMockLoading';
import type { WishStatus } from '../types';

function statusTone(s: WishStatus) {
  if (s === 'FULFILLED' || s === 'MATCHED') return 'positive' as const;
  if (s === 'ACTIVE' || s === 'PROPOSED') return 'attention' as const;
  if (s === 'CANCELLED' || s === 'EXPIRED') return 'inactive' as const;
  return 'neutral' as const;
}

export function WishesPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | WishStatus>('ALL');
  const loadState = useMockLoading();

  const filtered = wishes.filter((w) => {
    const customer = getCustomerById(w.customerId);
    const matchesSearch =
      w.destination?.toLowerCase().includes(search.toLowerCase()) ||
      customer?.name.toLowerCase().includes(search.toLowerCase()) ||
      false;
    const matchesFilter = filter === 'ALL' || w.status === filter;
    return matchesSearch && matchesFilter;
  });

  if (loadState === 'loading') {
    return <LoadingState label="Carregando desejos…" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Desejos</h1>
          <p className="text-sm text-slate-500">{wishes.length} desejos registrados</p>
        </div>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Novo desejo
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar por destino ou cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap rounded-md border border-slate-200 bg-white p-0.5">
          {(['ALL', 'ACTIVE', 'MATCHED', 'PROPOSED', 'FULFILLED'] as const).map((opt) => (
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
              {opt === 'ALL' ? 'Todos' : getWishStatusLabel(opt)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhum desejo encontrado"
          description={search ? 'Tente outro termo de busca.' : 'Registre o primeiro desejo de um cliente.'}
          icon={<Heart className="h-8 w-8" />}
          action={
            search ? (
              <Button variant="outline" size="sm" onClick={() => { setSearch(''); setFilter('ALL'); }}>
                Limpar filtros
              </Button>
            ) : (
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Novo desejo
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((w) => {
            const customer = getCustomerById(w.customerId);
            return (
              <Link
                key={w.id}
                to={`/wishes/${w.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-900">
                      {w.destination ?? 'Destino não definido'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {customer?.name ?? 'Cliente'} · {w.travelersCount ?? '—'} viajantes
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      {w.budget !== undefined && <span>{formatBRL(w.budget)}</span>}
                      {w.startDate && (
                        <span>
                          {formatDateBR(w.startDate, { assumeDateOnly: true })} —{' '}
                          {w.endDate ? formatDateBR(w.endDate, { assumeDateOnly: true }) : '—'}
                        </span>
                      )}
                    </div>
                    {w.notes && (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-1">{w.notes}</p>
                    )}
                  </div>
                  <StatusBadge tone={statusTone(w.status)}>
                    {getWishStatusLabel(w.status)}
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
