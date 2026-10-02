import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  DEFAULT_BRANDING,
  brandingStyle,
  fetchPublicBranding,
  isValidSlug,
  recallSlug,
  rememberSlug,
  slugFromCurrentHostname,
  slugFromCurrentPathname,
  type Branding,
} from '../branding';

const BRANDING_DEBOUNCE_MS = 400;

export function LoginPage() {
  const { login, passwordChangeRequired, completeRequiredPasswordChange, cancelRequiredPasswordChange } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const routeSlug = slugFromCurrentPathname() || slugFromCurrentHostname();
  const lockedSlug = routeSlug !== '';
  const [slug, setSlug] = useState(() => routeSlug || searchParams.get('agencia')?.trim().toLowerCase() || recallSlug());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
      const result = await login(slug.trim(), email.trim(), password);
      if (result === 'password-change-required') {
        setCurrentPassword(password);
        setPassword('');
        return;
      }
      rememberSlug(slug);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      void navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login');
    } finally {
      setBusy(false);
    }
  }

  async function onPasswordChangeSubmit(event: FormEvent) {
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
      await completeRequiredPasswordChange(currentPassword, newPassword);
      rememberSlug(slug);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      void navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar a nova senha');
    } finally {
      setBusy(false);
    }
  }

  if (passwordChangeRequired) {
    return (
      <div className="lite-center" style={brandingStyle(branding)}>
        <form className="lite-card lite-login-card" onSubmit={(event) => void onPasswordChangeSubmit(event)}>
          {branding.logoDataUrl ? (
            <img
              className="lite-login-logo"
              src={branding.logoDataUrl}
              alt={branding.displayName ? `Logo ${branding.displayName}` : 'Logo da agência'}
            />
          ) : null}
          <h1>Criar nova senha</h1>
          <p className="lite-muted">
            Este acesso usa uma senha temporária. Crie uma senha definitiva para entrar no Travel Lite.
          </p>
          <label className="field">
            <span>Senha temporária ou atual</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
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
            <button type="button" className="btn" onClick={cancelRequiredPasswordChange} disabled={busy}>
              Voltar ao login
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Salvando…' : 'Criar senha e entrar'}
            </button>
          </div>
        </form>
      </div>
    );
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
            disabled={lockedSlug}
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
        <Link className="lite-forgot-password" to={slug ? `/forgot-password?agencia=${encodeURIComponent(slug)}` : '/forgot-password'}>
          Esqueci minha senha
        </Link>
      </form>
    </div>
  );
}
