import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import {
  DEFAULT_BRANDING,
  brandingStyle,
  fetchPublicBranding,
  isValidSlug,
  recallSlug,
  type Branding,
} from '../branding';

const BRANDING_DEBOUNCE_MS = 400;
const GENERIC_MESSAGE = 'Se os dados estiverem corretos, enviaremos instruções para o e-mail cadastrado.';

/**
 * Public "Esqueci minha senha". The response is always the same message,
 * regardless of whether the agency/e-mail exist -- the backend already
 * enforces this (services/api-lite/src/routes/auth.ts); this page just
 * never renders a different message for success vs. "not found" either.
 */
export function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const [slug, setSlug] = useState(() => searchParams.get('agencia')?.trim().toLowerCase() || recallSlug());
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      await api('/auth/forgot-password', {
        method: 'POST',
        token: null,
        body: { slug: slug.trim(), email: email.trim() },
      });
      setSent(true);
    } catch (err) {
      // 429 is the one case shown distinctly: it is IP-scoped, not
      // account-scoped, so surfacing it tells an anonymous caller nothing
      // about whether the agency/e-mail exist. Everything else (including a
      // real 4xx/5xx from the backend) still shows the same generic
      // "sent" message, exactly like a 200 would -- no enumeration signal.
      if (err instanceof ApiError && err.status === 429) {
        setError('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      } else {
        setSent(true);
      }
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
        <h1>Esqueci minha senha</h1>
        {sent ? (
          <>
            <p className="lite-success" role="status">
              {GENERIC_MESSAGE}
            </p>
            <div className="form-actions">
              <Link className="btn btn-primary" to="/login">
                Voltar ao login
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="lite-muted">
              Informe a agência e o e-mail cadastrado. Enviaremos um link para você criar uma nova senha.
            </p>
            <label className="field">
              <span>Agência</span>
              <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="gadotti" required />
            </label>
            <label className="field">
              <span>E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            {error ? <p className="lite-error">{error}</p> : null}
            <div className="form-actions">
              <Link className="btn" to="/login">
                Voltar ao login
              </Link>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Enviando…' : 'Enviar instruções'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
