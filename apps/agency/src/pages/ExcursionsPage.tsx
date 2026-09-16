import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Plane, Bus, ChevronDown, ChevronUp, X, Search } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { Modal } from '../components/ui/modal';
import {
  ApiError,
  addDepartureCustomers,
  createExcursion,
  createExcursionDeparture,
  getExcursion,
  getExcursionDeparture,
  listCustomers,
  listExcursions,
  removeDepartureCustomer,
  type ExcursionCustomer,
  type ExcursionDeparture,
  type ExcursionSummary,
  type ExcursionTransportType,
} from '../lib/api';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import type { Customer } from '../types/customer';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; excursions: ExcursionSummary[]; customers: Customer[] };

const emptyNewExcursion = {
  name: '',
  destination: '',
  transportType: 'AEREO' as ExcursionTransportType,
  notes: '',
  airline: '',
  origin: '',
  flightNumber: '',
  cabinClass: '',
  landDescription: '',
  landServiceType: '',
  saleValue: '',
  cost: '',
};

/** Every customer picker in this page shows name + birth date together
 * -- requested directly: "podemos ter várias Amandas... deve vir o
 * nome seguido da data de nascimento... isso torna assertivo". */
function customerLabel(c: Customer): string {
  const birth = c.birthDate ? formatDateBR(c.birthDate, { assumeDateOnly: true }) : null;
  return birth ? `${c.name} — Nasc. ${birth}` : `${c.name} (sem data de nascimento)`;
}

/** Search-driven customer picker -- "os clientes que vão participar
 * dessa excursão deve ser escolhido por busca". */
function CustomerSearchPicker({
  customers,
  excludeIds,
  selectedIds,
  onToggle,
}: {
  customers: Customer[];
  excludeIds: Set<string>;
  selectedIds: Set<string>;
  onToggle: (customerId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return customers
      .filter((c) => !excludeIds.has(c.id))
      .filter((c) => (normalized ? c.name.toLowerCase().includes(normalized) : true));
  }, [customers, excludeIds, query]);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente pelo nome…"
          className="pl-7"
        />
      </div>
      <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
        {filtered.length === 0 ? (
          <p className="px-2 py-1 text-xs text-slate-400">Nenhum cliente encontrado.</p>
        ) : (
          filtered.map((c) => (
            <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => onToggle(c.id)} />
              {customerLabel(c)}
            </label>
          ))
        )}
      </div>
    </div>
  );
}

export function ExcursionsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showNewExcursion, setShowNewExcursion] = useState(false);
  const [newExcursion, setNewExcursion] = useState(emptyNewExcursion);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [expandedExcursionId, setExpandedExcursionId] = useState<string | null>(null);
  const [departures, setDepartures] = useState<ExcursionDeparture[] | null>(null);

  const [showNewDeparture, setShowNewDeparture] = useState(false);
  const [newDepartureExcursionId, setNewDepartureExcursionId] = useState<string | null>(null);
  const [newDeparture, setNewDeparture] = useState({ startDate: '', endDate: '', notes: '' });
  const [departureCustomerIds, setDepartureCustomerIds] = useState<Set<string>>(new Set());

  const [expandedDepartureId, setExpandedDepartureId] = useState<string | null>(null);
  const [roster, setRoster] = useState<ExcursionCustomer[] | null>(null);
  const [showAddCustomers, setShowAddCustomers] = useState(false);
  const [addingCustomerIds, setAddingCustomerIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setState({ status: 'loading' });
    Promise.all([listExcursions(), listCustomers()])
      .then(([excursions, customers]) => setState({ status: 'success', excursions, customers }))
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar as excursões.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadDepartures = useCallback((excursionId: string) => {
    getExcursion(excursionId)
      .then((data) => setDepartures(data.departures))
      .catch(() => setDepartures([]));
  }, []);

  const loadRoster = useCallback((departureId: string) => {
    getExcursionDeparture(departureId)
      .then((data) => setRoster(data.customers))
      .catch(() => setRoster([]));
  }, []);

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Excursões" description="Modelos de viagem em grupo — reutilizáveis, só a data muda a cada uso." />
        <LoadingState label="Carregando excursões…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  const { excursions, customers } = state;

  const handleCreateExcursion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExcursion.name.trim() || !newExcursion.destination.trim()) {
      setFormError('Preencha nome e destino.');
      return;
    }
    if (newExcursion.transportType === 'AEREO' && (!newExcursion.airline.trim() || !newExcursion.origin.trim())) {
      setFormError('Companhia aérea e origem são obrigatórias para excursão aérea.');
      return;
    }
    if (newExcursion.transportType === 'TERRESTRE' && !newExcursion.landDescription.trim()) {
      setFormError('Descrição do serviço é obrigatória para excursão terrestre.');
      return;
    }
    setSaving(true);
    setFormError(null);
    createExcursion({
      name: newExcursion.name.trim(),
      destination: newExcursion.destination.trim(),
      transportType: newExcursion.transportType,
      ...(newExcursion.notes.trim() ? { notes: newExcursion.notes.trim() } : {}),
      ...(newExcursion.transportType === 'AEREO'
        ? {
            airline: newExcursion.airline.trim(),
            origin: newExcursion.origin.trim(),
            ...(newExcursion.flightNumber.trim() ? { flightNumber: newExcursion.flightNumber.trim() } : {}),
            ...(newExcursion.cabinClass.trim() ? { cabinClass: newExcursion.cabinClass.trim() } : {}),
          }
        : {
            landDescription: newExcursion.landDescription.trim(),
            ...(newExcursion.landServiceType.trim() ? { landServiceType: newExcursion.landServiceType.trim() } : {}),
          }),
      ...(newExcursion.saleValue ? { saleValue: Number(newExcursion.saleValue) } : {}),
      ...(newExcursion.cost ? { cost: Number(newExcursion.cost) } : {}),
    })
      .then(() => {
        setShowNewExcursion(false);
        setNewExcursion(emptyNewExcursion);
        load();
      })
      .catch((err: unknown) => setFormError(err instanceof ApiError ? err.message : 'Não foi possível criar a excursão.'))
      .finally(() => setSaving(false));
  };

  const toggleExpandExcursion = (excursionId: string) => {
    if (expandedExcursionId === excursionId) {
      setExpandedExcursionId(null);
      setDepartures(null);
      setExpandedDepartureId(null);
      setRoster(null);
      return;
    }
    setExpandedExcursionId(excursionId);
    setDepartures(null);
    setExpandedDepartureId(null);
    setRoster(null);
    loadDepartures(excursionId);
  };

  const openNewDeparture = (excursionId: string) => {
    setNewDepartureExcursionId(excursionId);
    setNewDeparture({ startDate: '', endDate: '', notes: '' });
    setDepartureCustomerIds(new Set());
    setFormError(null);
    setShowNewDeparture(true);
  };

  const handleCreateDeparture = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDepartureExcursionId || !newDeparture.startDate || !newDeparture.endDate) {
      setFormError('Preencha o período da excursão.');
      return;
    }
    setSaving(true);
    setFormError(null);
    createExcursionDeparture(newDepartureExcursionId, {
      startDate: newDeparture.startDate,
      endDate: newDeparture.endDate,
      ...(newDeparture.notes.trim() ? { notes: newDeparture.notes.trim() } : {}),
      customerIds: Array.from(departureCustomerIds),
    })
      .then(() => {
        setShowNewDeparture(false);
        loadDepartures(newDepartureExcursionId);
        load();
      })
      .catch((err: unknown) => setFormError(err instanceof ApiError ? err.message : 'Não foi possível criar a utilização.'))
      .finally(() => setSaving(false));
  };

  const toggleExpandDeparture = (departureId: string) => {
    if (expandedDepartureId === departureId) {
      setExpandedDepartureId(null);
      setRoster(null);
      return;
    }
    setExpandedDepartureId(departureId);
    setRoster(null);
    loadRoster(departureId);
  };

  const handleRemoveFromRoster = (departureId: string, customerId: string) => {
    removeDepartureCustomer(departureId, customerId)
      .then(() => loadRoster(departureId))
      .catch(() => undefined);
  };

  const handleAddCustomers = (departureId: string) => {
    const ids = Array.from(addingCustomerIds);
    if (ids.length === 0) return;
    addDepartureCustomers(departureId, ids)
      .then(() => {
        setShowAddCustomers(false);
        setAddingCustomerIds(new Set());
        loadRoster(departureId);
      })
      .catch((err: unknown) => setFormError(err instanceof ApiError ? err.message : 'Não foi possível adicionar clientes.'));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Excursões"
        description="Modelo de viagem em grupo reutilizável — cadastre uma vez com destino e configuração; cada uso define apenas o período e os clientes."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Operação' }, { label: 'Excursões' }]}
        actions={
          <Button size="sm" onClick={() => { setFormError(null); setShowNewExcursion(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Excursão
          </Button>
        }
      />

      {excursions.length === 0 ? (
        <EmptyState
          title="Nenhuma excursão cadastrada"
          description="Crie um modelo de excursão para reutilizar em cada grupo que viajar para o mesmo destino."
          action={
            <Button size="sm" onClick={() => setShowNewExcursion(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Excursão
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {excursions.map((exc) => (
            <Card key={exc.id}>
              <CardHeader
                className="flex cursor-pointer flex-row items-center justify-between space-y-0"
                onClick={() => toggleExpandExcursion(exc.id)}
              >
                <div className="flex items-center gap-3">
                  {exc.transportType === 'AEREO' ? (
                    <Plane className="h-4 w-4 text-slate-400" />
                  ) : (
                    <Bus className="h-4 w-4 text-slate-400" />
                  )}
                  <div>
                    <CardTitle>{exc.name}</CardTitle>
                    <p className="text-xs text-slate-500">
                      {exc.destination}
                      {' · '}{exc.departureCount} utilização{exc.departureCount === 1 ? '' : 'ões'}
                      {exc.saleValue !== undefined ? ` · ${formatBRL(exc.saleValue)}/cliente` : ''}
                    </p>
                  </div>
                </div>
                {expandedExcursionId === exc.id ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
              </CardHeader>
              {expandedExcursionId === exc.id ? (
                <CardContent className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-700">Utilizações desta excursão</h4>
                    <Button size="sm" variant="outline" onClick={() => openNewDeparture(exc.id)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Nova Utilização
                    </Button>
                  </div>
                  {departures === null ? (
                    <p className="text-xs text-slate-400">Carregando…</p>
                  ) : departures.length === 0 ? (
                    <p className="text-xs text-slate-400">Nenhuma utilização ainda. Crie uma definindo o período.</p>
                  ) : (
                    <div className="space-y-2">
                      {departures.map((dep) => (
                        <div key={dep.id} className="rounded-md border border-slate-200">
                          <button
                            type="button"
                            onClick={() => toggleExpandDeparture(dep.id)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                          >
                            <span>
                              {formatDateBR(dep.startDate, { assumeDateOnly: true })} – {formatDateBR(dep.endDate, { assumeDateOnly: true })}
                            </span>
                            {expandedDepartureId === dep.id ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                          </button>
                          {expandedDepartureId === dep.id ? (
                            <div className="space-y-2 border-t border-slate-200 p-3">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-medium text-slate-500">Clientes nesta utilização</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => { setAddingCustomerIds(new Set()); setFormError(null); setShowAddCustomers(true); }}
                                >
                                  <Plus className="mr-1 h-3.5 w-3.5" />
                                  Adicionar
                                </Button>
                              </div>
                              {roster === null ? (
                                <p className="text-xs text-slate-400">Carregando…</p>
                              ) : roster.length === 0 ? (
                                <p className="text-xs text-slate-400">Nenhum cliente atribuído ainda.</p>
                              ) : (
                                <ul className="space-y-1">
                                  {roster.map((rc) => (
                                    <li key={rc.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-1.5 text-sm">
                                      <span>
                                        {rc.customerName}
                                        {rc.customerBirthDate ? (
                                          <span className="text-slate-400"> — Nasc. {formatDateBR(rc.customerBirthDate, { assumeDateOnly: true })}</span>
                                        ) : null}
                                      </span>
                                      <button
                                        type="button"
                                        aria-label="Remover da excursão"
                                        onClick={() => handleRemoveFromRoster(dep.id, rc.customerId)}
                                        className="text-slate-400 hover:text-red-600"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}

                              <Modal open={showAddCustomers} onClose={() => setShowAddCustomers(false)} title="Adicionar clientes">
                                <div className="space-y-3">
                                  <CustomerSearchPicker
                                    customers={customers}
                                    excludeIds={new Set((roster ?? []).map((rc) => rc.customerId))}
                                    selectedIds={addingCustomerIds}
                                    onToggle={(id) => setAddingCustomerIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(id)) next.delete(id); else next.add(id);
                                      return next;
                                    })}
                                  />
                                  {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
                                  <div className="flex justify-end gap-2">
                                    <Button type="button" variant="outline" onClick={() => setShowAddCustomers(false)}>Cancelar</Button>
                                    <Button type="button" onClick={() => handleAddCustomers(dep.id)}>
                                      Adicionar {addingCustomerIds.size > 0 ? `(${addingCustomerIds.size})` : ''}
                                    </Button>
                                  </div>
                                </div>
                              </Modal>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <Modal open={showNewExcursion} onClose={() => setShowNewExcursion(false)} title="Nova Excursão">
        <form onSubmit={handleCreateExcursion} className="space-y-3">
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              id="exc-name"
              label="Nome da excursão"
              value={newExcursion.name}
              onChange={(e) => setNewExcursion((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <LabeledInput
              id="exc-destination"
              label="Destino"
              value={newExcursion.destination}
              onChange={(e) => setNewExcursion((f) => ({ ...f, destination: e.target.value }))}
              required
            />
          </div>
          <LabeledSelect
            id="exc-type"
            label="Tipo"
            value={newExcursion.transportType}
            onChange={(e) => setNewExcursion((f) => ({ ...f, transportType: e.target.value as ExcursionTransportType }))}
          >
            <option value="AEREO">Aéreo</option>
            <option value="TERRESTRE">Terrestre</option>
          </LabeledSelect>

          {newExcursion.transportType === 'AEREO' ? (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-slate-200 p-3">
              <LabeledInput
                id="exc-airline"
                label="Companhia aérea"
                value={newExcursion.airline}
                onChange={(e) => setNewExcursion((f) => ({ ...f, airline: e.target.value }))}
                required
              />
              <LabeledInput
                id="exc-origin"
                label="Origem"
                value={newExcursion.origin}
                onChange={(e) => setNewExcursion((f) => ({ ...f, origin: e.target.value }))}
                required
              />
              <LabeledInput
                id="exc-flight"
                label="Nº do voo (opcional)"
                value={newExcursion.flightNumber}
                onChange={(e) => setNewExcursion((f) => ({ ...f, flightNumber: e.target.value }))}
              />
              <LabeledInput
                id="exc-cabin"
                label="Classe (opcional)"
                value={newExcursion.cabinClass}
                onChange={(e) => setNewExcursion((f) => ({ ...f, cabinClass: e.target.value }))}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-slate-200 p-3">
              <LabeledInput
                id="exc-land-desc"
                label="Descrição do serviço"
                value={newExcursion.landDescription}
                onChange={(e) => setNewExcursion((f) => ({ ...f, landDescription: e.target.value }))}
                required
              />
              <LabeledInput
                id="exc-land-type"
                label="Tipo de serviço (opcional)"
                value={newExcursion.landServiceType}
                onChange={(e) => setNewExcursion((f) => ({ ...f, landServiceType: e.target.value }))}
                placeholder="Ex.: HOSPEDAGEM, TRANSFER, PASSEIO"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              id="exc-sale"
              label="Valor por cliente (R$, opcional)"
              type="number"
              step="0.01"
              value={newExcursion.saleValue}
              onChange={(e) => setNewExcursion((f) => ({ ...f, saleValue: e.target.value }))}
            />
            <LabeledInput
              id="exc-cost"
              label="Custo por cliente (R$, opcional)"
              type="number"
              step="0.01"
              value={newExcursion.cost}
              onChange={(e) => setNewExcursion((f) => ({ ...f, cost: e.target.value }))}
            />
          </div>
          <label className="text-xs text-slate-500">
            Observações
            <Input
              value={newExcursion.notes}
              onChange={(e) => setNewExcursion((f) => ({ ...f, notes: e.target.value }))}
              className="mt-1"
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowNewExcursion(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Criando…' : 'Criar Excursão'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={showNewDeparture} onClose={() => setShowNewDeparture(false)} title="Nova Utilização da Excursão">
        <form onSubmit={handleCreateDeparture} className="space-y-3">
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              id="dep-start"
              label="Início"
              type="date"
              value={newDeparture.startDate}
              onChange={(e) => setNewDeparture((f) => ({ ...f, startDate: e.target.value }))}
              required
            />
            <LabeledInput
              id="dep-end"
              label="Fim"
              type="date"
              value={newDeparture.endDate}
              onChange={(e) => setNewDeparture((f) => ({ ...f, endDate: e.target.value }))}
              required
            />
          </div>
          <label className="text-xs text-slate-500">
            Observações desta utilização (opcional)
            <Input
              value={newDeparture.notes}
              onChange={(e) => setNewDeparture((f) => ({ ...f, notes: e.target.value }))}
              className="mt-1"
            />
          </label>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">
              Clientes ({departureCustomerIds.size} selecionado{departureCustomerIds.size === 1 ? '' : 's'})
            </p>
            <CustomerSearchPicker
              customers={customers}
              excludeIds={new Set()}
              selectedIds={departureCustomerIds}
              onToggle={(id) => setDepartureCustomerIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
              })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowNewDeparture(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Criando…' : 'Criar Utilização'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function LabeledInput({
  id,
  label,
  ...rest
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={id}>{label}</label>
      <Input id={id} {...rest} />
    </div>
  );
}

function LabeledSelect({
  id,
  label,
  children,
  ...rest
}: { id: string; label: string; children: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={id}>{label}</label>
      <Select id={id} {...rest}>
        {children}
      </Select>
    </div>
  );
}
