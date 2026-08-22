import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listSuppliers } from '../lib/api';
import type { Supplier } from '../types/transport';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; suppliers: Supplier[] };

export function SuppliersPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    listSuppliers()
      .then((suppliers) => {
        if (cancelled) return;
        setState({ status: 'success', suppliers });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar os fornecedores.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Fornecedores</h1>
        <Button onClick={() => void navigate('/transport/suppliers/new')}>
          + Novo fornecedor
        </Button>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando fornecedores...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && <SupplierTable suppliers={state.suppliers} />}
    </div>
  );
}

function SupplierTable({ suppliers }: { suppliers: Supplier[] }) {
  const navigate = useNavigate();

  if (suppliers.length === 0) {
    return <p className="text-sm text-slate-500">Nenhum fornecedor cadastrado ainda.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Nome</th>
            <th className="px-4 py-3">Documento</th>
            <th className="px-4 py-3">Contato</th>
            <th className="px-4 py-3">Ativo</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((supplier) => (
            <tr key={supplier.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3 font-medium text-slate-900">{supplier.name}</td>
              <td className="px-4 py-3 text-slate-600">{supplier.document ?? '—'}</td>
              <td className="px-4 py-3 text-slate-600">{supplier.contact ?? '—'}</td>
              <td className="px-4 py-3 text-slate-600">{supplier.active ? 'Sim' : 'Não'}</td>
              <td className="px-4 py-3 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigate(`/transport/suppliers/${supplier.id}`)}
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
