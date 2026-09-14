import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CustomerAuthApiError, resetPassword } from '../../lib/customerAuthApi';

export function CustomerResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof CustomerAuthApiError ? err.message : 'Não foi possível redefinir a senha.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-orange-50/40 px-4">
        <p className="text-sm text-red-600">Link de redefinição inválido.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-orange-50/40 px-4">
      <div className="w-full max-w-sm rounded-xl border border-orange-100 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-[color:var(--portal-ink)]">Definir nova senha</h1>
        {done ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-600">
              Senha redefinida com sucesso. Todas as sessões anteriores foram encerradas.
            </p>
            <button
              onClick={() => void navigate('/customer-portal/login', { replace: true })}
              className="w-full rounded-md bg-[#f97362] px-3 py-2 text-sm font-medium text-white"
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
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-[#f97362] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {submitting ? 'Salvando…' : 'Salvar nova senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
