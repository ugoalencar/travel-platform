import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listCustomers, listProposals } from '../lib/api';
import type { Proposal } from '../types/proposal';
import type { Customer } from '../types/customer';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; proposals: Proposal[]; customersById: Map<string, string> };

export function ProposalsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    Promise.all([listProposals(), listCustomers().catch(() => [] as Customer[])])
      .then(([proposals, customers]) => {
        if (cancelled) return;
        const customersById = new Map(customers.map((c) => [c.id, c.name]));
        setState({ status: 'success', proposals, customersById });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar as propostas.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Propostas
        </h1>
        <Button onClick={() => void navigate('/proposals/new')}>+ Nova proposta</Button>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando propostas...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <ProposalTable proposals={state.proposals} customersById={state.customersById} />
      )}
    </div>
  );
}

function ProposalTable({
  proposals,
  customersById,
}: {
  proposals: Proposal[];
  customersById: Map<string, string>;
}) {
  const navigate = useNavigate();

  if (proposals.length === 0) {
    return (
      <p className="text-sm text-slate-500">Nenhuma proposta cadastrada ainda.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Preço proposto</th>
            <th className="px-4 py-3">Desconto</th>
            <th className="px-4 py-3">Total</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {proposals.map((proposal) => (
            <tr key={proposal.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3 font-medium text-slate-900">
                {customersById.get(proposal.customerId) ?? proposal.customerId}
              </td>
              <td className="px-4 py-3 text-slate-600">{proposal.proposedPrice}</td>
              <td className="px-4 py-3 text-slate-600">{proposal.discount}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{proposal.total}</td>
              <td className="px-4 py-3 text-slate-600">{proposal.status}</td>
              <td className="px-4 py-3 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigate(`/proposals/${proposal.id}`)}
                >
                  Detalhes
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
