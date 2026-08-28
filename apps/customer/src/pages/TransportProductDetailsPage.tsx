import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getRoute, getTransportProduct } from '../lib/api';
import type { TransportProduct } from '../types/transport';
import { Button } from '../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      product: TransportProduct;
      outboundRouteName: string | null;
      returnRouteName: string | null;
    };

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Produto não encontrado.';
  }
  return 'Não foi possível carregar o produto. Tente novamente.';
}

export function TransportProductDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setState({ status: 'error', message: 'Produto não encontrado.' });
      return;
    }

    setState({ status: 'loading' });

    getTransportProduct(id)
      .then(async (product) => {
        if (cancelled) return;

        const outboundRouteName = await getRoute(product.outboundRouteId)
          .then((r) => `${r.origin} → ${r.destination}`)
          .catch(() => null);

        const returnRouteName = product.returnRouteId
          ? await getRoute(product.returnRouteId)
              .then((r) => `${r.origin} → ${r.destination}`)
              .catch(() => null)
          : null;

        if (cancelled) return;
        setState({ status: 'success', product, outboundRouteName, returnRouteName });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', message: mapErrorToMessage(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Detalhes do produto
        </h1>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => void navigate('/transport/products')}>
            Voltar
          </Button>
          {state.status === 'success' && (
            <Button onClick={() => void navigate(`/transport/products/${state.product.id}/edit`)}>
              Editar
            </Button>
          )}
        </div>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-slate-500">Carregando produto...</p>
      )}

      {state.status === 'error' && (
        <div role="alert" aria-live="assertive" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <dl className="grid max-w-lg grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <Field label="Nome" value={state.product.name} />
          <Field label="Tipo de viagem" value={state.product.tripType} />
          <Field label="Rota de ida" value={state.outboundRouteName ?? state.product.outboundRouteId} />
          <Field label="Rota de volta" value={state.returnRouteName ?? undefined} />
          <Field label="Preço" value={String(state.product.price)} />
          <Field label="Ativo" value={state.product.active ? 'Sim' : 'Não'} />
          <Field label="Vendável publicamente" value={state.product.publiclyBookable ? 'Sim — disponível para clientes e canais externos' : 'Não — apenas reserva manual interna'} />
          <Field label="Notas" value={state.product.notes} />
          <Field label="Criado em" value={state.product.createdAt} />
          <Field label="Atualizado em" value={state.product.updatedAt} />
        </dl>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value ?? '—'}</dd>
    </div>
  );
}
