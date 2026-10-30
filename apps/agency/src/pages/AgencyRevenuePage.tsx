import {RevenueBatchesPanel} from '../components/sales/RevenueBatchesPanel';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { api } from '../lib/api';
import { listSaleCategories, listSuppliers, type SaleCategory, type Supplier } from '../lib/api';

type RevenueMode = 'PERCENTAGE' | 'FIXED_PER_PASSENGER' | 'FIXED_PER_SALE' | 'FIXED_PER_ITEM' | 'NONE';
type BaseSelector = 'LINE_TOTAL' | 'NET_FARE' | 'TAXES' | 'FEES' | 'TAXES_AND_FEES' | 'MARGIN';
type EntitlementEvent = 'ON_SALE_CONFIRMATION' | 'ON_FULL_SETTLEMENT' | 'ON_BALANCE_DEADLINE';
type CollectionModel = 'AGENCY_COLLECTS' | 'SUPPLIER_COLLECTS';

interface Rule {
  id: string;
  mode: RevenueMode;
  base_selector: BaseSelector | null;
  value: number;
  effective_from: string;
  version_number: number;
  entitlement_event: EntitlementEvent;
  collection_model: CollectionModel;
  supplier_id: string | null;
  product_id: string | null;
  category_id: string | null;
}

interface Entry {
  id: string;
  sale_id?: string;
  sale_item_id: string;
  supplier_id: string | null;
  product_id?: string | null;
  category_id?: string | null;
  rule_version_id: string | null;
  status: string;
  entitlement_event: string | null;
  amount: number;
  base_amount: number;
  received_amount: number | null;
  memory: Record<string, unknown>;
}

interface SaleRevenue {
  entries: Entry[];
  totals: { forecast?: number; entitled?: number; expected?: number; received?: number; difference?: number; pendingRule?: number };
  // The API omits commission analysis fields for users without personnel permission.
  analysis?: { agencyRevenue: number; employeeCommission?: number; difference?: number };
}

interface RuleDraft {
  supplierId: string;
  productId: string;
  categoryId: string;
  mode: RevenueMode;
  baseSelector: BaseSelector | '';
  value: string;
  entitlementEvent: EntitlementEvent;
  balanceDeadlineDays: string;
  collectionModel: CollectionModel;
  effectiveFrom: string;
  reason: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_RULE: 'Pendente de regra', FORECAST: 'Prevista', ENTITLED: 'Direito constituído',
  AVAILABLE: 'Disponível', RECEIVED: 'Recebida do fornecedor', CANCELLED: 'Cancelada',
};
const MODES: Array<[RevenueMode, string]> = [
  ['PERCENTAGE', 'Percentual'], ['FIXED_PER_PASSENGER', 'Valor por passageiro'],
  ['FIXED_PER_SALE', 'Valor por venda'], ['FIXED_PER_ITEM', 'Valor por item'], ['NONE', 'Sem receita'],
];
const BASES: Array<[BaseSelector, string]> = [
  ['LINE_TOTAL', 'Total da linha'], ['NET_FARE', 'Tarifa líquida'], ['TAXES', 'Taxas'],
  ['FEES', 'Encargos'], ['TAXES_AND_FEES', 'Taxas e encargos'], ['MARGIN', 'Margem'],
];
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const emptyRule = (): RuleDraft => ({
  supplierId: '', productId: '', categoryId: '', mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL',
  value: '', entitlementEvent: 'ON_FULL_SETTLEMENT', balanceDeadlineDays: '0', collectionModel: 'AGENCY_COLLECTS',
  effectiveFrom: today(), reason: '',
});
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const fieldClass = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm';

/** Revenue owed to the agency by suppliers; employee commission remains a separate obligation. */
export function AgencyRevenuePage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<SaleCategory[]>([]);
  const [filters, setFilters] = useState({ saleId: '', status: '', supplierId: '', categoryId: '' });
  const [saleId, setSaleId] = useState('');
  const [revenue, setRevenue] = useState<SaleRevenue | null>(null);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(emptyRule);
  const [receiveInputs, setReceiveInputs] = useState<Record<string, { amount: string; reference: string }>>({});
  const [reactivateReasons, setReactivateReasons] = useState<Record<string, string>>({});
  const [cancelConfirmation, setCancelConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadRules = useCallback(async () => {
    const { data } = await api.get<{ rules: Rule[] }>('/agency-revenue/rules');
    setRules(data.rules);
  }, []);

  const loadEntries = useCallback(async (filterValues: typeof filters) => {
    const query = new URLSearchParams(Object.entries(filterValues).filter(([, value]) => value.trim() !== ''));
    const suffix = query.size ? `?${query.toString()}` : '';
    const { data } = await api.get<{ entries: Entry[] }>(`/agency-revenue/entries${suffix}`);
    setEntries(data.entries);
  }, []);

  useEffect(() => {
    void Promise.all([listSuppliers(), listSaleCategories()]).then(([supplierList, categoryList]) => {
      setSuppliers(supplierList);
      setCategories(categoryList);
    }).catch(() => setError('Não foi possível carregar fornecedores e categorias.'));
    void loadRules().catch(() => setError('Não foi possível carregar as regras de receita.'));
    void loadEntries({ saleId: '', status: '', supplierId: '', categoryId: '' }).catch(() => setError('Não foi possível carregar as entradas de receita.'));
  }, [loadEntries, loadRules]);

  async function loadSale(targetSaleId = saleId) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const { data } = await api.get<SaleRevenue>(`/sales/${encodeURIComponent(targetSaleId.trim())}/agency-revenue`);
      setRevenue(data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível consultar a venda.'); }
    finally { setBusy(false); }
  }

  async function calculate() {
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.post(`/sales/${encodeURIComponent(saleId.trim())}/agency-revenue/calculate`);
      await loadSale();
      await loadEntries(filters);
      setNotice('Cálculo de receita atualizado.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível calcular a receita.'); }
    finally { setBusy(false); }
  }

  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try {
      await api.post('/agency-revenue/rules', {
        supplierId: ruleDraft.supplierId.trim() || null,
        productId: ruleDraft.productId.trim() || null,
        categoryId: ruleDraft.categoryId.trim() || null,
        mode: ruleDraft.mode,
        baseSelector: ruleDraft.mode === 'PERCENTAGE' ? ruleDraft.baseSelector : null,
        value: ruleDraft.mode === 'NONE' ? 0 : Number(ruleDraft.value),
        entitlementEvent: ruleDraft.entitlementEvent,
        balanceDeadlineDays: ruleDraft.entitlementEvent === 'ON_BALANCE_DEADLINE' ? Number(ruleDraft.balanceDeadlineDays) : 0,
        collectionModel: ruleDraft.collectionModel,
        effectiveFrom: ruleDraft.effectiveFrom,
        reason: ruleDraft.reason.trim(),
      });
      await loadRules();
      setRuleDraft(emptyRule());
      setNotice('Nova versão da regra criada.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível criar a regra.'); }
    finally { setBusy(false); }
  }

  async function runEntryAction(entry: Entry, action: 'receive' | 'cancel' | 'reactivate') {
    setBusy(true); setError(null); setNotice(null);
    try {
      const base = `/agency-revenue/entries/${encodeURIComponent(entry.id)}`;
      if (action === 'receive') {
        const input = receiveInputs[entry.id] ?? { amount: '', reference: '' };
        const amount = Number(input.amount);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Informe um valor recebido maior que zero.');
        await api.post(`${base}/receive`, { amount, reference: input.reference.trim() || null });
      } else if (action === 'cancel') {
        await api.post(`${base}/cancel`);
        setCancelConfirmation(null);
      } else {
        const reason = (reactivateReasons[entry.id] ?? '').trim();
        if (reason.length < 1 || reason.length > 128) throw new Error('O motivo deve ter de 1 a 128 caracteres.');
        await api.post(`${base}/reactivate`, { reason });
        setReactivateReasons((current) => ({ ...current, [entry.id]: '' }));
      }
      await loadSale();
      await loadEntries(filters);
      setNotice(action === 'receive' ? 'Recebimento registrado.' : action === 'cancel' ? 'Entrada cancelada.' : 'Entrada reativada.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar a entrada.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Receita da agência" />
      <Card>
        <CardHeader><CardTitle>Regras de receita</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {rules.length === 0 ? <p className="text-sm text-slate-500">Nenhuma regra cadastrada.</p> : (
            <ul className="space-y-2 text-sm text-slate-700">
              {rules.map((rule) => <li key={rule.id} className="rounded-md border border-slate-200 p-3">
                v{rule.version_number} · {rule.mode}{rule.base_selector ? ` · ${rule.base_selector}` : ''} · {rule.value}{rule.mode === 'PERCENTAGE' ? '%' : ''}
                {' · '}vigência {rule.effective_from} · {rule.entitlement_event} · {rule.collection_model}
                <span className="block text-xs text-slate-500">Fornecedor: {suppliers.find((item) => item.id === rule.supplier_id)?.name ?? (rule.supplier_id ? 'Fornecedor cadastrado' : 'todos')} · Categoria: {categories.find((item) => item.id === rule.category_id)?.name ?? (rule.category_id ? 'Categoria cadastrada' : 'todas')}</span>
              </li>)}
            </ul>
          )}
          <details>
            <summary className="cursor-pointer text-sm font-medium text-slate-700">Criar regra ou nova versão</summary>
            <form onSubmit={(event) => void createRule(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-600">Fornecedor (opcional)<select className={fieldClass} value={ruleDraft.supplierId} onChange={(e) => setRuleDraft({ ...ruleDraft, supplierId: e.target.value })}><option value="">Todos os fornecedores</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
              <label className="text-xs text-slate-600">Categoria da venda (opcional)<select className={fieldClass} value={ruleDraft.categoryId} onChange={(e) => setRuleDraft({ ...ruleDraft, categoryId: e.target.value })}><option value="">Todas as categorias</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label className="text-xs text-slate-600">Modo<select className={fieldClass} value={ruleDraft.mode} onChange={(e) => setRuleDraft({ ...ruleDraft, mode: e.target.value as RevenueMode })}>{MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {ruleDraft.mode === 'PERCENTAGE' && <label className="text-xs text-slate-600">Base<select className={fieldClass} value={ruleDraft.baseSelector} onChange={(e) => setRuleDraft({ ...ruleDraft, baseSelector: e.target.value as BaseSelector })}>{BASES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
              {ruleDraft.mode !== 'NONE' && <label className="text-xs text-slate-600">{ruleDraft.mode === 'PERCENTAGE' ? 'Percentual' : 'Valor (R$)'}<input className={fieldClass} type="number" min="0" max={ruleDraft.mode === 'PERCENTAGE' ? 100 : undefined} step="0.01" required value={ruleDraft.value} onChange={(e) => setRuleDraft({ ...ruleDraft, value: e.target.value })} /></label>}
              <label className="text-xs text-slate-600">Evento de direito<select className={fieldClass} value={ruleDraft.entitlementEvent} onChange={(e) => setRuleDraft({ ...ruleDraft, entitlementEvent: e.target.value as EntitlementEvent })}><option value="ON_SALE_CONFIRMATION">Confirmação da venda</option><option value="ON_FULL_SETTLEMENT">Quitação</option><option value="ON_BALANCE_DEADLINE">Prazo do saldo</option></select></label>
              {ruleDraft.entitlementEvent === 'ON_BALANCE_DEADLINE' && <label className="text-xs text-slate-600">Dias antes da viagem (0 a 365)<input className={fieldClass} type="number" min="0" max="365" step="1" required value={ruleDraft.balanceDeadlineDays} onChange={(e) => setRuleDraft({ ...ruleDraft, balanceDeadlineDays: e.target.value })} /></label>}
              <label className="text-xs text-slate-600">Quem recebe do cliente<select className={fieldClass} value={ruleDraft.collectionModel} onChange={(e) => { const collectionModel = e.target.value as CollectionModel; setRuleDraft({ ...ruleDraft, collectionModel, entitlementEvent: collectionModel === 'SUPPLIER_COLLECTS' ? 'ON_SALE_CONFIRMATION' : ruleDraft.entitlementEvent }); }}><option value="AGENCY_COLLECTS">Agência</option><option value="SUPPLIER_COLLECTS">Fornecedor</option></select></label>
              <label className="text-xs text-slate-600">Início da vigência<input className={fieldClass} type="date" min={today()} required value={ruleDraft.effectiveFrom} onChange={(e) => setRuleDraft({ ...ruleDraft, effectiveFrom: e.target.value })} /></label>
              <label className="text-xs text-slate-600 sm:col-span-2">Motivo (1 a 300 caracteres)<input className={fieldClass} maxLength={300} required value={ruleDraft.reason} onChange={(e) => setRuleDraft({ ...ruleDraft, reason: e.target.value })} /></label>
              <button type="submit" disabled={busy} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50 sm:col-span-2">Salvar regra</button>
            </form>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Entradas de receita · até 500 registros</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(['saleId','status','supplierId','categoryId'] as const).map((key) => <label key={key} className="text-xs text-slate-600">
              {{saleId:'Código da venda (opcional)',status:'Status',supplierId:'Fornecedor',categoryId:'Categoria'}[key]}
              {key === 'status' ? <select className={fieldClass} value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                <option value="">Todos</option>{Object.entries(STATUS_LABEL).map(([value,label]) => <option key={value} value={value}>{value === 'PENDING_RULE' ? 'Pendência sem regra' : label}</option>)}
              </select> : key === 'supplierId' ? <select className={fieldClass} value={filters.supplierId} onChange={(event) => setFilters((current) => ({ ...current, supplierId: event.target.value }))}><option value="">Todos os fornecedores</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select> : key === 'categoryId' ? <select className={fieldClass} value={filters.categoryId} onChange={(event) => setFilters((current) => ({ ...current, categoryId: event.target.value }))}><option value="">Todas as categorias</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select> : <input className={fieldClass} value={filters[key]} onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))} />}
            </label>)}
          </div>
          <button type="button" disabled={busy} onClick={() => void loadEntries(filters).catch(() => setError('Não foi possível filtrar as entradas.'))} className="rounded-md border border-slate-300 px-3 py-2 text-sm">Filtrar entradas</button>
          {entries.length === 0 ? <p className="text-sm text-slate-500">Nenhuma entrada para os filtros informados.</p> : <ul className="divide-y rounded-md border text-sm">
            {entries.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <span>{STATUS_LABEL[entry.status] ?? entry.status} · {money(entry.amount)} · Venda {entry.sale_id ?? '—'} · {suppliers.find((item) => item.id === entry.supplier_id)?.name ?? 'Fornecedor não informado'} · {categories.find((item) => item.id === entry.category_id)?.name ?? 'Categoria não informada'}</span>
              {entry.sale_id && <button type="button" onClick={() => { setSaleId(entry.sale_id!); void loadSale(entry.sale_id); }} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">Abrir venda e ações</button>}
            </li>)}
          </ul>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Receita por venda</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label htmlFor="revenue-sale-id" className="text-xs text-slate-500">ID da venda<input id="revenue-sale-id" value={saleId} onChange={(event) => setSaleId(event.target.value)} className={fieldClass} /></label>
            <button type="button" disabled={busy || !saleId.trim()} onClick={() => void loadSale()} className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Consultar</button>
            <button type="button" disabled={busy || !saleId.trim()} onClick={() => void calculate()} className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Calcular receita</button>
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
          {revenue && <div className="space-y-4 text-sm text-slate-700">
            <ul className="space-y-3">
              {revenue.entries.map((entry) => <li key={entry.id} className="space-y-2 rounded-md border border-slate-200 p-3">
                <p className="font-medium">{STATUS_LABEL[entry.status] ?? entry.status} · Esperado: {money(entry.amount)}{entry.base_amount > 0 ? ` · Base ${money(entry.base_amount)}` : ''}</p>
                {entry.status === 'RECEIVED' && <p>Recebido: {money(entry.received_amount ?? 0)} · Diferença esperado versus recebido: {money(entry.amount - (entry.received_amount ?? 0))}</p>}
                {entry.status === 'ENTITLED' || entry.status === 'AVAILABLE' ? <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs">Valor recebido<input aria-label={`Valor recebido ${entry.id}`} className={fieldClass} type="number" min="0.01" step="0.01" value={receiveInputs[entry.id]?.amount ?? ''} onChange={(e) => setReceiveInputs((current) => ({ ...current, [entry.id]: { amount: e.target.value, reference: current[entry.id]?.reference ?? '' } }))} /></label>
                  <label className="text-xs">Referência<input aria-label={`Referência ${entry.id}`} className={fieldClass} maxLength={200} value={receiveInputs[entry.id]?.reference ?? ''} onChange={(e) => setReceiveInputs((current) => ({ ...current, [entry.id]: { amount: current[entry.id]?.amount ?? '', reference: e.target.value } }))} /></label>
                  <button type="button" disabled={busy} onClick={() => void runEntryAction(entry, 'receive')} className="rounded-md border border-slate-300 px-3 py-2 text-xs disabled:opacity-50">Registrar recebimento</button>
                </div> : null}
                {entry.status !== 'RECEIVED' && entry.status !== 'CANCELLED' && <button type="button" disabled={busy} onClick={() => setCancelConfirmation(cancelConfirmation === entry.id ? null : entry.id)} className="rounded-md border border-red-300 px-3 py-2 text-xs text-red-700">Cancelar</button>}
                {cancelConfirmation === entry.id && <div className="flex items-center gap-2"><span className="text-xs">Confirmar cancelamento?</span><button type="button" disabled={busy} onClick={() => void runEntryAction(entry, 'cancel')} className="rounded-md bg-red-700 px-3 py-2 text-xs text-white">Confirmar cancelamento</button><button type="button" onClick={() => setCancelConfirmation(null)} className="rounded-md border px-3 py-2 text-xs">Voltar</button></div>}
                {entry.status === 'CANCELLED' && <div className="flex flex-wrap items-end gap-2"><label className="text-xs">Motivo da reativação (1 a 128 caracteres)<input aria-label={`Motivo da reativação ${entry.id}`} className={fieldClass} maxLength={128} value={reactivateReasons[entry.id] ?? ''} onChange={(e) => setReactivateReasons((current) => ({ ...current, [entry.id]: e.target.value }))} /></label><button type="button" disabled={busy} onClick={() => void runEntryAction(entry, 'reactivate')} className="rounded-md border border-slate-300 px-3 py-2 text-xs disabled:opacity-50">Reativar</button></div>}
              </li>)}
            </ul>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="font-medium">Resumo da receita</p>
              <p>Prevista: {money(revenue.totals.forecast ?? 0)} · Direito constituído: {money(revenue.totals.entitled ?? 0)}</p>
              <p>Esperado de entradas recebidas: {money(revenue.totals.expected ?? 0)} · Recebido: {money(revenue.totals.received ?? 0)} · Diferença: {money(revenue.totals.difference ?? 0)}</p>
              {revenue.analysis && <div className="mt-2 border-t pt-2"><p className="text-xs text-slate-500">Análise independente; os valores não são abatidos entre si.</p><p>Receita da agência: {money(revenue.analysis.agencyRevenue)}</p>
                {revenue.analysis.employeeCommission !== undefined && <p>Comissão do funcionário: {money(revenue.analysis.employeeCommission)}</p>}
                {revenue.analysis.difference !== undefined && <p>Diferença receita versus comissão: {money(revenue.analysis.difference)}</p>}
              </div>}
            </div>
          </div>}
        </CardContent>
      </Card>
      <RevenueBatchesPanel />
    </div>
  );
}
