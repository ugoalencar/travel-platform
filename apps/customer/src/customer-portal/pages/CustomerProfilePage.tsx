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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Meu perfil</h1>
        <p className="mt-2 text-slate-600">Informações pessoais e dados de contato</p>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-medium">📝 Dados somente leitura</p>
        <p className="mt-1">Para atualizar suas informações, entre em contato com sua agência.</p>
      </div>

      <div aria-live="polite">
        {state.status === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="h-2 w-2 rounded-full bg-slate-300 animate-pulse"></div>
            Carregando...
          </div>
        )}
        {state.status === 'error' && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">Ocorreu um erro</p>
            <p className="mt-1">{state.message}</p>
          </div>
        )}
      </div>

      {state.status === 'success' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 mb-4">
              <span aria-hidden="true">👤</span>
              Informações Pessoais
            </h2>
            <dl className="space-y-4">
              <ProfileDetail label="Nome completo" value={state.profile.name} />
              <ProfileDetail label="E-mail" value={state.profile.email ?? '—'} />
              <ProfileDetail label="Telefone" value={state.profile.phone ?? '—'} />
              <ProfileDetail label="CPF" value={state.profile.cpfMasked ?? '—'} />
              <ProfileDetail label="Passaporte" value={state.profile.passportMasked ?? '—'} />
            </dl>
          </div>

          {state.profile.address && (
            <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 mb-4">
                <span aria-hidden="true">📍</span>
                Endereço
              </h2>
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm font-semibold text-slate-700">Endereço completo</dt>
                  <dd className="mt-1 text-slate-900">{formatAddress(state.profile.address)}</dd>
                </div>
              </dl>
            </div>
          )}

          {state.agency && (
            <div className="rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-sm">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 mb-4">
                <span aria-hidden="true">🏢</span>
                Sua Agência
              </h2>
              <dl className="space-y-4">
                <ProfileDetail label="Agência" value={state.agency.name} />
                {state.agency.phone && <ProfileDetail label="Telefone" value={state.agency.phone} />}
                {state.agency.email && <ProfileDetail label="E-mail" value={state.agency.email} />}
              </dl>
              <p className="mt-4 text-xs text-amber-700 pt-4 border-t border-amber-200">
                ✉️ Entre em contato com sua agência para qualquer dúvida ou atualização de dados.
              </p>
            </div>
          )}
        </div>
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

function ProfileDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900 font-medium">{value}</dd>
    </div>
  );
}
