import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthApiError, resetPassword } from '../lib/authApi';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    // Client-side-only check -- the backend has no confirmation field, this
    // just catches typos before the (real, single) resetPassword call.
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Não foi possível redefinir a senha.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--color-canvas) px-4">
        <p className="text-sm text-red-600">Link de redefinição inválido.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-canvas) px-4">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-lg font-bold text-(--color-travel-navy)">Travel Platform</p>
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="mb-1 text-xl font-semibold text-slate-900">Definir nova senha</h1>
          {done ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-slate-600">
                Senha redefinida com sucesso. Todas as sessões anteriores foram encerradas.
              </p>
              <button
                onClick={() => void navigate('/login', { replace: true })}
                className="w-full rounded-md bg-(--color-travel-navy) px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Ir para o login
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
              <div>
                <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-slate-700">
                  Nova senha
                </label>
                <input
                  id="newPassword"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-(--color-travel-navy) focus:outline-none focus:ring-1 focus:ring-(--color-travel-navy)"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-slate-700">
                  Confirmar nova senha
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-(--color-travel-navy) focus:outline-none focus:ring-1 focus:ring-(--color-travel-navy)"
                  autoComplete="new-password"
                />
              </div>
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-(--color-travel-navy) px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {submitting ? 'Salvando…' : 'Salvar nova senha'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
