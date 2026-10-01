import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(slug.trim(), email.trim(), password);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      void navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lite-center">
      <form className="lite-card lite-login-card" onSubmit={(event) => void onSubmit(event)}>
        <h1>Travel Lite</h1>
        <p className="lite-muted">Entre com o acesso da agência</p>
        <label className="field">
          <span>Agência</span>
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="gadotti"
            required
          />
        </label>
        <label className="field">
          <span>E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Senha</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? <p className="lite-error">{error}</p> : null}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
