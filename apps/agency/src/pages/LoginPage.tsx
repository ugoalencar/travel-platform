import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthApiError, login, verifyMfa } from '../lib/authApi';

type Step = { kind: 'CREDENTIALS' } | { kind: 'MFA'; mfaChallengeToken: string };

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<Step>({ kind: 'CREDENTIALS' });
  const [agencySlug, setAgencySlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  async function handleCredentialsSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(agencySlug.trim(), email.trim(), password);
      if (result.state === 'MFA_REQUIRED') {
        setStep({ kind: 'MFA', mfaChallengeToken: result.mfaChallengeToken });
      } else {
        void navigate(redirectTo, { replace: true });
      }
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMfaSubmit(event: FormEvent) {
    event.preventDefault();
    if (step.kind !== 'MFA') return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await verifyMfa(step.mfaChallengeToken, code.trim());
      if (result.state === 'FULLY_AUTHENTICATED') {
        void navigate(redirectTo, { replace: true });
      }
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Código inválido. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-canvas) px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Entrar</h1>
        <p className="mb-6 text-sm text-slate-500">Acesso da equipe da agência</p>

        {step.kind === 'CREDENTIALS' ? (
          <form onSubmit={(e) => void handleCredentialsSubmit(e)} className="space-y-4">
            <div>
              <label htmlFor="agencySlug" className="mb-1 block text-sm font-medium text-slate-700">
                Agência
              </label>
              <input
                id="agencySlug"
                type="text"
                required
                value={agencySlug}
                onChange={(e) => setAgencySlug(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                autoComplete="organization"
              />
            </div>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                autoComplete="username"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
                Senha
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {submitting ? 'Entrando…' : 'Entrar'}
            </button>
            <a href="/forgot-password" className="block text-center text-sm text-slate-500 hover:underline">
              Esqueci minha senha
            </a>
          </form>
        ) : (
          <form onSubmit={(e) => void handleMfaSubmit(e)} className="space-y-4">
            <p className="text-sm text-slate-600">Informe o código do seu aplicativo autenticador.</p>
            <div>
              <label htmlFor="code" className="mb-1 block text-sm font-medium text-slate-700">
                Código
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm tracking-widest"
                autoComplete="one-time-code"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {submitting ? 'Verificando…' : 'Verificar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
