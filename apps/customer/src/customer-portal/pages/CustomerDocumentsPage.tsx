import { useEffect, useState } from 'react';
import {
  ApiError,
  listMyDocuments,
  listMyPaymentSchedule,
} from '../../lib/customerApi';
import type { CustomerDocumentView, CustomerPaymentScheduleItem } from '../../types/customer-portal';

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: T };

function currency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  PASSAPORTE: 'Passaporte',
  RG: 'RG',
  CNH: 'CNH',
  CPF: 'CPF',
  VISTO: 'Visto',
  CERTIDAO: 'Certidão',
  OUTRO: 'Outro',
};

const VERIFICATION_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  VERIFIED: 'Verificado',
  MISMATCH: 'Divergência',
  EXPIRED: 'Expirado',
  MANUAL_REVIEW: 'Em análise',
};

export function CustomerDocumentsPage() {
  const [docsState, setDocsState] = useState<LoadState<CustomerDocumentView[]>>({
    status: 'loading',
  });
  const [scheduleState, setScheduleState] = useState<LoadState<CustomerPaymentScheduleItem[]>>({
    status: 'loading',
  });

  useEffect(() => {
    let cancelled = false;
    listMyDocuments()
      .then((data) => {
        if (!cancelled) setDocsState({ status: 'success', data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar os documentos.';
        setDocsState({ status: 'error', message });
      });
    listMyPaymentSchedule()
      .then((data) => {
        if (!cancelled) setScheduleState({ status: 'success', data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar o cronograma de pagamentos.';
        setScheduleState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Documentos e Pagamentos
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Seus documentos cadastrados e o cronograma de pagamentos da sua viagem.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Meus documentos</h2>
        {docsState.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
        {docsState.status === 'error' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {docsState.message}
          </div>
        )}
        {docsState.status === 'success' && docsState.data.length === 0 && (
          <p className="text-sm text-slate-500">Nenhum documento cadastrado.</p>
        )}
        {docsState.status === 'success' && docsState.data.length > 0 && (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {docsState.data.map((doc) => (
              <li key={doc.id} className="rounded-xl border-2 border-slate-200 bg-white p-4 shadow-sm">
                <p className="font-semibold text-slate-900">
                  {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                </p>
                <p className="text-sm text-slate-600">Número: {doc.documentNumber}</p>
                {doc.expiryDate && (
                  <p className="text-sm text-slate-600">
                    Validade: {new Date(doc.expiryDate).toLocaleDateString('pt-BR')}
                  </p>
                )}
                <span className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {VERIFICATION_LABELS[doc.verificationStatus] ?? doc.verificationStatus}
                </span>
                {doc.attachments.length > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    {doc.attachments.length} arquivo(s) anexado(s)
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Cronograma de pagamentos</h2>
        {scheduleState.status === 'loading' && (
          <p className="text-sm text-slate-500">Carregando...</p>
        )}
        {scheduleState.status === 'error' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {scheduleState.message}
          </div>
        )}
        {scheduleState.status === 'success' && scheduleState.data.length === 0 && (
          <p className="text-sm text-slate-500">Nenhuma parcela registrada.</p>
        )}
        {scheduleState.status === 'success' && scheduleState.data.length > 0 && (
          <div className="overflow-x-auto rounded-xl border-2 border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Vencimento</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-right">Pago</th>
                  <th className="px-4 py-3 text-right">Restante</th>
                </tr>
              </thead>
              <tbody>
                {scheduleState.data.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{item.description}</td>
                    <td className="px-4 py-3">
                      {new Date(item.dueAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">{item.status}</td>
                    <td className="px-4 py-3 text-right">{currency(item.amount)}</td>
                    <td className="px-4 py-3 text-right">{currency(item.amountPaid)}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {currency(item.amountRemaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
