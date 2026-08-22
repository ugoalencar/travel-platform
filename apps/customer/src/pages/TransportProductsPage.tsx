import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listTransportProducts } from '../lib/api';
import type { TransportProduct } from '../types/transport';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; products: TransportProduct[] };

export function TransportProductsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading' });

    listTransportProducts()
      .then((products) => {
        if (cancelled) return;
        setState({ status: 'success', products });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar os produtos.';
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
          Produtos de transporte
        </h1>
        <Button onClick={() => void navigate('/transport/products/new')}>+ Novo produto</Button>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando produtos...</p>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && <ProductTable products={state.products} />}
    </div>
  );
}

function ProductTable({ products }: { products: TransportProduct[] }) {
  const navigate = useNavigate();

  if (products.length === 0) {
    return <p className="text-sm text-slate-500">Nenhum produto cadastrado ainda.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Nome</th>
            <th className="px-4 py-3">Tipo</th>
            <th className="px-4 py-3">Preço</th>
            <th className="px-4 py-3">Ativo</th>
            <th className="px-4 py-3">Vendável publicamente</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
              <td className="px-4 py-3 text-slate-600">{product.tripType}</td>
              <td className="px-4 py-3 text-slate-600">{product.price}</td>
              <td className="px-4 py-3 text-slate-600">{product.active ? 'Sim' : 'Não'}</td>
              <td className="px-4 py-3 text-slate-600">
                {product.publiclyBookable ? 'Sim' : 'Não'}
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigate(`/transport/products/${product.id}`)}
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
