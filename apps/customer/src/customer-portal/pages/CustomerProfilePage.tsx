import { useEffect, useState } from 'react';
import { ApiError, getMyProfile, getMyAgencyContact } from '../../lib/customerApi';
import type { CustomerProfile, CustomerAgencyContact } from '../../types/customer-portal';
import { BackLink } from '../BackLink';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; profile: CustomerProfile };

export function CustomerProfilePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [isEditing, setIsEditing] = useState(false);
  const [agencyContact, setAgencyContact] = useState<CustomerAgencyContact | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMyProfile(), getMyAgencyContact()])
      .then(([profile, agency]) => {
        if (!cancelled) {
          setState({ status: 'success', profile });
          setAgencyContact(agency);
        }
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
      <BackLink to="/customer-portal" label="Voltar ao início" />

      <div aria-live="polite">
        {state.status === 'loading' && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
            <span className="text-sm text-slate-500">Carregando perfil...</span>
          </div>
        )}
        {state.status === 'error' && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
      </div>

      {state.status === 'success' && (
        <>
          {/* Profile Header */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 p-8 text-white shadow-xl">
            <div className="absolute -right-8 -top-8 text-8xl opacity-20">👤</div>
            <div className="relative">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-2xl font-bold">
                  {state.profile.name
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')}
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">{state.profile.name}</h1>
                  <p className="mt-1 text-teal-100">{state.profile.email}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Edit Toggle */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-colors ${
                isEditing
                  ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  : 'bg-teal-600 text-white hover:bg-teal-700'
              }`}
            >
              {isEditing ? '✕ Cancelar' : '✏️ Editar perfil'}
            </button>
          </div>

          {/* Personal Info */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Dados pessoais
            </h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ProfileField label="Nome completo" value={state.profile.name ?? 'Não informado'} />
              <ProfileField label="E-mail" value={state.profile.email ?? 'Não informado'} />
              <ProfileField label="Telefone" value={state.profile.phone ?? 'Não informado'} />
              <ProfileField
                label="CPF"
                value={state.profile.cpfMasked ?? 'Não informado'}
                masked
              />
              <ProfileField
                label="Passaporte"
                value={state.profile.passportMasked ?? 'Não informado'}
                masked
              />
            </dl>
          </div>

          {/* Address */}
          {state.profile.address && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Endereço
              </h2>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {Object.entries(state.profile.address).map(([key, value]) => (
                  <ProfileField
                    key={key}
                    label={key}
                    value={
                      typeof value === 'string' || typeof value === 'number'
                        ? String(value)
                        : value == null
                          ? ''
                          : JSON.stringify(value)
                    }
                  />
                ))}
              </dl>
            </div>
          )}

          {/* Security Notice */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <span className="text-xl">🔒</span>
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  Dados sensíveis protegidos
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  CPF e passaporte são parcialmente mascarados por segurança. Para alterar dados
                  sensíveis, entre em contato com sua agência.
                </p>
              </div>
            </div>
          </div>

          {/* Change Contact Button (Prototype) */}
          {isEditing && (
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-5">
              <h2 className="mb-3 text-sm font-semibold text-teal-900">
                Alterar dados de contato
              </h2>
              <p className="mb-4 text-sm text-teal-700">
                Para alterar telefone ou endereço, entre em contato com sua agência.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
                >
                  📞 Falar com a agência
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                >
                  💬 Enviar mensagem
                </button>
              </div>
            </div>
          )}

          {/* Agency Contact */}
          {agencyContact && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Contato da agência
              </h2>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Nome
                  </dt>
                  <dd className="mt-1 text-sm text-slate-900">{agencyContact.name}</dd>
                </div>
                {agencyContact.phone && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Telefone
                    </dt>
                    <dd className="mt-1 text-sm text-slate-900">{agencyContact.phone}</dd>
                  </div>
                )}
                {agencyContact.email && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      E-mail
                    </dt>
                    <dd className="mt-1 text-sm text-slate-900">{agencyContact.email}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Preferences (Prototype) */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Preferências de viagem
            </h2>
            <div className="space-y-3">
              <PreferenceItem label="Assento" value="Janela" />
              <PreferenceItem label="Refeições" value="Sem restrições" />
              <PreferenceItem label="Idioma" value="Português" />
              <PreferenceItem label="Notificações" value="E-mail e SMS" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ProfileField({
  label,
  value,
  masked = false,
}: {
  label: string;
  value: string;
  masked?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 text-sm ${masked ? 'font-mono text-slate-600' : 'text-slate-900'}`}>
        {value}
      </dd>
    </div>
  );
}

function PreferenceItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}
