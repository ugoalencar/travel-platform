import { useEffect, useState } from 'react';
import { ApiError, getMyAgencyContact, getMyProfile } from '../../lib/customerApi';
import type { CustomerAgencyContact, CustomerProfile } from '../../types/customer-portal';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; profile: CustomerProfile; agency: CustomerAgencyContact | null };

export function CustomerProfilePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMyProfile(), getMyAgencyContact().catch(() => null)])
      .then(([profile, agency]) => {
        if (!cancelled) setState({ status: 'success', profile, agency });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar seu perfil.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Meu perfil</h1>
      <p className="text-sm text-slate-500">
        Estas informações são somente leitura. Fale com sua agência para atualizar.
      </p>

      <div aria-live="polite">
        {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
        {state.status === 'error' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
      </div>

      {state.status === 'success' && (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Detail label="Nome" value={state.profile.name} />
              <Detail label="E-mail" value={state.profile.email ?? '—'} />
              <Detail label="Telefone" value={state.profile.phone ?? '—'} />
              {/* CPF/passport masking happens entirely server-side (see
                  services/api/src/customer-portal.ts maskTail) -- the API
                  never sends the raw value to this page, so there is
                  nothing to mask here client-side. */}
              <Detail label="CPF" value={state.profile.cpfMasked ?? '—'} />
              <Detail label="Passaporte" value={state.profile.passportMasked ?? '—'} />
              {state.profile.address && (
                <div className="sm:col-span-2">
                  <Detail label="Endereço" value={formatAddress(state.profile.address)} />
                </div>
              )}
            </dl>
          </div>

          {state.agency && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">
                Fale com sua agência
              </h2>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Detail label="Agência" value={state.agency.name} />
                {state.agency.phone && <Detail label="Telefone" value={state.agency.phone} />}
                {state.agency.email && <Detail label="E-mail" value={state.agency.email} />}
              </dl>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatAddress(address: Record<string, unknown>): string {
  const parts = Object.values(address)
    .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
    .map((v) => String(v).trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : '—';
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value}</dd>
    </div>
  );
}
