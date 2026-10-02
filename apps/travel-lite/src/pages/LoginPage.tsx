import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  DEFAULT_BRANDING,
  brandingStyle,
  fetchPublicBranding,
  isValidSlug,
  recallSlug,
  rememberSlug,
  type Branding,
} from '../branding';

const BRANDING_DEBOUNCE_MS = 400;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [slug, setSlug] = useState(() => searchParams.get('agencia')?.trim().toLowerCase() || recallSlug());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  useEffect(() => {
    if (!isValidSlug(slug)) {
      setBranding(DEFAULT_BRANDING);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void fetchPublicBranding(slug).then((result) => {
        if (active) setBranding(result);
      });
    }, BRANDING_DEBOUNCE_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [slug]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(slug.trim(), email.trim(), password);
      rememberSlug(slug);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      void navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lite-center" style={brandingStyle(branding)}>
      <form className="lite-card lite-login-card" onSubmit={(event) => void onSubmit(event)}>
        {branding.logoDataUrl ? (
          <img
            className="lite-login-logo"
            src={branding.logoDataUrl}
            alt={branding.displayName ? `Logo ${branding.displayName}` : 'Logo da agência'}
          />
        ) : null}
        <h1>{branding.displayName ?? 'Travel Lite'}</h1>
        <p className="lite-muted">{branding.welcomeText ?? 'Entre com o acesso da agência'}</p>
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
