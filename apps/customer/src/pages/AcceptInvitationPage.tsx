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
  | { status: 'valid'; email: string; role: string };
type SubmitState = 'idle' | 'submitting' | 'done' | 'error';

export function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const [resolveState, setResolveState] = useState<ResolveState>({ status: 'checking' });
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [name, setName] = useState('');

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
        const body = (await res.json()) as { email: string; role: string };
        setResolveState({ status: 'valid', email: body.email, role: body.role });
      })
      .catch(() => setResolveState({ status: 'invalid' }));
  }, [token]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!name.trim()) {
      setErrorMessage('Informe seu nome.');
      return;
    }

    setSubmitState('submitting');
    setErrorMessage(null);

    fetch(`${API_BASE_URL}/invitations/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
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
        Conta criada com sucesso! Você já pode entrar com seu e-mail cadastrado pela agência.
      </CenteredMessage>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '48px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Você foi convidado(a)</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
        <strong>{resolveState.email}</strong> foi convidado(a) como <strong>{resolveState.role}</strong>.
        Confirme seu nome para concluir.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
