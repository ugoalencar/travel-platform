import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { DEFAULT_BRANDING, brandingStyle, type Branding } from '../branding';

/**
 * Reached from the link sent by /auth/forgot-password: /reset-password?token=...
 * The token itself never gets a tenant-specific look (no branding lookup by
 * slug is possible here -- the token is all this page has), so it renders
 * with the default theme.
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const branding: Branding = DEFAULT_BRANDING;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação não confere com a nova senha.');
      return;
    }
    setBusy(true);
    try {
      await api('/auth/reset-password', { method: 'POST', token: null, body: { token, newPassword } });
      setDone(true);
      window.setTimeout(() => void navigate('/login', { replace: true }), 2500);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível redefinir a senha. Tente novamente.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="lite-center" style={brandingStyle(branding)}>
        <section className="lite-card lite-login-card">
          <h1>Link inválido</h1>
          <p className="lite-muted">Este endereço não traz um token de redefinição. Peça um novo link.</p>
          <div className="form-actions">
            <Link className="btn btn-primary" to="/forgot-password">
              Esqueci minha senha
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="lite-center" style={brandingStyle(branding)}>
      <form className="lite-card lite-login-card" onSubmit={(event) => void onSubmit(event)}>
        <h1>Definir nova senha</h1>
        {done ? (
          <p className="lite-success" role="status">
            Senha redefinida com sucesso. Redirecionando para o login…
          </p>
        ) : (
          <>
            <p className="lite-muted">Crie uma nova senha para entrar no Travel Lite.</p>
            <label className="field">
              <span>Nova senha</span>
              <input
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="field">
              <span>Confirmar nova senha</span>
              <input
                type="password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            {error ? <p className="lite-error">{error}</p> : null}
            <div className="form-actions">
              <Link className="btn" to="/login">
                Voltar ao login
              </Link>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Salvando…' : 'Definir nova senha'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
