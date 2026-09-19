import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CustomerAuthApiError, login } from '../../lib/customerAuthApi';

export function CustomerLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [agencySlug, setAgencySlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/customer-portal';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(agencySlug.trim(), email.trim(), password);
      void navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof CustomerAuthApiError ? err.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-blue-50/40 px-4">
      <div className="w-full max-w-sm rounded-xl border border-blue-100 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-[color:var(--portal-ink)]">Entrar</h1>
        <p className="mb-6 text-sm text-slate-500">Portal do cliente</p>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
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
            className="w-full rounded-md bg-[#2563eb] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
          <a href="/customer-portal/forgot-password" className="block text-center text-sm text-slate-500 hover:underline">
            Esqueci minha senha
          </a>
        </form>
      </div>
    </div>
  );
}
