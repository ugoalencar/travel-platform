import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, listSaleCategories, type SaleCategory } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';

type Mode = 'PERCENTAGE' | 'FIXED_PER_PASSENGER' | 'FIXED_PER_SALE' | 'FIXED_PER_ITEM' | 'NONE';
type Base = 'LINE_TOTAL' | 'NET_FARE' | 'TAXES' | 'FEES' | 'TAXES_AND_FEES' | 'MARGIN';
type Event = 'ON_SALE_CONFIRMATION' | 'ON_FULL_SETTLEMENT' | 'ON_BALANCE_DEADLINE';
interface Rule {
  id: string; supplier_id: string; product_id: string | null; category_id: string | null;
  version_number: number; effective_from: string; mode: Mode; base_selector: Base | null;
  value: number; entitlement_event: Event; collection_model: 'AGENCY_COLLECTS' | 'SUPPLIER_COLLECTS';
  reason: string; balance_deadline_days: number;
}
interface Product { id: string; title: string }
interface Draft { productId: string; categoryId: string; mode: Mode; base: Base; value: string; event: Event; collection: 'AGENCY_COLLECTS' | 'SUPPLIER_COLLECTS'; deadlineDays: string; effectiveFrom: string; reason: string }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const freshDraft = (): Draft => ({ productId: '', categoryId: '', mode: 'PERCENTAGE', base: 'LINE_TOTAL', value: '', event: 'ON_FULL_SETTLEMENT', collection: 'AGENCY_COLLECTS', deadlineDays: '0', effectiveFrom: today(), reason: '' });
const labels: Record<Mode, string> = { PERCENTAGE: 'Percentual', FIXED_PER_PASSENGER: 'Valor fixo por passageiro', FIXED_PER_SALE: 'Valor fixo por venda', FIXED_PER_ITEM: 'Valor fixo por item', NONE: 'Sem comissão' };
const baseLabels: Record<Base, string> = { LINE_TOTAL: 'Valor total do item', NET_FARE: 'Tarifa líquida', TAXES: 'Taxas', FEES: 'Encargos', TAXES_AND_FEES: 'Taxas e encargos', MARGIN: 'Margem' };
const eventLabels: Record<Event, string> = { ON_SALE_CONFIRMATION: 'Na confirmação da venda', ON_FULL_SETTLEMENT: 'Na quitação da venda', ON_BALANCE_DEADLINE: 'No prazo antes da viagem' };

export function SupplierCommissionTerms({ supplierId, scopeRules, historyOnly = false }: { supplierId: string; scopeRules: boolean; historyOnly?: boolean }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<SaleCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<Draft>(freshDraft);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ruleResult, categoryResult, productResult] = await Promise.all([
        api.get<{ rules: Rule[] }>('/agency-revenue/rules'),
        listSaleCategories(),
        api.get<{ products: Product[] }>('/travel-products'),
      ]);
      setRules(ruleResult.data.rules.filter(rule => rule.supplier_id === supplierId).sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.version_number - a.version_number));
      setCategories(categoryResult);
      setProducts(productResult.data.products);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os acordos do fornecedor.'); }
  }, [supplierId]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try {
      await api.post('/agency-revenue/rules', {
        supplierId,
        productId: scopeRules ? draft.productId || null : null,
        categoryId: scopeRules ? draft.categoryId || null : null,
        mode: draft.mode,
        baseSelector: draft.mode === 'PERCENTAGE' ? draft.base : null,
        value: draft.mode === 'NONE' ? 0 : Number(draft.value),
        entitlementEvent: draft.event,
        collectionModel: draft.collection,
        balanceDeadlineDays: draft.event === 'ON_BALANCE_DEADLINE' ? Number(draft.deadlineDays) : 0,
        effectiveFrom: draft.effectiveFrom,
        reason: draft.reason.trim(),
      });
      setDraft(freshDraft()); setNotice('Nova versão do acordo registrada.'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o acordo.'); }
    finally { setBusy(false); }
  }

  const matching = historyOnly ? rules : rules.filter(rule => scopeRules ? rule.product_id !== null || rule.category_id !== null : rule.product_id === null && rule.category_id === null);
  return <div className="space-y-4">
    {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!historyOnly && <form onSubmit={event => { void submit(event); }} className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-2">
      <p className="text-sm text-slate-600 md:col-span-2">A regra específica por produto ou categoria vence o acordo geral deste fornecedor. Se a regra por escopo específico não existir, aplica-se o acordo geral. Revisões criam novas versões e preservam as anteriores.</p>
      {scopeRules && <>
        <label className="text-sm">Produto (opcional)<Select aria-label="Produto do acordo" className="mt-1 w-full" value={draft.productId} onChange={event => setDraft(value => ({ ...value, productId: event.target.value, categoryId: event.target.value ? '' : value.categoryId }))}><option value="">Nenhum</option>{products.map(product => <option key={product.id} value={product.id}>{product.title}</option>)}</Select></label>
        <label className="text-sm">Categoria (alternativa ao produto)<Select aria-label="Categoria do acordo" className="mt-1 w-full" value={draft.categoryId} onChange={event => setDraft(value => ({ ...value, categoryId: event.target.value, productId: event.target.value ? '' : value.productId }))}><option value="">Nenhuma</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></label>
      </>}
      <label className="text-sm">Tipo de comissão<Select aria-label="Tipo de comissão do fornecedor" className="mt-1 w-full" value={draft.mode} onChange={event => setDraft(value => ({ ...value, mode: event.target.value as Mode }))}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
      {draft.mode === 'PERCENTAGE' && <label className="text-sm">Base de cálculo<Select aria-label="Base da comissão do fornecedor" className="mt-1 w-full" value={draft.base} onChange={event => setDraft(value => ({ ...value, base: event.target.value as Base }))}>{Object.entries(baseLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>}
      {draft.mode !== 'NONE' && <label className="text-sm">{draft.mode === 'PERCENTAGE' ? 'Percentual (%)' : 'Valor fixo (R$)'}<Input className="mt-1" type="number" min="0" step="0.01" required value={draft.value} onChange={event => setDraft(value => ({ ...value, value: event.target.value }))} /></label>}
      <label className="text-sm">Quando a agência tem direito?<Select aria-label="Quando recebe do fornecedor" className="mt-1 w-full" value={draft.event} onChange={event => setDraft(value => ({ ...value, event: event.target.value as Event }))}>{Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
      {draft.event === 'ON_BALANCE_DEADLINE' && <label className="text-sm">Dias antes da viagem (0 a 365)<Input className="mt-1" type="number" min="0" max="365" value={draft.deadlineDays} onChange={event => setDraft(value => ({ ...value, deadlineDays: event.target.value }))} /></label>}
      <label className="text-sm">Quem cobra do cliente?<Select aria-label="Modelo de cobrança" className="mt-1 w-full" value={draft.collection} onChange={event => setDraft(value => { const collection = event.target.value as Draft['collection']; return { ...value, collection, event: collection === 'SUPPLIER_COLLECTS' ? 'ON_SALE_CONFIRMATION' : value.event, base: collection === 'SUPPLIER_COLLECTS' && value.base === 'MARGIN' ? 'LINE_TOTAL' : value.base }; })}><option value="AGENCY_COLLECTS">Agência cobra e repassa ao fornecedor</option><option value="SUPPLIER_COLLECTS">Fornecedor cobra e paga a comissão à agência</option></Select></label>
      <label className="text-sm">Início da vigência<Input className="mt-1" type="date" required value={draft.effectiveFrom} onChange={event => setDraft(value => ({ ...value, effectiveFrom: event.target.value }))} /></label>
      <label className="text-sm md:col-span-2">Motivo da negociação ou revisão<Input className="mt-1" required maxLength={300} value={draft.reason} onChange={event => setDraft(value => ({ ...value, reason: event.target.value }))} /></label>
      {draft.base === 'TAXES' && <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-900 md:col-span-2">Exemplo: pacote de R$ 12.000,00 com R$ 8.000,00 de tarifa e R$ 4.000,00 de taxas; comissão de 10% sobre taxas = R$ 400,00.</p>}
      <div className="md:col-span-2"><Button type="submit" size="sm" disabled={busy}>{busy ? 'Salvando…' : 'Registrar acordo'}</Button></div>
    </form>}
    <div className="space-y-2">
      {matching.length === 0 && <p className="text-sm text-slate-600">Nenhum acordo cadastrado neste escopo.</p>}
      {matching.map(rule => <article key={rule.id} className="rounded-md border border-slate-200 p-3 text-sm">
        <p className="font-medium">v{rule.version_number} · {rule.product_id ? `Produto: ${products.find(product => product.id === rule.product_id)?.title ?? rule.product_id}` : rule.category_id ? `Categoria: ${categories.find(category => category.id === rule.category_id)?.name ?? rule.category_id}` : 'Acordo geral do fornecedor'}</p>
        <p>{labels[rule.mode]}{rule.mode === 'PERCENTAGE' ? ` de ${rule.value}% sobre ${baseLabels[rule.base_selector ?? 'LINE_TOTAL']}` : rule.mode !== 'NONE' ? ` de R$ ${rule.value.toFixed(2)}` : ''} · {eventLabels[rule.entitlement_event]}{rule.entitlement_event === 'ON_BALANCE_DEADLINE' ? ` (${rule.balance_deadline_days} dias antes)` : ''}</p>
        <p className="text-slate-600">Vigência: {rule.effective_from} · {rule.collection_model === 'AGENCY_COLLECTS' ? 'Agência cobra e repassa' : 'Fornecedor cobra e paga comissão'} · {rule.reason}</p>
      </article>)}
    </div>
  </div>;
}
