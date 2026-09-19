import { useEffect, useState } from 'react';

interface Credit {
  id: string;
  agencyId: string;
  sourceType: string;
  sourceId: string | null;
  amount: number;
  currency: string;
  status: 'PENDING' | 'AVAILABLE' | 'APPLIED' | 'CANCELLED';
  appliedAt: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-800',
  AVAILABLE: 'bg-blue-100 text-blue-800',
  APPLIED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

const NEXT_STATUS: Record<string, string | null> = {
  PENDING: 'AVAILABLE',
  AVAILABLE: 'APPLIED',
  APPLIED: null,
  CANCELLED: null,
};

export function CreditsPage() {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ agencyId: '', sourceType: 'REFERRAL', amount: '' });

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const creditsRes = await fetch('/api/platform/referral-credits');
      if (!creditsRes.ok) throw new Error('Não foi possível carregar os créditos');
      const creditsData = (await creditsRes.json()) as { credits: Credit[] };
      setCredits(creditsData.credits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }

  async function createCredit() {
    if (!form.agencyId || !form.amount) return;
    const response = await fetch('/api/platform/referral-credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agencyId: form.agencyId,
        sourceType: form.sourceType,
        amount: Number(form.amount),
      }),
    });
    if (!response.ok) {
      setError('Não foi possível criar o crédito');
      return;
    }
    setForm({ agencyId: '', sourceType: 'REFERRAL', amount: '' });
    await load();
  }

  async function advance(credit: Credit) {
    const next = NEXT_STATUS[credit.status];
    if (!next) return;
    await fetch(`/api/platform/referral-credits/${credit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    await load();
  }

  if (loading) return <div className="text-center py-8">Carregando...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Créditos de Indicação</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-3">
        <h2 className="text-lg font-bold">Novo crédito</h2>
        <input
          placeholder="ID da agência (agencies.id)"
          value={form.agencyId}
          onChange={(e) => setForm({ ...form, agencyId: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Origem (ex.: REFERRAL)"
            value={form.sourceType}
            onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <input
            type="number"
            placeholder="Valor (BRL)"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="px-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <button
          onClick={() => void createCredit()}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium"
        >
          Registrar crédito
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="py-2 px-4">Agência</th>
              <th className="py-2 px-4">Origem</th>
              <th className="py-2 px-4">Valor</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 px-4" />
            </tr>
          </thead>
          <tbody>
            {credits.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="py-2 px-4 font-mono text-xs">{c.agencyId}</td>
                <td className="py-2 px-4">{c.sourceType}</td>
                <td className="py-2 px-4">
                  {c.amount.toLocaleString('pt-BR', { style: 'currency', currency: c.currency })}
                </td>
                <td className="py-2 px-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[c.status]}`}>
                    {c.status}
                  </span>
                </td>
                <td className="py-2 px-4">
                  {NEXT_STATUS[c.status] && (
                    <button
                      onClick={() => void advance(c)}
                      className="text-green-700 hover:underline text-xs"
                    >
                      Avançar → {NEXT_STATUS[c.status]}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {credits.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-500">
                  Nenhum crédito registrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
