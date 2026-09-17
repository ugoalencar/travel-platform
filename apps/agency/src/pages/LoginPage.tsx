import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { AuthApiError, login, verifyMfa } from '../lib/authApi';
import { getRememberedAgencySlug } from '../lib/session';

type Step = { kind: 'CREDENTIALS' } | { kind: 'MFA'; mfaChallengeToken: string };

// AuthApiError.status differentiates real backend outcomes -- 401 (wrong
// credentials) reads differently from 403 (suspended account) or a plain
// network failure (no status at all, thrown as a non-AuthApiError).
function credentialsErrorMessage(err: unknown): string {
  if (err instanceof AuthApiError) {
    if (err.status === 403) return 'Esta conta está suspensa. Fale com o administrador da agência.';
    if (err.status === 401) return err.message || 'Email, senha ou agência incorretos.';
    return err.message;
  }
  return 'Não foi possível conectar. Verifique sua internet e tente novamente.';
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<Step>({ kind: 'CREDENTIALS' });
  // Prefilled from the last successful login/signup on this browser (see
  // session.ts's rememberAgencySlug) -- the slug is server-generated at
  // signup and never shown anywhere else, so without this a user who logs
  // out has no way to know what to type back in here.
  const [agencySlug, setAgencySlug] = useState(() => getRememberedAgencySlug());
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
      setError(credentialsErrorMessage(err));
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
    <div className="flex min-h-screen">
      {/* Left panel -- brand/value, hidden on narrow screens */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-(--color-travel-navy) via-slate-800 to-(--color-travel-cyan)/40 p-10 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10" />
        <p className="relative text-xl font-bold">Travel Platform</p>
        <div className="relative max-w-sm">
          <h2 className="text-3xl font-bold leading-tight">
            Sua agência, organizada em um só lugar.
          </h2>
          <p className="mt-4 text-white/80">
            Clientes, comercial, viagens e financeiro — com a segurança que uma operação real exige.
          </p>
        </div>
        <p className="relative text-xs text-white/50">
          &copy; {new Date().getFullYear()} Travel Platform
        </p>
      </div>

      {/* Right panel -- form card */}
      <div className="flex w-full items-center justify-center bg-(--color-canvas) px-4 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <p className="text-lg font-bold text-(--color-travel-navy)">Travel Platform</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            {step.kind === 'CREDENTIALS' ? (
              <>
                <h1 className="mb-1 text-xl font-semibold text-slate-900">Entrar</h1>
                <p className="mb-6 text-sm text-slate-500">Acesso da equipe da agência</p>
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
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-(--color-travel-navy) focus:outline-none focus:ring-1 focus:ring-(--color-travel-navy)"
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
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-(--color-travel-navy) focus:outline-none focus:ring-1 focus:ring-(--color-travel-navy)"
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
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-(--color-travel-navy) focus:outline-none focus:ring-1 focus:ring-(--color-travel-navy)"
                      autoComplete="current-password"
                    />
                  </div>
                  {error && (
                    <p role="alert" className="text-sm text-red-600">{error}</p>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-md bg-(--color-travel-navy) px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {submitting ? 'Entrando…' : 'Entrar'}
                  </button>
                  <div className="flex items-center justify-between text-sm">
                    <a href="/forgot-password" className="text-slate-500 hover:underline">
                      Esqueci minha senha
                    </a>
                    <a href="/signup" className="font-medium text-(--color-travel-navy) hover:underline">
                      Criar conta
                    </a>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="mb-1 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-(--color-travel-navy)" />
                  <h1 className="text-xl font-semibold text-slate-900">Verificação em duas etapas</h1>
                </div>
                <p className="mb-6 text-sm text-slate-500">Informe o código do seu aplicativo autenticador.</p>
                <form onSubmit={(e) => void handleMfaSubmit(e)} className="space-y-4">
                  <div>
                    <label htmlFor="code" className="mb-1 block text-sm font-medium text-slate-700">
                      Código
                    </label>
                    <input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      required
                      autoFocus
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-center text-lg tracking-[0.5em] focus:border-(--color-travel-navy) focus:outline-none focus:ring-1 focus:ring-(--color-travel-navy)"
                      autoComplete="one-time-code"
                    />
                  </div>
                  {error && (
                    <p role="alert" className="text-sm text-red-600">{error}</p>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-md bg-(--color-travel-navy) px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {submitting ? 'Verificando…' : 'Confirmar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStep({ kind: 'CREDENTIALS' }); setCode(''); setError(null); }}
                    className="block w-full text-center text-sm text-slate-500 hover:underline"
                  >
                    Voltar
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
