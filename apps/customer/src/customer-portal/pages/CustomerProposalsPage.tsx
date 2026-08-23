import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, listMyProposals } from '../../lib/customerApi';
import type { CustomerProposalView } from '../../types/customer-portal';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; proposals: CustomerProposalView[] };

export function CustomerProposalsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    listMyProposals()
      .then((proposals) => {
        if (!cancelled) setState({ status: 'success', proposals });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar as propostas.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Minhas propostas</h1>
      <p className="text-sm text-slate-500">Informativo -- fale com sua agência para negociar.</p>

      {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}
      {state.status === 'success' && state.proposals.length === 0 && (
        <p className="text-sm text-slate-500">Nenhuma proposta no momento.</p>
      )}
      {state.status === 'success' && (
        <ul className="flex flex-col gap-3">
          {state.proposals.map((proposal) => (
            <li key={proposal.id}>
              <Link
                to={`/customer-portal/proposals/${proposal.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-300"
              >
                <p className="font-medium text-slate-900">
                  {proposal.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                <p className="text-xs text-slate-500">{proposal.status}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
