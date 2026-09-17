import { useState, type FormEvent } from 'react';
import { forgotPassword } from '../lib/authApi';

export function ForgotPasswordPage() {
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
      // Always shown regardless of outcome -- same no-enumeration posture
      // as the backend's generic 200 response.
      setSubmitted(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-canvas) px-4">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-lg font-bold text-(--color-travel-navy)">Travel Platform</p>
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="mb-1 text-xl font-semibold text-slate-900">Redefinir senha</h1>
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
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-(--color-travel-navy) focus:outline-none focus:ring-1 focus:ring-(--color-travel-navy)"
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
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-(--color-travel-navy) focus:outline-none focus:ring-1 focus:ring-(--color-travel-navy)"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-(--color-travel-navy) px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {submitting ? 'Enviando…' : 'Enviar instruções'}
              </button>
              <a href="/login" className="block text-center text-sm text-slate-500 hover:underline">
                Voltar para o login
              </a>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
