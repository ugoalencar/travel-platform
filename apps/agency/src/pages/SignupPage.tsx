import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { AuthApiError, signUp } from '../lib/authApi';

// Two real steps -- Agência then Conta. There is no MFA-enrollment step
// here: no such UI exists anywhere in the app yet (backend enroll/confirm
// routes exist but are unconsumed), so this intentionally does not add a
// "Segurança" step that would either be dead or fabricated. Onboarding
// (redirected to right after signup) is the real "Configuração" step.
const STEPS = [
  { key: 'agency', label: 'Agência' },
  { key: 'account', label: 'Conta' },
] as const;

export function SignupPage() {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [agencyName, setAgencyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [country, setCountry] = useState('');
  const [companyIdentifier, setCompanyIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleAgencyStepSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!agencyName.trim() || !contactName.trim() || !contactEmail.trim()) {
      setError('Preencha nome da agência, seu nome e email.');
      return;
    }
    setStepIndex(1);
  }

  async function handleAccountStepSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await signUp({
        agencyName: agencyName.trim(),
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
        ...(country.trim() ? { country: country.trim() } : {}),
        ...(companyIdentifier.trim() ? { companyIdentifier: companyIdentifier.trim() } : {}),
        password,
      });
      if (result.state === 'FULLY_AUTHENTICATED') {
        void navigate('/onboarding', { replace: true });
      }
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Não foi possível criar a conta. Tente novamente.');
      setStepIndex(0);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-canvas) px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center text-lg font-bold text-(--color-travel-navy)">Travel Platform</p>

        {/* Progress */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((step, idx) => (
            <div key={step.key} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  idx < stepIndex
                    ? 'bg-(--color-travel-navy) text-white'
                    : idx === stepIndex
                      ? 'border-2 border-(--color-travel-navy) text-(--color-travel-navy)'
                      : 'border border-slate-300 text-slate-400'
                }`}
              >
                {idx < stepIndex ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </div>
              <span className={`text-xs font-medium ${idx === stepIndex ? 'text-slate-900' : 'text-slate-400'}`}>
                {step.label}
              </span>
              {idx < STEPS.length - 1 && <span className="h-px w-6 bg-slate-200" />}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          {stepIndex === 0 ? (
            <>
              <h1 className="mb-1 text-xl font-semibold text-slate-900">Sua agência</h1>
              <p className="mb-6 text-sm text-slate-500">Conte-nos um pouco sobre sua agência de viagens.</p>
              <form onSubmit={handleAgencyStepSubmit} className="space-y-4">
                <div>
                  <label htmlFor="agencyName" className="mb-1 block text-sm font-medium text-slate-700">
                    Nome da agência
                  </label>
                  <input
                    id="agencyName"
                    type="text"
                    required
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-(--color-travel-navy) focus:outline-none focus:ring-1 focus:ring-(--color-travel-navy)"
                  />
                </div>
                <div>
                  <label htmlFor="contactName" className="mb-1 block text-sm font-medium text-slate-700">
                    Seu nome
                  </label>
                  <input
                    id="contactName"
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-(--color-travel-navy) focus:outline-none focus:ring-1 focus:ring-(--color-travel-navy)"
                  />
                </div>
                <div>
                  <label htmlFor="contactEmail" className="mb-1 block text-sm font-medium text-slate-700">
                    Email
                  </label>
                  <input
                    id="contactEmail"
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-(--color-travel-navy) focus:outline-none focus:ring-1 focus:ring-(--color-travel-navy)"
                    autoComplete="username"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="contactPhone" className="mb-1 block text-sm font-medium text-slate-700">
                      Telefone
                    </label>
                    <input
                      id="contactPhone"
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-(--color-travel-navy) focus:outline-none focus:ring-1 focus:ring-(--color-travel-navy)"
                    />
                  </div>
                  <div>
                    <label htmlFor="country" className="mb-1 block text-sm font-medium text-slate-700">
                      País
                    </label>
                    <input
                      id="country"
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-(--color-travel-navy) focus:outline-none focus:ring-1 focus:ring-(--color-travel-navy)"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="companyIdentifier" className="mb-1 block text-sm font-medium text-slate-700">
                    CNPJ (opcional)
                  </label>
                  <input
                    id="companyIdentifier"
                    type="text"
                    value={companyIdentifier}
                    onChange={(e) => setCompanyIdentifier(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-(--color-travel-navy) focus:outline-none focus:ring-1 focus:ring-(--color-travel-navy)"
                  />
                </div>
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                <button
                  type="submit"
                  className="w-full rounded-md bg-(--color-travel-navy) px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Continuar
                </button>
                <a href="/login" className="block text-center text-sm text-slate-500 hover:underline">
                  Já tenho uma conta
                </a>
              </form>
            </>
          ) : (
            <>
              <h1 className="mb-1 text-xl font-semibold text-slate-900">Crie sua senha</h1>
              <p className="mb-6 text-sm text-slate-500">Última etapa antes de configurar sua agência.</p>
              <form onSubmit={(e) => void handleAccountStepSubmit(e)} className="space-y-4">
                <div>
                  <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
                    Senha
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-(--color-travel-navy) focus:outline-none focus:ring-1 focus:ring-(--color-travel-navy)"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-slate-700">
                    Confirmar senha
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
                  {submitting ? 'Criando…' : 'Criar conta'}
                </button>
                <button
                  type="button"
                  onClick={() => { setStepIndex(0); setError(null); }}
                  className="block w-full text-center text-sm text-slate-500 hover:underline"
                >
                  Voltar
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
