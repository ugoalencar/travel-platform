import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorNote, formatBRL } from '../ui';

interface DashboardJson {
  sales_this_month: { count: number; gross_amount: number; margin_amount: number };
  commissions: { pending_count: number; pending_amount: number; pending_rule_count: number };
  receivables: { open_amount: number; overdue_amount: number; overdue_count: number };
  payables: { open_amount: number; overdue_amount: number; overdue_count: number };
  accounts: Array<{ id: string; name: string; type: string; balance: number }>;
}

export function DashboardPage() {
  const [dash, setDash] = useState<DashboardJson | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DashboardJson>('/dashboard')
      .then(setDash)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Falha ao carregar'));
  }, []);

  if (error) return <ErrorNote error={error} />;
  if (!dash) return <p className="lite-muted">Carregando…</p>;

  return (
    <>
      <h1>Dashboard</h1>
      <div className="lite-grid">
        <div className="stat">
          <div className="stat-label">Vendas no mês</div>
          <div className="stat-value">{dash.sales_this_month.count}</div>
          <div className="lite-muted">
            {formatBRL(dash.sales_this_month.gross_amount)} — margem{' '}
            {formatBRL(dash.sales_this_month.margin_amount)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Comissões pendentes</div>
          <div className="stat-value">{formatBRL(dash.commissions.pending_amount)}</div>
          <div className="lite-muted">
            {dash.commissions.pending_count} para aprovar · {dash.commissions.pending_rule_count}{' '}
            sem regra
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">A receber</div>
          <div className="stat-value">{formatBRL(dash.receivables.open_amount)}</div>
          <div className="lite-muted">
            {dash.receivables.overdue_count} vencido(s) ·{' '}
            {formatBRL(dash.receivables.overdue_amount)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">A pagar</div>
          <div className="stat-value">{formatBRL(dash.payables.open_amount)}</div>
          <div className="lite-muted">
            {dash.payables.overdue_count} vencido(s) · {formatBRL(dash.payables.overdue_amount)}
          </div>
        </div>
      </div>
      <div className="lite-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Conta</th>
              <th>Tipo</th>
              <th className="num">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {dash.accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.name}</td>
                <td>{account.type}</td>
                <td className="num">{formatBRL(account.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {dash.accounts.length === 0 ? (
          <p className="lite-empty">Nenhuma conta cadastrada em Cadastros.</p>
        ) : null}
      </div>
    </>
  );
}
