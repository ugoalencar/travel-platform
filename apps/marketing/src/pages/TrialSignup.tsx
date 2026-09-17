import { useState } from 'react';
import { agencyLoginUrl } from '../lib/agencyAppUrl';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export function TrialSignup() {
  const [form, setForm] = useState({
    contactName: '',
    email: '',
    password: '',
    confirmPassword: '',
    agencyName: '',
    agreeTerms: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate
    if (!form.email || !form.agencyName || !form.contactName) {
      setError('Nome, agência e email são obrigatórios');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('As senhas não correspondem');
      return;
    }

    if (form.password.length < 8) {
      setError('Senha deve ter no mínimo 8 caracteres');
      return;
    }

    if (!form.agreeTerms) {
      setError('Você precisa aceitar os Termos de Serviço');
      return;
    }

    setLoading(true);

    try {
      // Real agency provisioning -- creates the agencies row and the
      // first OWNER user for real (services/api/src/agency-signup.ts),
      // not a lead. The session it returns lives on this (marketing)
      // origin's sessionStorage, which apps/agency can't read across
      // origins -- so this intentionally does NOT try to smuggle the
      // token across via the URL (that would leak it into browser
      // history/referrers). The account is already real at this point;
      // the redirect below just asks the OWNER to log in once more on
      // the app that actually owns the session.
      const response = await fetch(`${API_BASE_URL}/api/agencies/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencyName: form.agencyName,
          contactName: form.contactName,
          contactEmail: form.email,
          password: form.password,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Falha ao criar a conta');
      }

      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao processar sua solicitação'
      );
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-green-600 mb-2">
            Conta criada!
          </h1>
          <p className="text-gray-600 mb-6">
            Sua agência <strong>{form.agencyName}</strong> foi criada. Entre com <strong>{form.email}</strong> e a
            senha que você definiu.
          </p>
          <a
            href={agencyLoginUrl()}
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700"
          >
            Ir para o login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Começar Teste Grátis
          </h1>
          <p className="text-gray-600 mt-2">
            14 dias de acesso completo, sem cartão de crédito
          </p>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Seu nome
            </label>
            <input
              type="text"
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Seu nome completo"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome da Agência
            </label>
            <input
              type="text"
              value={form.agencyName}
              onChange={(e) =>
                setForm({ ...form, agencyName: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Sua Agência de Viagens"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="seu@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Senha (mín. 8 caracteres)
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirmar Senha
            </label>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(e) =>
                setForm({ ...form, confirmPassword: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
              required
            />
          </div>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={form.agreeTerms}
              onChange={(e) =>
                setForm({ ...form, agreeTerms: e.target.checked })
              }
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-600">
              Concordo com os Termos de Serviço
            </span>
          </label>

          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm border border-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Processando...' : 'Começar Teste Grátis'}
          </button>

          <p className="text-center text-sm text-gray-600">
            Já tem uma conta?{' '}
            <a href={agencyLoginUrl()} className="text-blue-600 hover:underline font-medium">
              Faça login
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
