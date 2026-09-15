import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

// Public, unauthenticated invite-acceptance form. Same shape as
// EnrollmentPage.tsx: no shell, resolves entirely via the :token in the
// URL (never a tenant id the browser could pick), talks directly to the
// token-only public API (/invitations/:token, /invitations/:token/accept).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

type ResolveState =
  | { status: 'checking' }
  | { status: 'invalid' }
  | { status: 'valid'; email: string; role: string; name?: string };
type SubmitState = 'idle' | 'submitting' | 'done' | 'error';

export function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const [resolveState, setResolveState] = useState<ResolveState>({ status: 'checking' });
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!token) {
      setResolveState({ status: 'invalid' });
      return;
    }
    fetch(`${API_BASE_URL}/invitations/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          setResolveState({ status: 'invalid' });
          return;
        }
        const body = (await res.json()) as { email: string; role: string; name?: string };
        setResolveState({ status: 'valid', email: body.email, role: body.role, ...(body.name ? { name: body.name } : {}) });
      })
      .catch(() => setResolveState({ status: 'invalid' }));
  }, [token]);

  // The admin already entered the name when creating the invitation
  // (most invitations, going forward) -- this screen is then just
  // "confirm and set a password," matching what was requested directly:
  // the invitee shouldn't have to fill out a second registration form.
  // Only invitations created before that field existed (no name on the
  // resolved invitation) still ask for one here.
  const nameIsPreset = resolveState.status === 'valid' && Boolean(resolveState.name);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!nameIsPreset && !name.trim()) {
      setErrorMessage('Informe seu nome.');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('As senhas não coincidem.');
      return;
    }

    setSubmitState('submitting');
    setErrorMessage(null);

    fetch(`${API_BASE_URL}/invitations/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(nameIsPreset ? {} : { name: name.trim() }), password }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? 'Não foi possível aceitar o convite.');
        }
        setSubmitState('done');
      })
      .catch((err: unknown) => {
        setErrorMessage(err instanceof Error ? err.message : 'Não foi possível aceitar o convite.');
        setSubmitState('error');
      });
  };

  if (resolveState.status === 'checking') {
    return <CenteredMessage>Verificando convite…</CenteredMessage>;
  }

  if (resolveState.status === 'invalid') {
    return (
      <CenteredMessage>
        Este convite não é válido, já foi utilizado ou expirou. Peça para a agência enviar um novo
        convite.
      </CenteredMessage>
    );
  }

  if (submitState === 'done') {
    return (
      <CenteredMessage>
        Conta criada com sucesso! Você já pode entrar com seu e-mail e a senha que definiu.
      </CenteredMessage>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '48px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>
        {nameIsPreset ? `Bem-vindo(a), ${resolveState.name}` : 'Você foi convidado(a)'}
      </h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
        <strong>{resolveState.email}</strong> foi convidado(a) como <strong>{resolveState.role}</strong>.
        {nameIsPreset ? ' Defina sua senha para concluir.' : ' Confirme seu nome para concluir.'}
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!nameIsPreset && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            <span style={{ fontWeight: 500, color: '#444' }}>Nome completo *</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #d0d0d0',
                fontSize: 14,
                fontFamily: 'inherit',
              }}
            />
          </label>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          <span style={{ fontWeight: 500, color: '#444' }}>Senha (mín. 8 caracteres) *</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #d0d0d0',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          <span style={{ fontWeight: 500, color: '#444' }}>Confirmar senha *</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #d0d0d0',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          />
        </label>

        {errorMessage ? <p style={{ color: '#c0392b', fontSize: 13 }}>{errorMessage}</p> : null}

        <button
          type="submit"
          disabled={submitState === 'submitting'}
          style={{
            padding: '10px 16px',
            borderRadius: 6,
            border: 'none',
            background: '#2563eb',
            color: 'white',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {submitState === 'submitting' ? 'Confirmando…' : 'Aceitar convite'}
        </button>
      </form>
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
        color: '#333',
      }}
    >
      <p style={{ maxWidth: 420 }}>{children}</p>
    </div>
  );
}
