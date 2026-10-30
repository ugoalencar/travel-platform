import { useEffect, useState } from 'react';
import { api } from '../api';
import { useCan } from '../auth';
import { ErrorNote } from '../ui';

interface Rule {
  id: string;
  mode: string;
  base_selector: string | null;
  value: number;
  effective_from: string;
  version_number: number;
  collection_model: string;
}

interface Entry {
  id: string;
  status: string;
  amount: number;
  base_amount: number;
  received_amount: number | null;
}

interface SaleRevenue {
  entries: Entry[];
  analysis: { agency_revenue: number; seller_commission: number | null; difference: number | null };
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_RULE: 'Pendente de regra',
  FORECAST: 'Prevista',
  ENTITLED: 'Direito constituído',
  AVAILABLE: 'Disponível',
  RECEIVED: 'Recebida do fornecedor',
  CANCELLED: 'Cancelada',
};

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

/**
 * Agency revenue (ADR-007): what the supplier owes the AGENCY, apart from the
 * seller commission. The comparison is analysis only (never netted). The server
 * calculates everything; this page only asks and displays.
 */
export function AgencyRevenuePage() {
  const canCalculate = useCan('revenue.rules_manage', 'revenue.receive');
  const [rules, setRules] = useState<Rule[]>([]);
  const [saleId, setSaleId] = useState('');
  const [revenue, setRevenue] = useState<SaleRevenue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ rules: Rule[] }>('/agency-revenue/rules')
      .then((result) => setRules(result.rules))
      .catch(() => setError('Não foi possível carregar as regras de receita.'));
  }, []);

  async function load(calculate: boolean) {
    setBusy(true);
    setError(null);
    try {
      const id = encodeURIComponent(saleId.trim());
      if (calculate) await api(`/sales/${id}/agency-revenue/calculate`, { method: 'POST' });
      setRevenue(await api<SaleRevenue>(`/sales/${id}/agency-revenue`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao consultar a receita');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Receita da agência</h1>
      <ErrorNote error={error} />
      <h2>Regras</h2>
      {rules.length === 0 ? (
        <p>Nenhuma regra cadastrada.</p>
      ) : (
        <ul>
          {rules.map((rule) => (
            <li key={rule.id}>
              v{rule.version_number} · {rule.mode}
              {rule.base_selector ? ` · ${rule.base_selector}` : ''} · {rule.value}
              {rule.mode === 'PERCENTAGE' ? '%' : ''} · a partir de {rule.effective_from} ·{' '}
              {rule.collection_model === 'AGENCY_COLLECTS' ? 'agência recebe do cliente' : 'fornecedor recebe do cliente'}
            </li>
          ))}
        </ul>
      )}
      <h2>Venda</h2>
      <label className="field">
        <span>ID da venda</span>
        <input value={saleId} onChange={(event) => setSaleId(event.target.value)} />
      </label>
      <button type="button" className="btn" disabled={busy || saleId.trim() === ''} onClick={() => void load(false)}>
        Consultar
      </button>
      {canCalculate ? (
        <button type="button" className="btn" disabled={busy || saleId.trim() === ''} onClick={() => void load(true)}>
          Calcular receita
        </button>
      ) : null}
      {revenue ? (
        <>
          <ul>
            {revenue.entries.map((entry) => (
              <li key={entry.id}>
                {STATUS_LABEL[entry.status] ?? entry.status} · Esperado: {money(entry.amount)}
                {entry.status === 'RECEIVED' && (
                  <span>
                    {' · '}Recebido: {money(entry.received_amount ?? 0)}
                    {' · '}Diferença esperado versus recebido: {money(entry.amount - (entry.received_amount ?? 0))}
                  </span>
                )}
                {entry.base_amount > 0 ? ` (base ${money(entry.base_amount)})` : ''}
              </li>
            ))}
          </ul>
          <p>Análise (valores independentes, sem abatimento)</p>
          <p>Receita da agência: {money(revenue.analysis.agency_revenue)}</p>
          {revenue.analysis.seller_commission !== null && revenue.analysis.difference !== null ? (
            <>
              <p>Comissão do vendedor: {money(revenue.analysis.seller_commission)}</p>
              <p>Diferença receita versus comissão: {money(revenue.analysis.difference)}</p>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
