import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PlatformAuthApiError, resetPasswordWithToken } from '../lib/platformAuthApi';

const MIN_PASSWORD_LENGTH = 12;

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmation) {
      setError('As senhas não conferem.');
      return;
    }
    setSubmitting(true);
    try {
      await resetPasswordWithToken(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof PlatformAuthApiError ? err.message : 'Não foi possível redefinir a senha.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-white">Redefinir senha</h1>
        <p className="mb-6 text-sm text-slate-400">Painel da Plataforma</p>

        {!token ? (
          <p className="text-sm text-red-400">Link inválido. Solicite uma nova redefinição de senha.</p>
        ) : done ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Senha redefinida. Todas as sessões anteriores foram encerradas. Entre com a nova senha e o código do
              seu autenticador.
            </p>
            <Link
              to="/login"
              className="block w-full rounded-md bg-white px-3 py-2 text-center text-sm font-medium text-slate-900"
            >
              Ir para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-300">
                Nova senha
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label htmlFor="confirmation" className="mb-1 block text-sm font-medium text-slate-300">
                Confirmar nova senha
              </label>
              <input
                id="confirmation"
                type="password"
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                autoComplete="new-password"
              />
            </div>
            <p className="text-xs text-slate-500">Mínimo de {MIN_PASSWORD_LENGTH} caracteres.</p>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-60"
            >
              {submitting ? 'Salvando…' : 'Redefinir senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
