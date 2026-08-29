import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Heart } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Select } from '../components/ui/select';
import { StatusBadge } from '../components/ui/status-badge';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { Modal } from '../components/ui/modal';
import { ApiError, createWish, listCustomers, listWishes } from '../lib/api';
import { getWishStatusLabel } from '../lib/statusLabels';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import type { Wish, WishStatus } from '../types/wish';
import type { Customer } from '../types/customer';

function statusTone(s: WishStatus) {
  if (s === 'FULFILLED' || s === 'MATCHED') return 'positive' as const;
  if (s === 'ACTIVE' || s === 'PROPOSED') return 'attention' as const;
  if (s === 'CANCELLED' || s === 'EXPIRED') return 'inactive' as const;
  return 'neutral' as const;
}

const emptyNewWish = { customerId: '', destination: '', travelersCount: '2', budget: '', notes: '' };

export function WishesPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | WishStatus>('ALL');
  const [wishes, setWishes] = useState<Wish[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showNewWish, setShowNewWish] = useState(false);
  const [newWish, setNewWish] = useState(emptyNewWish);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const customerById = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers],
  );

  const load = useCallback(() => {
    setError(null);
    setWishes(null);
    Promise.all([listWishes(), listCustomers()])
      .then(([w, c]) => {
        setWishes(w);
        setCustomers(c);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os desejos.');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return <ErrorState description={error} onRetry={load} />;
  }

  if (!wishes) {
    return <LoadingState label="Carregando desejos…" />;
  }

  const filtered = wishes.filter((w) => {
    const customer = customerById.get(w.customerId);
    const matchesSearch =
      (w.destination?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (customer?.name.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesFilter = filter === 'ALL' || w.status === filter;
    return matchesSearch && matchesFilter;
  });

  const activeCustomers = customers.filter((c) => c.status === 'ACTIVE');

  async function handleCreate() {
    if (!newWish.customerId) {
      setFormError('Selecione um cliente.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const travelersCount = newWish.travelersCount ? Number(newWish.travelersCount) : undefined;
      const budget = newWish.budget ? Number(newWish.budget) : undefined;
      await createWish({
        customerId: newWish.customerId,
        destination: newWish.destination.trim() || undefined,
        travelersCount: Number.isFinite(travelersCount) ? travelersCount : undefined,
        budget: Number.isFinite(budget) ? budget : undefined,
        notes: newWish.notes.trim() || undefined,
      });
      setShowNewWish(false);
      setNewWish(emptyNewWish);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o desejo.');
    } finally {
      setSaving(false);
    }
  }

  function openCreate() {
    setNewWish({ ...emptyNewWish, customerId: activeCustomers[0]?.id ?? '' });
    setShowNewWish(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Desejos</h1>
          <p className="text-sm text-slate-500">{wishes.length} desejos registrados</p>
        </div>
        <Button size="sm" onClick={openCreate}>
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
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Novo desejo
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((w) => {
            const customer = customerById.get(w.customerId);
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

      <Modal
        open={showNewWish}
        onClose={() => { setShowNewWish(false); setFormError(null); }}
        title="Novo desejo"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => { setShowNewWish(false); setFormError(null); }} disabled={saving}>
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
              value={newWish.customerId}
              onChange={(e) => setNewWish({ ...newWish, customerId: e.target.value })}
            >
              {activeCustomers.map((c) => (
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
