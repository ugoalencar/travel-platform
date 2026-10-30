import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { LoadingState } from '../components/ui/loading-state';
import {
  ApiError,
  createCommissionRuleScope,
  getCommissionEngineSettings,
  listCommissionRuleScopes,
  listEmployees,
  listSaleCategories,
  listSuppliers,
  reviseCommissionRuleScope,
  saveCommissionEngineSettings,
  type CommissionRuleScope,
  type CommissionRuleVersionInput,
  type Employee,
  type SaleCategory,
  type Supplier,
} from '../lib/api';

interface VersionForm {
  mode: 'PERCENTAGE' | 'FIXED' | 'NONE';
  metric: 'GROSS' | 'MARGIN' | 'SUPPLIER_SOLD_TOTAL';
  progressive: boolean;
  tierMode: 'MARGINAL' | 'TOTAL';
  applyOn: 'TOTAL' | 'EXCESS';
  threshold: string;
  value: string;
  tiers: Array<{ upTo: string; rate: string }>;
  effectiveFrom: string;
  reason: string;
  releaseAfterSupplierPayment: boolean;
}

const emptyForm = (): VersionForm => ({
  mode: 'PERCENTAGE', metric: 'GROSS', progressive: false, tierMode: 'MARGINAL', applyOn: 'TOTAL', threshold: '', value: '',
  tiers: [{ upTo: '', rate: '' }, { upTo: '', rate: '' }], effectiveFrom: '', reason: '', releaseAfterSupplierPayment: false,
});

const num = (text: string): number => Number(text.trim().replace(',', '.'));

/** Builds the API payload from the form; throws a pt-BR message the user can act on. */
export function buildVersion(form: VersionForm): CommissionRuleVersionInput {
  if (form.effectiveFrom === '') throw new Error('Informe a data de início da vigência.');
  const base: CommissionRuleVersionInput = {
    effectiveFrom: form.effectiveFrom,
    mode: form.mode,
    calculationMetric: form.metric,
    ...(form.progressive ? { tierMode: form.tierMode } : {}),
    ...(form.reason.trim() !== '' ? { reason: form.reason.trim() } : {}),
    releaseAfterSupplierPayment: form.releaseAfterSupplierPayment,
  };
  if (form.mode === 'NONE') return base;
  if (form.mode === 'FIXED') {
    const value = num(form.value);
    if (!Number.isFinite(value) || value <= 0) throw new Error('Informe o valor fixo (maior que zero).');
    return { ...base, value };
  }
  if (form.progressive) {
    let from = 0;
    const tiers = form.tiers.map((tier, index) => {
      const last = index === form.tiers.length - 1;
      const rate = num(tier.rate);
      const to = last ? null : num(tier.upTo);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error(`Faixa ${index + 1}: informe um percentual entre 0 e 100.`);
      if (to !== null && (!Number.isFinite(to) || to <= from)) throw new Error(`Faixa ${index + 1}: o valor "até" deve ser maior que ${from}.`);
      const out = { fromAmount: from, toAmount: to, rate };
      if (to !== null) from = to;
      return out;
    });
    return { ...base, progressive: true, applyOn: 'TOTAL', tiers };
  }
  const value = num(form.value);
  if (!Number.isFinite(value) || value <= 0 || value > 100) throw new Error('Informe o percentual (entre 0 e 100).');
  if (form.applyOn === 'EXCESS') {
    const excessThreshold = num(form.threshold);
    if (!Number.isFinite(excessThreshold) || excessThreshold <= 0) throw new Error('Informe o valor a partir do qual há excedente.');
    return { ...base, value, applyOn: 'EXCESS', excessThreshold };
  }
  return { ...base, value, applyOn: 'TOTAL' };
}

function describeVersion(v: CommissionRuleScope['versions'][number], all: CommissionRuleScope['versions']): string {
  const rule = v.progressive
    ? `progressiva (${v.tiers.length} faixas)`
    : v.mode === 'PERCENTAGE'
      ? v.applyOn === 'EXCESS' ? `${v.value ?? 0}% sobre o excedente de ${v.excessThreshold ?? 0}` : `${v.value ?? 0}%`
    : v.mode === 'FIXED' ? `fixo ${v.value ?? 0}` : 'sem regra';
  const winner = all.find((x) => x.id === v.supersededByVersionId);
  const state = v.state === 'SCHEDULED' ? 'agendada' : v.state === 'SUPERSEDED' ? `substituída pela v${winner?.versionNumber ?? '?'}` : 'em vigor';
  const base = v.calculationMetric === 'MARGIN' ? 'margem' : v.calculationMetric === 'SUPPLIER_SOLD_TOTAL' ? 'vendido do fornecedor' : 'bruto';
  return `${rule} · ${base}${v.releaseAfterSupplierPayment ? ' · após recebimento do fornecedor' : ''} · ${state}`;
}

function VersionFields({ idPrefix, form, onChange, reasonRequired, hasSupplierScope }: {
  idPrefix: string; form: VersionForm; onChange: (next: VersionForm) => void; reasonRequired: boolean; hasSupplierScope?: boolean;
}) {
  const set = <K extends keyof VersionForm>(key: K, value: VersionForm[K]) => onChange({ ...form, [key]: value });
  const setTier = (index: number, patch: Partial<VersionForm['tiers'][number]>) =>
    onChange({ ...form, tiers: form.tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)) });
  const label = 'text-xs font-medium text-slate-700';
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-mode`} className={label}>Tipo de regra</label>
        <Select id={`${idPrefix}-mode`} value={form.mode} onChange={(e) => set('mode', e.target.value as VersionForm['mode'])}>
          <option value="PERCENTAGE">Percentual</option>
          <option value="FIXED">Valor fixo por venda</option>
          <option value="NONE">Sem regra (comissão pendente)</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-from`} className={label}>Vigência a partir de</label>
        <Input id={`${idPrefix}-from`} type="date" value={form.effectiveFrom} onChange={(e) => set('effectiveFrom', e.target.value)} />
      </div>
      {form.mode === 'PERCENTAGE' && (
        <>
          {form.progressive && <div className="flex flex-col gap-1"><label htmlFor={`${idPrefix}-tier-mode`} className={label}>Como aplicar as faixas</label><Select id={`${idPrefix}-tier-mode`} value={form.tierMode} onChange={e=>set('tierMode',e.target.value as VersionForm['tierMode'])}><option value="MARGINAL">Marginal: cada faixa calcula só o excedente</option><option value="TOTAL">Sobre o total: taxa da faixa atingida sobre todo o acumulado</option></Select></div>}
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefix}-metric`} className={label}>Base</label>
            <Select id={`${idPrefix}-metric`} value={form.metric} onChange={(e) => set('metric', e.target.value as VersionForm['metric'])}>
              <option value="GROSS">Valor bruto da venda</option>
              <option value="MARGIN">Margem</option>
              <option value="SUPPLIER_SOLD_TOTAL" disabled={!hasSupplierScope}>Valor vendido deste fornecedor</option>
            </Select>
          </div>
          {hasSupplierScope && <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" checked={form.releaseAfterSupplierPayment} onChange={(e) => set('releaseAfterSupplierPayment', e.target.checked)} />
            Liberar somente depois que a agência receber deste fornecedor
          </label>}
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={form.progressive}
              aria-label="Progressiva por faixas"
              onChange={(e) => onChange({ ...form, progressive: e.target.checked, applyOn: 'TOTAL' })}
            />
            Comissão progressiva por meta mensal
          </label>
          {form.progressive ? (
            <fieldset className="space-y-2 rounded-md border border-slate-200 p-3 md:col-span-2">
              <legend className="px-1 text-xs font-medium text-slate-700">Faixas do mês (vendas confirmadas do vendedor)</legend>
              {form.tiers.map((tier, index) => {
                const last = index === form.tiers.length - 1;
                const from = index === 0 ? '0' : form.tiers[index - 1]!.upTo || '…';
                return (
                  <div key={index} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-40">Faixa {index + 1}: de R$ {from}</span>
                    {last ? (
                      <span className="w-28 text-slate-500">em diante</span>
                    ) : (
                      <Input className="w-28" inputMode="decimal" placeholder="Até (R$)" aria-label={`Até (R$) da faixa ${index + 1}`} value={tier.upTo} onChange={(e) => setTier(index, { upTo: e.target.value })} />
                    )}
                    <Input className="w-24" inputMode="decimal" placeholder="%" aria-label={`Percentual (%) da faixa ${index + 1}`} value={tier.rate} onChange={(e) => setTier(index, { rate: e.target.value })} />
                    {form.tiers.length > 2 && (
                      <Button type="button" variant="outline" onClick={() => set('tiers', form.tiers.filter((_, i) => i !== index))}>
                        Remover faixa {index + 1}
                      </Button>
                    )}
                  </div>
                );
              })}
              <Button type="button" variant="outline" disabled={form.tiers.length >= 10} onClick={() => set('tiers', [...form.tiers, { upTo: '', rate: '' }])}>
                Adicionar faixa
              </Button>
              <p className="text-xs text-slate-500">
                Cada faixa vale só para a parte das vendas do mês que cai nela. Ao passar a meta, a nova taxa vale a partir daquele valor; comissões já calculadas não mudam.
              </p>
            </fieldset>
          ) : (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idPrefix}-apply`} className={label}>Aplicação</label>
              <Select id={`${idPrefix}-apply`} value={form.applyOn} onChange={(e) => set('applyOn', e.target.value as 'TOTAL' | 'EXCESS')}>
                <option value="TOTAL">Sobre o total</option>
                <option value="EXCESS">Só sobre o excedente</option>
              </Select>
            </div>
          )}
          {!form.progressive && form.applyOn === 'EXCESS' && (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idPrefix}-threshold`} className={label}>Excedente acima de (R$)</label>
              <Input id={`${idPrefix}-threshold`} inputMode="decimal" value={form.threshold} onChange={(e) => set('threshold', e.target.value)} />
            </div>
          )}
        </>
      )}
      {form.mode !== 'NONE' && !(form.mode === 'PERCENTAGE' && form.progressive) && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-value`} className={label}>{form.mode === 'FIXED' ? 'Valor fixo (R$)' : 'Percentual (%)'}</label>
          <Input id={`${idPrefix}-value`} inputMode="decimal" value={form.value} onChange={(e) => set('value', e.target.value)} />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-reason`} className={label}>{reasonRequired ? 'Motivo da revisão' : 'Motivo (opcional)'}</label>
        <Input id={`${idPrefix}-reason`} maxLength={500} value={form.reason} onChange={(e) => set('reason', e.target.value)} />
      </div>
    </>
  );
}

export function CommissionRulesPage() {
  const [scopes, setScopes] = useState<CommissionRuleScope[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [categories, setCategories] = useState<SaleCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [form, setForm] = useState<VersionForm>(emptyForm);
  const [reviseId, setReviseId] = useState<string | null>(null);
  const [reviseForm, setReviseForm] = useState<VersionForm>(emptyForm);
  const [cutoverDate, setCutoverDate] = useState('');
  const [cutoverSaving, setCutoverSaving] = useState(false);

  const load = useCallback(() => {
    Promise.all([listCommissionRuleScopes(), listEmployees(), listSaleCategories(), listSuppliers(), getCommissionEngineSettings()])
      .then(([s, e, c, suppliersList, settings]) => {
        setScopes(s);
        setEmployees(e);
        setCategories(c);
        setSuppliers(suppliersList);
        setCutoverDate(settings.cutoverDate ?? '');
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as regras.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      if (supplierId && categoryId) throw new Error('Escolha um fornecedor ou uma categoria nesta regra, não os dois.');
      if (!supplierId && (form.metric === 'SUPPLIER_SOLD_TOTAL' || form.releaseAfterSupplierPayment)) throw new Error('Selecione um fornecedor para usar esta base ou aguardar o pagamento do fornecedor.');
      await createCommissionRuleScope({ employeeId: employeeId || null, supplierId: supplierId || null, categoryId: categoryId || null, version: buildVersion(form) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a regra.');
    }
  }

  async function submitRevision(event: FormEvent) {
    event.preventDefault();
    if (reviseId === null) return;
    setError(null);
    try {
      if (reviseForm.reason.trim() === '') throw new Error('Informe o motivo da revisão.');
      const scope = scopes?.find(item => item.id === reviseId);
      if (!scope?.supplierId && (reviseForm.metric === 'SUPPLIER_SOLD_TOTAL' || reviseForm.releaseAfterSupplierPayment)) throw new Error('Esta regra não possui fornecedor no escopo.');
      await reviseCommissionRuleScope(reviseId, buildVersion(reviseForm));
      setReviseId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível revisar a regra.');
    }
  }

  async function submitCutover(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setCutoverSaving(true);
    try { await saveCommissionEngineSettings(cutoverDate || null); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar a data de corte.'); }
    finally { setCutoverSaving(false); }
  }

  if (scopes === null && error === null) return <LoadingState label="Carregando regras…" />;
  const nameOf = (id: string | null, list: Array<{ id: string; name: string }>, fallback: string) => (id ? list.find((i) => i.id === id)?.name ?? id : fallback);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comissões da equipe"
        description="Escolha quem recebe, quais vendas entram no cálculo e quando a comissão fica disponível. As alterações mantêm o histórico das regras."
        breadcrumbs={[{ label: 'Pessoal' }, { label: 'Regras de comissão' }]}
      />
      {error !== null && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Card>
        <CardHeader><CardTitle>Início das novas regras</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={(event) => void submitCutover(event)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1"><label htmlFor="commission-cutover" className="text-xs font-medium text-slate-700">Aplicar o novo cálculo a partir de</label><Input id="commission-cutover" type="date" value={cutoverDate} onChange={(event) => setCutoverDate(event.target.value)} /></div>
            <Button type="submit" disabled={cutoverSaving}>{cutoverSaving ? 'Salvando…' : 'Salvar data'}</Button>
          </form>
          <p className="mt-2 text-xs text-slate-600">A data define quando o novo cálculo começa. Comissões já calculadas permanecem no histórico.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Nova regra</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={(event) => void submit(event)} className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="cr-employee" className="text-xs font-medium text-slate-700">Funcionário</label>
              <Select id="cr-employee" aria-label="Para qual funcionário?" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Todos (regra padrão)</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="cr-category" className="text-xs font-medium text-slate-700">Quais vendas?</label>
              <Select id="cr-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Todas as categorias</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="cr-supplier" className="text-xs font-medium text-slate-700">De qual fornecedor? (opcional)</label>
              <Select id="cr-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Todos</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </Select>
            </div>
            <VersionFields idPrefix="cr" form={form} onChange={setForm} reasonRequired={false} hasSupplierScope={supplierId !== ''} />
            <div className="md:col-span-2"><Button type="submit">Criar regra</Button></div>
          </form>
        </CardContent>
      </Card>
      {(scopes ?? []).map((scope) => (
        <Card key={scope.id}>
          <CardHeader>
            <CardTitle>{nameOf(scope.employeeId, employees, 'Padrão da agência')} · {nameOf(scope.supplierId, suppliers, 'todos fornecedores')} · {nameOf(scope.categoryId, categories, 'todas as categorias')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-1 text-sm">
              {scope.versions.map((v) => (
                <li key={v.id}>v{v.versionNumber} desde {v.effectiveFrom} · {describeVersion(v, scope.versions)}</li>
              ))}
            </ul>
            {reviseId === scope.id ? (
              <form onSubmit={(event) => void submitRevision(event)} className="grid gap-4 md:grid-cols-2">
                <VersionFields idPrefix="rv" form={reviseForm} onChange={setReviseForm} reasonRequired hasSupplierScope={Boolean(scopes?.find(item => item.id === reviseId)?.supplierId)} />
                <div className="flex gap-2 md:col-span-2">
                  <Button type="submit">Salvar revisão</Button>
                  <Button type="button" variant="outline" onClick={() => setReviseId(null)}>Cancelar</Button>
                </div>
              </form>
            ) : (
              <Button type="button" variant="outline" onClick={() => { setReviseId(scope.id); setReviseForm(emptyForm()); }}>
                Nova revisão
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
