import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listCustomers, listProposals } from '../lib/api';
import type { Proposal, ProposalStatus } from '../types/proposal';
import type { Customer } from '../types/customer';
import { Button } from '../components/ui/button';
import { formatBRL } from '../lib/formatCurrency';
import { getProposalStatusLabel } from '../lib/statusLabels';
import { StatusPill, proposalStatusTone } from '../components/ui/StatusPill';

const PROPOSAL_STATUSES: ProposalStatus[] = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
];

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; proposals: Proposal[]; customersById: Map<string, string> };

export function ProposalsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | ''>('');
  const [customerFilter, setCustomerFilter] = useState('');
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
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <>
          {/* Backend GET /proposals has no filter query params today, so
              filtering here is client-side over the already-loaded list.
              Fine for this batch's data volumes; a large agency's proposal
              list should move this to server-side filtering + pagination
              rather than scaling this approach further. */}
          <ProposalFilters
            proposals={state.proposals}
            customersById={state.customersById}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            customerFilter={customerFilter}
            onCustomerChange={setCustomerFilter}
          />
          <FilteredProposalTable
            proposals={state.proposals}
            customersById={state.customersById}
            statusFilter={statusFilter}
            customerFilter={customerFilter}
          />
        </>
      )}
    </div>
  );
}

function ProposalFilters({
  proposals,
  customersById,
  statusFilter,
  onStatusChange,
  customerFilter,
  onCustomerChange,
}: {
  proposals: Proposal[];
  customersById: Map<string, string>;
  statusFilter: ProposalStatus | '';
  onStatusChange: (value: ProposalStatus | '') => void;
  customerFilter: string;
  onCustomerChange: (value: string) => void;
}) {
  const customerOptions = useMemo(() => {
    const ids = new Set(proposals.map((p) => p.customerId));
    return Array.from(ids)
      .map((id) => ({ id, name: customersById.get(id) ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [proposals, customersById]);

  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Status
        </span>
        <select
          value={statusFilter}
          onChange={(event) => onStatusChange(event.target.value as ProposalStatus | '')}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todos</option>
          {PROPOSAL_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Cliente
        </span>
        <select
          value={customerFilter}
          onChange={(event) => onCustomerChange(event.target.value)}
          className="min-w-[200px] rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todos</option>
          {customerOptions.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>

      {(statusFilter || customerFilter) && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onStatusChange('');
            onCustomerChange('');
          }}
        >
          Limpar filtros
        </Button>
      )}
    </div>
  );
}

function FilteredProposalTable({
  proposals,
  customersById,
  statusFilter,
  customerFilter,
}: {
  proposals: Proposal[];
  customersById: Map<string, string>;
  statusFilter: ProposalStatus | '';
  customerFilter: string;
}) {
  const filtered = proposals.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (customerFilter && p.customerId !== customerFilter) return false;
    return true;
  });

  if (proposals.length > 0 && filtered.length === 0) {
    return (
      <p className="text-sm text-slate-500">Nenhuma proposta corresponde aos filtros selecionados.</p>
    );
  }

  return <ProposalTable proposals={filtered} customersById={customersById} />;
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
              <td className="px-4 py-3 text-slate-600">{formatBRL(proposal.proposedPrice)}</td>
              <td className="px-4 py-3 text-slate-600">{formatBRL(proposal.discount)}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{formatBRL(proposal.total)}</td>
              <td className="px-4 py-3">
                <StatusPill tone={proposalStatusTone(proposal.status)}>
                  {getProposalStatusLabel(proposal.status)}
                </StatusPill>
              </td>
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
