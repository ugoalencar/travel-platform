import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthApiError, signUp } from '../lib/authApi';

export function SignupPage() {
  const navigate = useNavigate();
  const [agencyName, setAgencyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [country, setCountry] = useState('');
  const [companyIdentifier, setCompanyIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
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
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-canvas) px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Criar conta</h1>
        <p className="mb-6 text-sm text-slate-500">Configure sua agência de viagens</p>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
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
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
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
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? 'Criando…' : 'Criar conta'}
          </button>
          <a href="/login" className="block text-center text-sm text-slate-500 hover:underline">
            Já tenho uma conta
          </a>
        </form>
      </div>
    </div>
  );
}
