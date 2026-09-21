import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import {
  ApiError,
  archiveCustomerSegment,
  createCustomerSegment,
  getCustomerSegmentResults,
  listCustomerSegments,
  previewCustomerSegment,
  type CustomerSegment,
  type CustomerSegmentScope,
  type FilterDefinition,
  type SegmentCondition,
  type SegmentOperator,
  type SegmentRunResult,
} from '../lib/api';

// Mirrors the backend allowlist in services/api/src/customer-segmentation.ts
// FIELD_REGISTRY -- the UI can only ever select one of these field keys,
// never type an arbitrary field/column name.
interface FieldOption {
  key: string;
  label: string;
  category: 'CLIENTE' | 'COMERCIAL' | 'VIAGENS' | 'FINANCEIRO';
  type: 'STRING' | 'NUMBER' | 'MONEY' | 'DATE' | 'BOOLEAN' | 'ENUM';
  operators: SegmentOperator[];
  enumValues?: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  CLIENTE: 'Cliente',
  COMERCIAL: 'Comercial',
  VIAGENS: 'Viagens',
  FINANCEIRO: 'Financeiro',
};

const OPERATOR_LABELS: Record<SegmentOperator, string> = {
  EQ: 'é', NEQ: 'não é', CONTAINS: 'contém', STARTS_WITH: 'começa com',
  GT: '>', GTE: '>=', LT: '<', LTE: '<=', BETWEEN: 'entre',
  BEFORE: 'antes de', AFTER: 'depois de', LAST_N_DAYS: 'nos últimos (dias)', NEXT_N_DAYS: 'nos próximos (dias)',
  IS_TRUE: 'sim', IS_FALSE: 'não',
  IN: 'em', NOT_IN: 'não em',
  EXISTS: 'sim', NOT_EXISTS: 'não',
};

const FIELDS: FieldOption[] = [
  { key: 'customer.name', label: 'Nome', category: 'CLIENTE', type: 'STRING', operators: ['EQ', 'NEQ', 'CONTAINS', 'STARTS_WITH'] },
  { key: 'customer.protocolNumber', label: 'Protocolo', category: 'CLIENTE', type: 'STRING', operators: ['EQ', 'NEQ', 'CONTAINS', 'STARTS_WITH'] },
  { key: 'customer.city', label: 'Cidade', category: 'CLIENTE', type: 'STRING', operators: ['EQ', 'NEQ', 'CONTAINS', 'STARTS_WITH'] },
  { key: 'customer.state', label: 'Estado', category: 'CLIENTE', type: 'STRING', operators: ['EQ', 'NEQ', 'CONTAINS', 'STARTS_WITH'] },
  { key: 'customer.country', label: 'País', category: 'CLIENTE', type: 'STRING', operators: ['EQ', 'NEQ', 'CONTAINS', 'STARTS_WITH'] },
  { key: 'customer.createdAt', label: 'Data de cadastro', category: 'CLIENTE', type: 'DATE', operators: ['BEFORE', 'AFTER', 'BETWEEN', 'LAST_N_DAYS', 'NEXT_N_DAYS'] },
  { key: 'customer.status', label: 'Status', category: 'CLIENTE', type: 'ENUM', operators: ['EQ', 'IN', 'NOT_IN'], enumValues: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] },
  { key: 'customer.interactionsCount', label: 'Quantidade de interações', category: 'CLIENTE', type: 'NUMBER', operators: ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'BETWEEN'] },
  { key: 'customer.daysSinceLastContact', label: 'Dias sem contato (último contato)', category: 'CLIENTE', type: 'NUMBER', operators: ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'BETWEEN'] },
  { key: 'commercial.hasWish', label: 'Possui Wish', category: 'COMERCIAL', type: 'BOOLEAN', operators: ['IS_TRUE', 'IS_FALSE'] },
  { key: 'commercial.wishDestination', label: 'Destino/interesse do Wish', category: 'COMERCIAL', type: 'STRING', operators: ['CONTAINS'] },
  { key: 'commercial.hasActiveProposal', label: 'Possui proposta ativa', category: 'COMERCIAL', type: 'BOOLEAN', operators: ['IS_TRUE', 'IS_FALSE'] },
  { key: 'commercial.proposalStatus', label: 'Status da proposta', category: 'COMERCIAL', type: 'ENUM', operators: ['EQ'], enumValues: ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'] },
  { key: 'commercial.proposalValue', label: 'Valor da proposta', category: 'COMERCIAL', type: 'MONEY', operators: ['GT', 'GTE', 'LT', 'LTE', 'BETWEEN'] },
  { key: 'commercial.proposalsCount', label: 'Quantidade de propostas', category: 'COMERCIAL', type: 'NUMBER', operators: ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'BETWEEN'] },
  { key: 'trip.hasFuture', label: 'Possui viagem futura', category: 'VIAGENS', type: 'BOOLEAN', operators: ['IS_TRUE', 'IS_FALSE'] },
  { key: 'trip.nextDeparture', label: 'Data da próxima viagem', category: 'VIAGENS', type: 'DATE', operators: ['BEFORE', 'AFTER', 'BETWEEN', 'LAST_N_DAYS', 'NEXT_N_DAYS'] },
  { key: 'trip.lastTrip', label: 'Última viagem', category: 'VIAGENS', type: 'DATE', operators: ['BEFORE', 'AFTER', 'BETWEEN', 'LAST_N_DAYS', 'NEXT_N_DAYS'] },
  { key: 'trip.destination', label: 'Destino', category: 'VIAGENS', type: 'STRING', operators: ['CONTAINS'] },
  { key: 'trip.category', label: 'Tipo de viagem', category: 'VIAGENS', type: 'ENUM', operators: ['EQ', 'IN', 'NOT_IN'], enumValues: ['AIR', 'LAND', 'EXCURSION'] },
  { key: 'trip.count', label: 'Quantidade de viagens', category: 'VIAGENS', type: 'NUMBER', operators: ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'BETWEEN'] },
  { key: 'trip.totalValue', label: 'Total histórico de viagens', category: 'VIAGENS', type: 'MONEY', operators: ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'BETWEEN'] },
  { key: 'trip.hasMissingDocument', label: 'Documentação pendente', category: 'VIAGENS', type: 'BOOLEAN', operators: ['IS_TRUE', 'IS_FALSE'] },
  { key: 'financial.totalPurchased', label: 'Total comprado', category: 'FINANCEIRO', type: 'MONEY', operators: ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'BETWEEN'] },
  { key: 'financial.averageTicket', label: 'Ticket médio', category: 'FINANCEIRO', type: 'MONEY', operators: ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'BETWEEN'] },
  { key: 'financial.hasOpenBalance', label: 'Possui saldo em aberto', category: 'FINANCEIRO', type: 'BOOLEAN', operators: ['IS_TRUE', 'IS_FALSE'] },
  { key: 'financial.hasOverdueReceivable', label: 'Possui recebível vencido', category: 'FINANCEIRO', type: 'BOOLEAN', operators: ['IS_TRUE', 'IS_FALSE'] },
];

function fieldByKey(key: string): FieldOption {
  return FIELDS.find((f) => f.key === key) ?? FIELDS[0]!;
}

// Row shape used only by the editor UI -- translated into a flat, single-level
// FilterDefinition group (no UI nesting; the DSL supports nesting but this
// phase's UI deliberately keeps to one flat AND/OR group, per the spec's
// "evitar formulário gigante" guidance).
interface ConditionRow {
  key: string;
  field: string;
  operator: SegmentOperator;
  value: string;
  value2: string;
}

function newRow(): ConditionRow {
  const field = FIELDS[0]!;
  return { key: crypto.randomUUID(), field: field.key, operator: field.operators[0]!, value: '', value2: '' };
}

function rowsToFilterDefinition(groupOperator: 'AND' | 'OR', rows: ConditionRow[]): FilterDefinition {
  const conditions: SegmentCondition[] = rows.map((row) => {
    const def = fieldByKey(row.field);
    const value = coerceValue(def, row.operator, row.value, row.value2);
    return value === undefined ? { field: row.field, operator: row.operator } : { field: row.field, operator: row.operator, value };
  });
  return { operator: groupOperator, conditions };
}

function coerceValue(def: FieldOption, operator: SegmentOperator, raw: string, raw2: string): unknown {
  if (operator === 'IS_TRUE' || operator === 'IS_FALSE' || operator === 'EXISTS' || operator === 'NOT_EXISTS') {
    return undefined;
  }
  if (operator === 'BETWEEN') {
    if (def.type === 'DATE') return [raw, raw2];
    return [Number(raw), Number(raw2)];
  }
  if (operator === 'IN' || operator === 'NOT_IN') {
    return raw.split(',').map((v) => v.trim()).filter(Boolean);
  }
  if (def.type === 'NUMBER' || def.type === 'MONEY') {
    return Number(raw);
  }
  return raw;
}

export function SegmentsPage() {
  const [segments, setSegments] = useState<CustomerSegment[] | null>(null);
  const [segmentCounts, setSegmentCounts] = useState<Record<string, number | null>>({});
  const [selectedSegment, setSelectedSegment] = useState<CustomerSegment | null>(null);
  const [selectedResults, setSelectedResults] = useState<SegmentRunResult | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const load = useCallback(() => {
    listCustomerSegments()
      .then(setSegments)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os segmentos.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!segments || segments.length === 0) {
      setSegmentCounts({});
      return;
    }
    let cancelled = false;
    segments.forEach((segment) => {
      getCustomerSegmentResults(segment.id, 1, 1)
        .then((result) => {
          if (cancelled) return;
          setSegmentCounts((current) => ({ ...current, [segment.id]: result.total }));
        })
        .catch(() => {
          if (cancelled) return;
          setSegmentCounts((current) => ({ ...current, [segment.id]: null }));
        });
    });
    return () => {
      cancelled = true;
    };
  }, [segments]);

  const sharedCount = segments?.filter((s) => s.scope === 'SHARED').length ?? 0;

  async function handleArchive(id: string) {
    try {
      await archiveCustomerSegment(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível arquivar o segmento.');
    }
  }

  async function handleViewResults(segment: CustomerSegment) {
    setSelectedSegment(segment);
    setSelectedResults(null);
    setResultsLoading(true);
    setError(null);
    try {
      const result = await getCustomerSegmentResults(segment.id, 1, 25);
      setSelectedResults(result);
      setSegmentCounts((current) => ({ ...current, [segment.id]: result.total }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os resultados do segmento.');
    } finally {
      setResultsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Segmentação de Clientes"
        description="Crie filtros avançados reutilizáveis sobre a base de clientes. Segmentos salvam regras -- o resultado é sempre recalculado sobre a base atual."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Comercial' }, { label: 'Segmentação' }]}
        actions={
          <Button onClick={() => setShowEditor(true)}>
            <Plus className="mr-2 h-4 w-4" /> Novo segmento
          </Button>
        }
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Segmentos salvos" value={segments?.length ?? '—'} />
        <SummaryCard label="Segmentos compartilhados" value={sharedCount} />
        <SummaryCard label="Segmentos pessoais" value={(segments?.length ?? 0) - sharedCount} />
      </div>

      {showEditor && (
        <SegmentEditor
          onClose={() => setShowEditor(false)}
          onSaved={() => {
            setShowEditor(false);
            load();
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Meus segmentos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!segments ? (
            <LoadingState label="Carregando segmentos…" />
          ) : segments.length === 0 ? (
            <EmptyState title="Nenhum segmento criado" description="Crie o primeiro segmento para começar a filtrar sua base de clientes." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-600">
                  <th className="px-6 py-2">Nome</th>
                  <th className="px-6 py-2">Tipo</th>
                  <th className="px-6 py-2">Condições</th>
                  <th className="px-6 py-2">Clientes encontrados</th>
                  <th className="px-6 py-2">Atualizado</th>
                  <th className="px-6 py-2" />
                </tr>
              </thead>
              <tbody>
                {segments.map((segment) => (
                  <SegmentRow
                    key={segment.id}
                    segment={segment}
                    count={segmentCounts[segment.id]}
                    onViewResults={() => { void handleViewResults(segment); }}
                    onArchive={() => { void handleArchive(segment.id); }}
                  />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {selectedSegment && (
        <Card>
          <CardHeader>
            <CardTitle>Resultados do segmento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">{selectedSegment.name}</p>
                {selectedResults && (
                  <p className="text-sm text-slate-600">{selectedResults.total} cliente(s) encontrado(s)</p>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => setSelectedSegment(null)}>
                Fechar
              </Button>
            </div>

            {resultsLoading ? (
              <LoadingState label="Carregando resultados..." />
            ) : selectedResults && selectedResults.customers.length === 0 ? (
              <EmptyState title="Nenhum cliente encontrado" description="Este segmento não encontrou clientes na base atual." />
            ) : selectedResults ? (
              <SegmentResultsTable result={selectedResults} />
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SegmentRow({
  segment,
  count,
  onViewResults,
  onArchive,
}: {
  segment: CustomerSegment;
  count: number | null | undefined;
  onViewResults: () => void;
  onArchive: () => void;
}) {
  const conditionCount = countConditions(segment.filterDefinition);
  return (
    <tr className="border-b">
      <td className="px-6 py-2 font-medium">{segment.name}</td>
      <td className="px-6 py-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${segment.scope === 'SHARED' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
          {segment.scope === 'SHARED' ? 'Compartilhado' : 'Pessoal'}
        </span>
      </td>
      <td className="px-6 py-2 text-slate-600">{conditionCount} condição(ões)</td>
      <td className="px-6 py-2 text-slate-600">
        {count === undefined ? 'Calculando...' : count === null ? 'Erro' : `${count} clientes`}
      </td>
      <td className="px-6 py-2 text-xs text-slate-600">{new Date(segment.updatedAt).toLocaleDateString('pt-BR')}</td>
      <td className="px-6 py-2 text-right">
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onViewResults}>
            <Eye className="h-4 w-4" />
            Ver resultados
          </Button>
          <Button size="sm" variant="outline" aria-label={`Arquivar ${segment.name}`} onClick={onArchive}>
          <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function SegmentResultsTable({ result }: { result: SegmentRunResult }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-slate-600">
          <th className="py-2">Cliente</th>
          <th className="py-2">Cidade</th>
          <th className="py-2">Último contato</th>
          <th className="py-2">Próxima viagem</th>
          <th className="py-2">Ticket médio</th>
        </tr>
      </thead>
      <tbody>
        {result.customers.map((customer) => (
          <tr key={customer.id} className="border-b">
            <td className="py-2">
              <Link to={`/customers/${customer.id}`} className="font-medium text-slate-900 hover:underline">
                {customer.name}
              </Link>
            </td>
            <td className="py-2">{customer.city ?? '-'}</td>
            <td className="py-2">{customer.lastContactAt ? new Date(customer.lastContactAt).toLocaleDateString('pt-BR') : '-'}</td>
            <td className="py-2">{customer.nextDeparture ? new Date(customer.nextDeparture).toLocaleDateString('pt-BR') : '-'}</td>
            <td className="py-2">{customer.averageTicket.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function countConditions(def: FilterDefinition): number {
  return def.conditions.reduce((total: number, node) => {
    if ('conditions' in node) return total + countConditions(node);
    return total + 1;
  }, 0);
}

function SegmentEditor({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<CustomerSegmentScope>('PERSONAL');
  const [groupOperator, setGroupOperator] = useState<'AND' | 'OR'>('AND');
  const [rows, setRows] = useState<ConditionRow[]>([newRow()]);
  const [preview, setPreview] = useState<SegmentRunResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(key: string, patch: Partial<ConditionRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function handleFieldChange(key: string, fieldKey: string) {
    const def = fieldByKey(fieldKey);
    updateRow(key, { field: fieldKey, operator: def.operators[0]!, value: '', value2: '' });
  }

  function handlePreview() {
    setPreviewing(true);
    setError(null);
    previewCustomerSegment(rowsToFilterDefinition(groupOperator, rows), 1, 10)
      .then(setPreview)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Não foi possível pré-visualizar o segmento.'))
      .finally(() => setPreviewing(false));
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Informe um nome para o segmento.');
      return;
    }
    setSaving(true);
    setError(null);
    createCustomerSegment({
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      scope,
      filterDefinition: rowsToFilterDefinition(groupOperator, rows),
    })
      .then(onSaved)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Não foi possível salvar o segmento.'))
      .finally(() => setSaving(false));
  }

  const categorized = FIELDS.reduce<Record<string, FieldOption[]>>((acc, field) => {
    (acc[field.category] ??= []).push(field);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Novo segmento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <LabeledInput label="Nome do segmento" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Famílias — Praia — Ticket 10k+" />
          <LabeledInput label="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <LabeledSelect label="Visibilidade" value={scope} onChange={(e) => setScope(e.target.value as CustomerSegmentScope)}>
            <option value="PERSONAL">Pessoal</option>
            <option value="SHARED">Compartilhado (equipe)</option>
          </LabeledSelect>
        </div>

        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Combinar condições com:</span>
            <LabeledSelect label="" value={groupOperator} onChange={(e) => setGroupOperator(e.target.value as 'AND' | 'OR')}>
              <option value="AND">E (todas as condições)</option>
              <option value="OR">OU (qualquer condição)</option>
            </LabeledSelect>
          </div>

          <div className="space-y-2">
            {rows.map((row) => {
              const def = fieldByKey(row.field);
              return (
                <div key={row.key} className="flex flex-wrap items-end gap-2 rounded-md bg-slate-50 p-2">
                  <LabeledSelect label="Campo" value={row.field} onChange={(e) => handleFieldChange(row.key, e.target.value)}>
                    {Object.entries(categorized).map(([category, fields]) => (
                      <optgroup key={category} label={CATEGORY_LABELS[category] ?? category}>
                        {fields.map((f) => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </LabeledSelect>
                  <LabeledSelect label="Operador" value={row.operator} onChange={(e) => updateRow(row.key, { operator: e.target.value as SegmentOperator })}>
                    {def.operators.map((op) => (
                      <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                    ))}
                  </LabeledSelect>
                  <ValueInput def={def} row={row} onChange={(patch) => updateRow(row.key, patch)} />
                  <Button size="sm" variant="ghost" onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>

          <Button size="sm" variant="outline" className="mt-3" onClick={() => setRows((current) => [...current, newRow()])}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar condição
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handlePreview} disabled={previewing}>
            {previewing ? 'Calculando…' : 'Pré-visualizar'}
          </Button>
          {preview && <span className="text-sm font-medium text-slate-700">{preview.total} cliente(s) encontrado(s)</span>}
        </div>

        {preview && preview.customers.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-600">
                <th className="py-1">Cliente</th>
                <th className="py-1">Cidade</th>
                <th className="py-1">Último contato</th>
                <th className="py-1">Próxima viagem</th>
                <th className="py-1">Ticket médio</th>
              </tr>
            </thead>
            <tbody>
              {preview.customers.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="py-1">{c.name}</td>
                  <td className="py-1">{c.city ?? '-'}</td>
                  <td className="py-1">{c.lastContactAt ? new Date(c.lastContactAt).toLocaleDateString('pt-BR') : '-'}</td>
                  <td className="py-1">{c.nextDeparture ? new Date(c.nextDeparture).toLocaleDateString('pt-BR') : '-'}</td>
                  <td className="py-1">{c.averageTicket.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando…' : 'Salvar segmento'}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ValueInput({
  def,
  row,
  onChange,
}: {
  def: FieldOption;
  row: ConditionRow;
  onChange: (patch: Partial<ConditionRow>) => void;
}) {
  if (row.operator === 'IS_TRUE' || row.operator === 'IS_FALSE' || row.operator === 'EXISTS' || row.operator === 'NOT_EXISTS') {
    return null;
  }
  if (row.operator === 'BETWEEN') {
    const inputType = def.type === 'DATE' ? 'date' : 'number';
    return (
      <>
        <LabeledInput label="De" type={inputType} value={row.value} onChange={(e) => onChange({ value: e.target.value })} />
        <LabeledInput label="Até" type={inputType} value={row.value2} onChange={(e) => onChange({ value2: e.target.value })} />
      </>
    );
  }
  if (def.type === 'ENUM' && def.enumValues && (row.operator === 'EQ' || row.operator === 'IN' || row.operator === 'NOT_IN')) {
    return (
      <LabeledSelect label="Valor" value={row.value} onChange={(e) => onChange({ value: e.target.value })}>
        <option value="">Selecione</option>
        {def.enumValues.map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </LabeledSelect>
    );
  }
  if (def.type === 'DATE') {
    if (row.operator === 'LAST_N_DAYS' || row.operator === 'NEXT_N_DAYS') {
      return <LabeledInput label="Dias" type="number" value={row.value} onChange={(e) => onChange({ value: e.target.value })} />;
    }
    return <LabeledInput label="Valor" type="date" value={row.value} onChange={(e) => onChange({ value: e.target.value })} />;
  }
  if (def.type === 'NUMBER' || def.type === 'MONEY') {
    return <LabeledInput label="Valor" type="number" step="0.01" value={row.value} onChange={(e) => onChange({ value: e.target.value })} />;
  }
  return <LabeledInput label="Valor" value={row.value} onChange={(e) => onChange({ value: e.target.value })} />;
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}

function LabeledInput({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <Input {...rest} />
    </div>
  );
}

function LabeledSelect({
  label,
  children,
  ...rest
}: { label: string; children: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" {...rest}>
        {children}
      </select>
    </div>
  );
}
