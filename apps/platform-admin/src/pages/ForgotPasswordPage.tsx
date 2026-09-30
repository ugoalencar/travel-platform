import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PlatformAuthApiError, requestPasswordReset } from '../lib/platformAuthApi';

// The API answers the same way whether or not the e-mail exists, so this
// page always shows the same confirmation (no account enumeration).
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof PlatformAuthApiError ? err.message : 'Não foi possível enviar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-white">Esqueci minha senha</h1>
        <p className="mb-6 text-sm text-slate-400">Painel da Plataforma</p>

        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Se o email estiver cadastrado, você receberá um link para redefinir a senha. O link expira em 30 minutos e
              só pode ser usado uma vez.
            </p>
            <Link to="/login" className="block text-center text-sm text-slate-400 hover:text-white">
              Voltar para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
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
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-60"
            >
              {submitting ? 'Enviando…' : 'Enviar link de redefinição'}
            </button>
            <Link to="/login" className="block text-center text-sm text-slate-400 hover:text-white">
              Voltar para o login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
