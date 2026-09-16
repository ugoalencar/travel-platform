import { useCallback, useEffect, useState } from 'react';
import { Plus, Plane, Bus, ChevronDown, ChevronUp, X } from 'lucide-react';
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
  addExcursionCustomers,
  createExcursion,
  listCustomers,
  listExcursions,
  removeExcursionCustomer,
  getExcursion,
  type ExcursionCustomer,
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
  startDate: '',
  endDate: '',
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

export function ExcursionsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showNewExcursion, setShowNewExcursion] = useState(false);
  const [newExcursion, setNewExcursion] = useState(emptyNewExcursion);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [roster, setRoster] = useState<ExcursionCustomer[] | null>(null);
  const [addingCustomerIds, setAddingCustomerIds] = useState<Set<string>>(new Set());
  const [showAddCustomers, setShowAddCustomers] = useState(false);

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

  const loadRoster = useCallback((excursionId: string) => {
    getExcursion(excursionId)
      .then((data) => setRoster(data.customers))
      .catch(() => setRoster([]));
  }, []);

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Excursões" description="Viagens em grupo — configure uma vez, atribua os clientes." />
        <LoadingState label="Carregando excursões…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  const { excursions, customers } = state;
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? id.slice(0, 8);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExcursion.name.trim() || !newExcursion.destination.trim() || !newExcursion.startDate || !newExcursion.endDate) {
      setFormError('Preencha nome, destino e as datas.');
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
      startDate: newExcursion.startDate,
      endDate: newExcursion.endDate,
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
      customerIds: Array.from(selectedCustomerIds),
    })
      .then(() => {
        setShowNewExcursion(false);
        setNewExcursion(emptyNewExcursion);
        setSelectedCustomerIds(new Set());
        load();
      })
      .catch((err: unknown) => setFormError(err instanceof ApiError ? err.message : 'Não foi possível criar a excursão.'))
      .finally(() => setSaving(false));
  };

  const toggleExpand = (excursionId: string) => {
    if (expandedId === excursionId) {
      setExpandedId(null);
      setRoster(null);
      return;
    }
    setExpandedId(excursionId);
    setRoster(null);
    loadRoster(excursionId);
  };

  const handleRemoveFromRoster = (excursionId: string, customerId: string) => {
    removeExcursionCustomer(excursionId, customerId)
      .then(() => {
        loadRoster(excursionId);
        load();
      })
      .catch(() => undefined);
  };

  const handleAddCustomers = (excursionId: string) => {
    const ids = Array.from(addingCustomerIds);
    if (ids.length === 0) return;
    addExcursionCustomers(excursionId, ids)
      .then(() => {
        setShowAddCustomers(false);
        setAddingCustomerIds(new Set());
        loadRoster(excursionId);
        load();
      })
      .catch((err: unknown) => setFormError(err instanceof ApiError ? err.message : 'Não foi possível adicionar clientes.'));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Excursões"
        description="Viagens em grupo para o mesmo destino — configure a viagem uma vez e atribua os clientes; todos recebem a mesma configuração de uma vez, em vez de repetir a montagem para cada um."
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
          description="Crie uma excursão para agrupar vários clientes na mesma viagem."
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
                onClick={() => toggleExpand(exc.id)}
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
                      {exc.destination} · {formatDateBR(exc.startDate, { assumeDateOnly: true })} – {formatDateBR(exc.endDate, { assumeDateOnly: true })}
                      {' · '}{exc.customerCount} cliente{exc.customerCount === 1 ? '' : 's'}
                      {exc.saleValue !== undefined ? ` · ${formatBRL(exc.saleValue)}/cliente` : ''}
                    </p>
                  </div>
                </div>
                {expandedId === exc.id ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
              </CardHeader>
              {expandedId === exc.id ? (
                <CardContent className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-700">Clientes na excursão</h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setAddingCustomerIds(new Set()); setShowAddCustomers(true); }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar clientes
                    </Button>
                  </div>
                  {roster === null ? (
                    <p className="text-xs text-slate-400">Carregando…</p>
                  ) : roster.length === 0 ? (
                    <p className="text-xs text-slate-400">Nenhum cliente atribuído ainda.</p>
                  ) : (
                    <ul className="space-y-1">
                      {roster.map((rc) => (
                        <li key={rc.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                          <span>{rc.customerName ?? customerName(rc.customerId)}</span>
                          <button
                            type="button"
                            aria-label="Remover da excursão"
                            onClick={() => handleRemoveFromRoster(exc.id, rc.customerId)}
                            className="text-slate-400 hover:text-red-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <Modal open={showAddCustomers} onClose={() => setShowAddCustomers(false)} title="Adicionar clientes à excursão">
                    <div className="space-y-3">
                      <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                        {customers
                          .filter((c) => !(roster ?? []).some((rc) => rc.customerId === c.id))
                          .map((c) => (
                            <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                              <input
                                type="checkbox"
                                checked={addingCustomerIds.has(c.id)}
                                onChange={(e) => {
                                  setAddingCustomerIds((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(c.id); else next.delete(c.id);
                                    return next;
                                  });
                                }}
                              />
                              {c.name}
                            </label>
                          ))}
                      </div>
                      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setShowAddCustomers(false)}>Cancelar</Button>
                        <Button type="button" onClick={() => handleAddCustomers(exc.id)}>
                          Adicionar {addingCustomerIds.size > 0 ? `(${addingCustomerIds.size})` : ''}
                        </Button>
                      </div>
                    </div>
                  </Modal>
                </CardContent>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <Modal open={showNewExcursion} onClose={() => setShowNewExcursion(false)} title="Nova Excursão">
        <form onSubmit={handleCreate} className="space-y-3">
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
          <div className="grid grid-cols-3 gap-3">
            <LabeledSelect
              id="exc-type"
              label="Tipo"
              value={newExcursion.transportType}
              onChange={(e) => setNewExcursion((f) => ({ ...f, transportType: e.target.value as ExcursionTransportType }))}
            >
              <option value="AEREO">Aéreo</option>
              <option value="TERRESTRE">Terrestre</option>
            </LabeledSelect>
            <LabeledInput
              id="exc-start"
              label="Início"
              type="date"
              value={newExcursion.startDate}
              onChange={(e) => setNewExcursion((f) => ({ ...f, startDate: e.target.value }))}
              required
            />
            <LabeledInput
              id="exc-end"
              label="Fim"
              type="date"
              value={newExcursion.endDate}
              onChange={(e) => setNewExcursion((f) => ({ ...f, endDate: e.target.value }))}
              required
            />
          </div>

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

          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">
              Clientes ({selectedCustomerIds.size} selecionado{selectedCustomerIds.size === 1 ? '' : 's'})
            </p>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
              {customers.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selectedCustomerIds.has(c.id)}
                    onChange={(e) => {
                      setSelectedCustomerIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(c.id); else next.delete(c.id);
                        return next;
                      });
                    }}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowNewExcursion(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Criando…' : 'Criar Excursão'}</Button>
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
