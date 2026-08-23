import { useEffect, useState } from 'react';
import { ApiError, getMyProfile } from '../../lib/customerApi';
import type { CustomerProfile } from '../../types/customer-portal';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; profile: CustomerProfile };

export function CustomerProfilePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getMyProfile()
      .then((profile) => {
        if (!cancelled) setState({ status: 'success', profile });
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

  if (state.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando...</p>;
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {state.message}
      </div>
    );
  }

  const { profile } = state;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Meu perfil</h1>
      <p className="text-sm text-slate-500">
        Estas informações são somente leitura. Fale com sua agência para atualizar.
      </p>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Detail label="Nome" value={profile.name} />
          <Detail label="E-mail" value={profile.email ?? '—'} />
          <Detail label="Telefone" value={profile.phone ?? '—'} />
          <Detail label="CPF" value={profile.cpfMasked ?? '—'} />
          <Detail label="Passaporte" value={profile.passportMasked ?? '—'} />
        </dl>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value}</dd>
    </div>
  );
}
