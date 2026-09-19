import { useEffect, useState } from 'react';
import { ApiError, listMyDocuments } from '../../lib/customerApi';
import type { CustomerDocumentView } from '../../types/customer-portal';
import { Tabs } from '../Tabs';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: CustomerDocumentView[] };

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  PASSAPORTE: 'Passaporte',
  RG: 'RG',
  CNH: 'CNH',
  CPF: 'CPF',
  VISTO: 'Visto',
  CERTIDAO: 'Certidão',
  OUTRO: 'Outro',
};

const DOCUMENT_TYPE_ICON: Record<string, string> = {
  PASSAPORTE: '🛂',
  RG: '🪪',
  CNH: '🚗',
  CPF: '🪪',
  VISTO: '📋',
  CERTIDAO: '📜',
  OUTRO: '📄',
};

// Friendly copy for the verification status -- a customer shouldn't have
// to know what "MANUAL_REVIEW" means internally.
const VERIFICATION_COPY: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Aguardando verificação', className: 'bg-amber-100 text-amber-900' },
  VERIFIED: { label: 'Verificado ✓', className: 'bg-green-100 text-green-900' },
  MISMATCH: { label: 'Precisa de atenção', className: 'bg-red-100 text-red-900' },
  EXPIRED: { label: 'Expirado', className: 'bg-red-100 text-red-900' },
  MANUAL_REVIEW: { label: 'Em análise pela agência', className: 'bg-blue-100 text-blue-900' },
};

export function CustomerDocumentsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    listMyDocuments()
      .then((data) => {
        if (!cancelled) setState({ status: 'success', data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar os documentos.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Documentos</h1>
        <p className="mt-2 text-slate-600">
          Seus documentos cadastrados para viajar com tranquilidade.
        </p>
      </div>

      <div aria-live="polite">
        {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
        {state.status === 'error' && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            {state.message}
          </div>
        )}
        {state.status === 'success' && state.data.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
            <p className="text-2xl" aria-hidden="true">🗂️</p>
            <p className="mt-2 text-sm font-medium text-slate-600">
              Nenhum documento cadastrado ainda.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Sua agência pode adicionar seus documentos de viagem por aqui.
            </p>
          </div>
        )}
      </div>

      {state.status === 'success' && state.data.length > 0 && (
        <DocumentsTabs documents={state.data} />
      )}
    </div>
  );
}

const DOCUMENT_TABS = [
  { key: 'all', label: 'Todos' },
  { key: 'available', label: 'Disponíveis' },
  { key: 'pending', label: 'Pendentes' },
] as const;

function DocumentsTabs({ documents }: { documents: CustomerDocumentView[] }) {
  return (
    <Tabs tabs={DOCUMENT_TABS}>
      {(activeKey) => {
        const filtered = documents.filter((doc) => {
          if (activeKey === 'available') return doc.verificationStatus === 'VERIFIED';
          if (activeKey === 'pending') {
            return doc.verificationStatus === 'PENDING' || doc.verificationStatus === 'MISMATCH';
          }
          return true;
        });

        if (filtered.length === 0) {
          return (
            <p className="text-sm text-slate-500">
              Nenhum documento nesta categoria.
            </p>
          );
        }

        return (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((doc) => {
              const verification = VERIFICATION_COPY[doc.verificationStatus] ?? {
                label: doc.verificationStatus,
                className: 'bg-slate-100 text-slate-700',
              };
              return (
                <li
                  key={doc.id}
                  className="rounded-xl border-2 border-blue-100 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-2xl" aria-hidden="true">
                      {DOCUMENT_TYPE_ICON[doc.documentType] ?? '📄'}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${verification.className}`}>
                      {verification.label}
                    </span>
                  </div>
                  <p className="mt-3 font-semibold text-slate-900">
                    {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                  </p>
                  <p className="text-sm text-slate-600">Número: {doc.documentNumber}</p>
                  {doc.expiryDate && (
                    <p className="text-sm text-slate-600">
                      Validade: {new Date(doc.expiryDate).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                  {doc.attachments.length > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      {doc.attachments.length} arquivo(s) anexado(s)
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        );
      }}
    </Tabs>
  );
}
