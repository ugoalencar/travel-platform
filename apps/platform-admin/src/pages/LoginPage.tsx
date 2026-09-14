import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PlatformAuthApiError, login, verifyMfa } from '../lib/platformAuthApi';

type Step = { kind: 'CREDENTIALS' } | { kind: 'MFA'; mfaChallengeToken: string };

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<Step>({ kind: 'CREDENTIALS' });
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
      const result = await login(email.trim(), password);
      if (result.state === 'MFA_REQUIRED') {
        setStep({ kind: 'MFA', mfaChallengeToken: result.mfaChallengeToken });
      } else {
        void navigate(redirectTo, { replace: true });
      }
    } catch (err) {
      setError(err instanceof PlatformAuthApiError ? err.message : 'Não foi possível entrar. Tente novamente.');
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
      setError(err instanceof PlatformAuthApiError ? err.message : 'Código inválido. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-white">Entrar</h1>
        <p className="mb-6 text-sm text-slate-400">Painel da Plataforma</p>

        {step.kind === 'CREDENTIALS' ? (
          <form onSubmit={(e) => void handleCredentialsSubmit(e)} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-300">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                autoComplete="username"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-300">
                Senha
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-60"
            >
              {submitting ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void handleMfaSubmit(e)} className="space-y-4">
            <p className="text-sm text-slate-400">Informe o código do seu aplicativo autenticador.</p>
            <div>
              <label htmlFor="code" className="mb-1 block text-sm font-medium text-slate-300">
                Código
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white tracking-widest"
                autoComplete="one-time-code"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-60"
            >
              {submitting ? 'Verificando…' : 'Verificar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
