import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

// Public, unauthenticated enrollment form. Deliberately outside both the
// staff AppShell and the CustomerPortalShell -- a prospect filling this
// form is neither a logged-in staff user nor an existing customer. Talks
// directly to the token-only public API (/enrollment-api/:token,
// /enrollment-api/:token/submit) via plain fetch, no auth headers, no
// tenant selection -- the token itself is the only thing that resolves a
// tenant, server-side.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

interface DependentInput {
  name: string;
  birthDate: string;
  relationship: string;
}

type ResolveState = 'checking' | 'valid' | 'invalid';
type SubmitState = 'idle' | 'submitting' | 'done' | 'error';

export function EnrollmentPage() {
  const { token } = useParams<{ token: string }>();
  const [resolveState, setResolveState] = useState<ResolveState>('checking');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [wishDestination, setWishDestination] = useState('');
  const [wishNotes, setWishNotes] = useState('');
  const [dependents, setDependents] = useState<DependentInput[]>([]);
  const [consentGiven, setConsentGiven] = useState(false);
  const [protocolNumber, setProtocolNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setResolveState('invalid');
      return;
    }
    fetch(`${API_BASE_URL}/enrollment-api/${encodeURIComponent(token)}`)
      .then((res) => setResolveState(res.ok ? 'valid' : 'invalid'))
      .catch(() => setResolveState('invalid'));
  }, [token]);

  const addDependent = () => {
    setDependents((d) => [...d, { name: '', birthDate: '', relationship: '' }]);
  };

  const updateDependent = (index: number, field: keyof DependentInput, value: string) => {
    setDependents((d) => d.map((dep, i) => (i === index ? { ...dep, [field]: value } : dep)));
  };

  const removeDependent = (index: number) => {
    setDependents((d) => d.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!fullName.trim()) {
      setErrorMessage('Informe o nome completo.');
      return;
    }
    if (!consentGiven) {
      setErrorMessage('É necessário aceitar o consentimento (LGPD) para continuar.');
      return;
    }

    setSubmitState('submitting');
    setErrorMessage(null);

    fetch(`${API_BASE_URL}/enrollment-api/${encodeURIComponent(token)}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: fullName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        cpf: cpf.trim() || undefined,
        birthDate: birthDate || undefined,
        dependents: dependents.filter((d) => d.name.trim()),
        wishDestination: wishDestination.trim() || undefined,
        wishNotes: wishNotes.trim() || undefined,
        consentGiven,
        consentTextVersion: 'v1',
      }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as
          | { error?: string; submission?: { protocolNumber?: string } }
          | null;
        if (!res.ok) {
          throw new Error(body?.error ?? 'Não foi possível enviar o cadastro.');
        }
        setProtocolNumber(body?.submission?.protocolNumber ?? null);
        setSubmitState('done');
      })
      .catch((err: unknown) => {
        setErrorMessage(err instanceof Error ? err.message : 'Não foi possível enviar o cadastro.');
        setSubmitState('error');
      });
  };

  if (resolveState === 'checking') {
    return <CenteredMessage>Verificando link…</CenteredMessage>;
  }

  if (resolveState === 'invalid') {
    return (
      <CenteredMessage>
        Este link de cadastro não é válido, expirou ou foi revogado. Entre em contato com a agência para
        solicitar um novo link.
      </CenteredMessage>
    );
  }

  if (submitState === 'done') {
    return (
      <CenteredMessage>
        Cadastro enviado com sucesso! A agência vai revisar suas informações em breve.
        {protocolNumber ? (
          <>
            <br />
            <br />
            Guarde seu protocolo: <strong>{protocolNumber}</strong>
          </>
        ) : null}
      </CenteredMessage>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Cadastro</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
        Preencha seus dados para iniciar seu atendimento. Suas informações são enviadas de forma segura
        diretamente para a agência.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Nome completo *">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required style={inputStyle} />
        </Field>
        <Field label="E-mail">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Telefone / WhatsApp">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="CPF">
          <input value={cpf} onChange={(e) => setCpf(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Data de nascimento">
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} style={inputStyle} />
        </Field>

        <fieldset style={{ border: '1px solid #e2e2e2', borderRadius: 8, padding: 12 }}>
          <legend style={{ fontSize: 13, fontWeight: 600, padding: '0 4px' }}>Acompanhantes (opcional)</legend>
          {dependents.map((dep, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input
                placeholder="Nome"
                value={dep.name}
                onChange={(e) => updateDependent(i, 'name', e.target.value)}
                style={{ ...inputStyle, flex: 2 }}
              />
              <input
                type="date"
                value={dep.birthDate}
                onChange={(e) => updateDependent(i, 'birthDate', e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                placeholder="Parentesco"
                value={dep.relationship}
                onChange={(e) => updateDependent(i, 'relationship', e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button type="button" onClick={() => removeDependent(i)} style={linkButtonStyle}>
                Remover
              </button>
            </div>
          ))}
          <button type="button" onClick={addDependent} style={linkButtonStyle}>
            + Adicionar acompanhante
          </button>
        </fieldset>

        <fieldset style={{ border: '1px solid #e2e2e2', borderRadius: 8, padding: 12 }}>
          <legend style={{ fontSize: 13, fontWeight: 600, padding: '0 4px' }}>O que você quer viajar? (opcional)</legend>
          <Field label="Destino de interesse">
            <input value={wishDestination} onChange={(e) => setWishDestination(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Observações">
            <textarea value={wishNotes} onChange={(e) => setWishNotes(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} />
          </Field>
        </fieldset>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={consentGiven}
            onChange={(e) => setConsentGiven(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          Autorizo o uso dos meus dados pessoais para fins de atendimento comercial por esta agência de
          viagens, conforme a Lei Geral de Proteção de Dados (LGPD).
        </label>

        {errorMessage ? <p style={{ color: '#c0392b', fontSize: 13 }}>{errorMessage}</p> : null}

        <button type="submit" disabled={submitState === 'submitting'} style={submitButtonStyle}>
          {submitState === 'submitting' ? 'Enviando…' : 'Enviar cadastro'}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
      <span style={{ fontWeight: 500, color: '#444' }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #d0d0d0',
  fontSize: 14,
  fontFamily: 'inherit',
};

const linkButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#2563eb',
  fontSize: 13,
  cursor: 'pointer',
  padding: 0,
};

const submitButtonStyle: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 6,
  border: 'none',
  background: '#2563eb',
  color: 'white',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};
