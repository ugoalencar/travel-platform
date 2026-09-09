import { useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import { listAssets, listEntitlements } from '../../lib/offerGrowthApi';
import type { Asset } from '../../types/offerGrowth';
import { ASSET_SOURCE_LABELS, ASSET_TYPE_LABELS, labelFor } from '../../lib/offerGrowthLabels';
import { EntitlementNotice } from '../../components/offer-growth/EntitlementNotice';

type LoadState =
  | { status: 'loading' }
  | { status: 'entitlement-disabled' }
  | { status: 'error'; message: string }
  | { status: 'ready'; assets: Asset[] };

export function AssetsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    Promise.all([listAssets(), listEntitlements().catch(() => [])])
      .then(([assets]) => {
        if (!cancelled) setState({ status: 'ready', assets });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 403) {
          setState({ status: 'entitlement-disabled' });
          return;
        }
        setState({ status: 'error', message: 'Não foi possível carregar a biblioteca de arquivos.' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ofertas e crescimento</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Biblioteca de arquivos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Imagens, vídeos e materiais capturados pelo Pescador, enviados manualmente ou vindos da
          biblioteca da agência.
        </p>
      </div>

      {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando arquivos...</p>}
      {state.status === 'entitlement-disabled' && <EntitlementNotice feature="CREATIVE_STUDIO" />}
      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'ready' && (
        <>
          {state.assets.length === 0 && (
            <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
              Nenhum arquivo disponível ainda. Os arquivos aparecem aqui quando o Pescador captura uma
              imagem aprovada, ou quando uma agência os cadastra. Não há upload manual disponível
              nesta tela (a API ainda não expõe um endpoint de upload de arquivo).
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.assets.map((asset) => (
              <article key={asset.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-3 flex aspect-video items-center justify-center overflow-hidden rounded-md bg-slate-100">
                  {asset.type === 'IMAGE' && asset.storageUrl ? (
                    <img
                      src={asset.storageUrl}
                      alt={asset.sourceCaptureId ?? asset.id}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl" aria-hidden>
                      {typeIcon(asset.type)}
                    </span>
                  )}
                </div>
                <p className="truncate text-sm font-medium text-slate-900">{asset.id}</p>
                <p className="text-xs text-slate-500">
                  {labelFor(ASSET_TYPE_LABELS, asset.type)} · {labelFor(ASSET_SOURCE_LABELS, asset.source)}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {new Date(asset.createdAt).toLocaleDateString('pt-BR')}
                </p>
                {asset.sourceCaptureId && (
                  <p className="mt-1 truncate text-xs text-slate-400">
                    Origem: captura {asset.sourceCaptureId}
                  </p>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function typeIcon(type: Asset['type']): string {
  switch (type) {
    case 'IMAGE':
      return '🖼️';
    case 'VIDEO':
      return '🎬';
    case 'LOGO':
      return '🏷️';
    case 'ICON':
      return '⭐';
    case 'DOCUMENT':
      return '📄';
    default:
      return '📁';
  }
}
