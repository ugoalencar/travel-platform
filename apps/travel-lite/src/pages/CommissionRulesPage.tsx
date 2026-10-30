import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useCan } from '../auth';
import {
  buildVersionPayload,
  describeVersion,
  emptyVersionForm,
  type RuleJson,
  type RuleVersionJson,
  type VersionForm,
} from '../commissionRules';
import { EmptyState, ErrorNote, StatusBadge, SuccessNote } from '../ui';

interface Named {
  id: string;
  name: string;
}

function todayLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function VersionFields({
  form,
  onChange,
  reasonRequired,
}: {
  form: VersionForm;
  onChange: (next: VersionForm) => void;
  reasonRequired: boolean;
}) {
  const set = <K extends keyof VersionForm>(key: K, value: VersionForm[K]) => onChange({ ...form, [key]: value });
  const setTier = (index: number, patch: Partial<VersionForm['tiers'][number]>) =>
    onChange({ ...form, tiers: form.tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)) });
  const removeTier = (index: number) => onChange({ ...form, tiers: form.tiers.filter((_, i) => i !== index) });
  return (
    <>
      <label className="field">
        <span>Tipo de regra *</span>
        <select value={form.mode} onChange={(event) => set('mode', event.target.value as VersionForm['mode'])}>
          <option value="PERCENTAGE">Percentual</option>
          <option value="FIXED">Valor fixo por venda</option>
          <option value="NONE">Sem regra (comissão pendente)</option>
        </select>
      </label>
      {form.mode === 'PERCENTAGE' ? (
        <>
          <label className="field">
            <span>Base de cálculo *</span>
            <select value={form.base} onChange={(event) => set('base', event.target.value as VersionForm['base'])}>
              <option value="GROSS">Venda bruta</option>
              <option value="MARGIN">Margem</option>
            </select>
          </label>
          <label className="field field-wide field-check">
            <span>
              <input
                type="checkbox"
                checked={form.progressive}
                onChange={(event) => onChange({ ...form, progressive: event.target.checked, applyOn: 'TOTAL' })}
              />{' '}
              Comissão progressiva por meta mensal
            </span>
          </label>
          {form.progressive ? (
            <fieldset className="tier-editor">
              <legend>Faixas do mês (vendas confirmadas do vendedor)</legend>
              {form.tiers.map((tier, index) => {
                const last = index === form.tiers.length - 1;
                const from = index === 0 ? '0' : form.tiers[index - 1]!.upTo || '…';
                return (
                  <div className="tier-row" key={index}>
                    <span className="tier-label">
                      Faixa {index + 1}: de R$ {from}
                    </span>
                    {last ? (
                      <span className="lite-muted">em diante</span>
                    ) : (
                      <input
                        aria-label={`Até (R$) da faixa ${index + 1}`}
                        inputMode="decimal"
                        placeholder="Até (R$)"
                        value={tier.upTo}
                        onChange={(event) => setTier(index, { upTo: event.target.value })}
                      />
                    )}
                    <input
                      aria-label={`Percentual (%) da faixa ${index + 1}`}
                      inputMode="decimal"
                      placeholder="%"
                      value={tier.rate}
                      onChange={(event) => setTier(index, { rate: event.target.value })}
                    />
                    {form.tiers.length > 2 ? (
                      <button type="button" className="btn btn-small" onClick={() => removeTier(index)}>
                        Remover faixa {index + 1}
                      </button>
                    ) : null}
                  </div>
                );
              })}
              <button
                type="button"
                className="btn btn-small tier-add"
                disabled={form.tiers.length >= 10}
                onClick={() => onChange({ ...form, tiers: [...form.tiers, { upTo: '', rate: '' }] })}
              >
                Adicionar faixa
              </button>
              <p className="lite-muted">
                Cada faixa vale só para a parte das vendas do mês que cai nela. Ao passar a meta, a nova taxa vale a partir daquele valor;
                comissões já calculadas não mudam.
              </p>
            </fieldset>
          ) : (
            <label className="field">
              <span>Aplicação *</span>
              <select value={form.applyOn} onChange={(event) => set('applyOn', event.target.value as VersionForm['applyOn'])}>
                <option value="TOTAL">Sobre o total</option>
                <option value="EXCESS">Só sobre o excedente</option>
              </select>
            </label>
          )}
          {!form.progressive && form.applyOn === 'EXCESS' ? (
            <label className="field">
              <span>Excedente acima de (R$) *</span>
              <input inputMode="decimal" value={form.threshold} onChange={(event) => set('threshold', event.target.value)} />
            </label>
          ) : null}
        </>
      ) : null}
      {form.mode !== 'NONE' && !(form.mode === 'PERCENTAGE' && form.progressive) ? (
        <label className="field">
          <span>{form.mode === 'FIXED' ? 'Valor fixo (R$) *' : 'Percentual (%) *'}</span>
          <input inputMode="decimal" value={form.value} onChange={(event) => set('value', event.target.value)} />
        </label>
      ) : null}
      <label className="field">
        <span>Vigência a partir de *</span>
        <input type="date" min={todayLocal()} value={form.effectiveFrom} onChange={(event) => set('effectiveFrom', event.target.value)} />
      </label>
      <label className="field">
        <span>{reasonRequired ? 'Motivo da revisão *' : 'Motivo'}</span>
        <input value={form.reason} onChange={(event) => set('reason', event.target.value)} maxLength={500} />
      </label>
    </>
  );
}

export function CommissionRulesPage() {
  const canManage = useCan('commissions.rules_manage');
  const [searchParams] = useSearchParams();
  const presetSeller = searchParams.get('vendedor') ?? '';
  const [rules, setRules] = useState<RuleJson[]>([]);
  const [sellers, setSellers] = useState<Named[]>([]);
  const [categories, setCategories] = useState<Named[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(presetSeller !== '');
  const [name, setName] = useState('');
  const [sellerId, setSellerId] = useState(presetSeller);
  const [categoryId, setCategoryId] = useState('');
  const [createForm, setCreateForm] = useState<VersionForm>(() => emptyVersionForm(todayLocal()));
  const [reviseId, setReviseId] = useState<string | null>(null);
  const [reviseForm, setReviseForm] = useState<VersionForm>(() => emptyVersionForm(todayLocal()));
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<RuleVersionJson[]>([]);

  const load = useCallback(async () => {
    try {
      const response = await api<{ items: RuleJson[] }>('/commission-rules');
      setRules(response.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar as regras');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api<{ items: Named[] }>('/sellers?pageSize=100')
      .then((response) => setSellers(response.items))
      .catch(() => setSellers([]));
    api<{ items: Named[] }>('/categories')
      .then((response) => setCategories(response.items))
      .catch(() => setCategories([]));
  }, []);

  const sellerName = (id: string | null) =>
    id === null ? 'Todos os vendedores' : (sellers.find((s) => s.id === id)?.name ?? 'Vendedor');
  const categoryName = (id: string | null) =>
    id === null ? 'Todas as categorias' : (categories.find((c) => c.id === id)?.name ?? 'Categoria');

  async function submitCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    try {
      if (!name.trim()) throw new Error('Informe o nome da regra.');
      const body = {
        name: name.trim(),
        ...(sellerId ? { seller_id: sellerId } : {}),
        ...(categoryId ? { category_id: categoryId } : {}),
        ...buildVersionPayload(createForm, false),
      };
      await api('/commission-rules', { method: 'POST', body });
      setCreating(false);
      setName('');
      setSellerId('');
      setCategoryId('');
      setCreateForm(emptyVersionForm(todayLocal()));
      setNotice('Regra criada.');
      setError(null);
      await load();
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : 'Falha ao criar a regra');
    }
  }

  async function openHistory(id: string, force = false): Promise<void> {
    if (historyId === id && !force) {
      setHistoryId(null);
      return;
    }
    try {
      const response = await api<{ versions: RuleVersionJson[] }>(`/commission-rules/${id}`);
      setHistory(response.versions);
      setHistoryId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar o histórico');
    }
  }

  async function submitRevision(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!reviseId) return;
    try {
      await api(`/commission-rules/${reviseId}/versions`, {
        method: 'POST',
        body: buildVersionPayload(reviseForm, true),
      });
      const revisedId = reviseId;
      setReviseId(null);
      setNotice('Nova versão registrada. A versão anterior continua no histórico.');
      setError(null);
      if (historyId === revisedId) await openHistory(revisedId, true);
      await load();
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : 'Falha ao registrar a versão');
    }
  }

  async function archive(rule: RuleJson): Promise<void> {
    if (!window.confirm(`Arquivar a regra "${rule.name}"? Vendas futuras deixam de usá-la.`)) return;
    try {
      await api(`/commission-rules/${rule.id}/archive`, { method: 'POST', body: {} });
      setNotice('Regra arquivada.');
      setError(null);
      await load();
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : 'Falha ao arquivar');
    }
  }

  return (
    <>
      <h1>Regras de comissão</h1>
      <p className="lite-muted">
        A regra mais específica vence: vendedor + categoria, depois vendedor, depois a regra padrão. Cada revisão cria uma nova versão e
        vale a partir da data informada; comissões já calculadas não mudam.
      </p>
      <ErrorNote error={error} />
      <SuccessNote success={notice} />
      {canManage ? (
        <div className="lite-toolbar">
          <button type="button" className="btn btn-primary" onClick={() => setCreating((open) => !open)}>
            {creating ? 'Cancelar' : 'Nova regra'}
          </button>
        </div>
      ) : null}
      {canManage && creating ? (
        <form className="lite-form" aria-label="Nova regra" onSubmit={(event) => void submitCreate(event)}>
          <label className="field">
            <span>Nome *</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
          </label>
          <label className="field">
            <span>Vendedor</span>
            <select value={sellerId} onChange={(event) => setSellerId(event.target.value)}>
              <option value="">Todos os vendedores (regra padrão)</option>
              {sellers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Categoria</span>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Todas as categorias</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <VersionFields form={createForm} onChange={setCreateForm} reasonRequired={false} />
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Criar regra
            </button>
          </div>
        </form>
      ) : null}
      {canManage && reviseId ? (
        <form className="lite-form" aria-label="Nova versão" onSubmit={(event) => void submitRevision(event)}>
          <h2>Nova versão — {rules.find((r) => r.id === reviseId)?.name}</h2>
          <VersionFields form={reviseForm} onChange={setReviseForm} reasonRequired />
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setReviseId(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Registrar versão
            </button>
          </div>
        </form>
      ) : null}
      <div className="lite-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Regra</th>
              <th>Vendedor</th>
              <th>Categoria</th>
              <th>Regra mais recente</th>
              <th>Vigência</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td>{rule.name}</td>
                <td>{sellerName(rule.seller_id)}</td>
                <td>{categoryName(rule.category_id)}</td>
                <td>
                  {rule.mode
                    ? describeVersion({
                        mode: rule.mode,
                        calculation_base: rule.calculation_base ?? null,
                        value: rule.value ?? null,
                        apply_on: rule.apply_on ?? 'TOTAL',
                        excess_threshold: rule.excess_threshold ?? null,
                        progressive: rule.progressive ?? false,
                        tiers: rule.tiers ?? [],
                      })
                    : '—'}
                </td>
                <td>{rule.effective_from ? `v${rule.version_number} desde ${rule.effective_from}` : '—'}</td>
                <td>
                  <StatusBadge status={rule.status === 'ARCHIVED' ? 'INACTIVE' : 'ACTIVE'} />
                </td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="btn btn-small" onClick={() => void openHistory(rule.id)}>
                      {historyId === rule.id ? 'Ocultar histórico' : 'Histórico'}
                    </button>
                    {canManage && rule.status === 'ACTIVE' ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-small btn-primary"
                          onClick={() => {
                            setReviseId(rule.id);
                            setReviseForm(emptyVersionForm(todayLocal()));
                            setNotice(null);
                          }}
                        >
                          Nova versão
                        </button>
                        <button type="button" className="btn btn-small" onClick={() => void archive(rule)}>
                          Arquivar
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rules.length === 0 ? (
          <EmptyState message="Nenhuma regra de comissão cadastrada. Sem regra, a comissão da venda fica pendente de regra." />
        ) : null}
      </div>
      {historyId ? (
        <section className="lite-card" aria-label="Histórico de versões">
          <h2>Histórico — {rules.find((r) => r.id === historyId)?.name}</h2>
          <ul>
            {history.map((version) => (
              <li key={version.version_number}>
                v{version.version_number} · desde {version.effective_from} · {describeVersion(version)}
                {version.reason ? ` · ${version.reason}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
