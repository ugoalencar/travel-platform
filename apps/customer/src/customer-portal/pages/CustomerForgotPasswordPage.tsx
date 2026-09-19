import { useState, type FormEvent } from 'react';
import { forgotPassword } from '../../lib/customerAuthApi';

export function CustomerForgotPasswordPage() {
  const [agencySlug, setAgencySlug] = useState('');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await forgotPassword(agencySlug.trim(), email.trim());
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-blue-50/40 px-4">
      <div className="w-full max-w-sm rounded-xl border border-blue-100 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-[color:var(--portal-ink)]">Redefinir senha</h1>
        {submitted ? (
          <p className="mt-4 text-sm text-slate-600">
            Se este email existir, enviaremos instruções de redefinição.
          </p>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
            <div>
              <label htmlFor="agencySlug" className="mb-1 block text-sm font-medium text-slate-700">
                Agência
              </label>
              <input
                id="agencySlug"
                type="text"
                required
                value={agencySlug}
                onChange={(e) => setAgencySlug(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-[#2563eb] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {submitting ? 'Enviando…' : 'Enviar instruções'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
