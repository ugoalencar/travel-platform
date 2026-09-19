import { useEffect, useState } from 'react';

interface Referral {
  id: string;
  referrerType: 'PARTNER' | 'AGENCY' | 'MANUAL' | 'CAMPAIGN';
  referrerId: string | null;
  referredAgencyName: string;
  referredContact: string | null;
  status: 'LEAD' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'REJECTED';
  notes: string | null;
  convertedAt: string | null;
}

const STATUSES = ['LEAD', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'REJECTED'];

const STATUS_COLORS: Record<string, string> = {
  LEAD: 'bg-gray-100 text-gray-800',
  CONTACTED: 'bg-blue-100 text-blue-800',
  QUALIFIED: 'bg-purple-100 text-purple-800',
  CONVERTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

const NEXT_STATUS: Record<string, string | null> = {
  LEAD: 'CONTACTED',
  CONTACTED: 'QUALIFIED',
  QUALIFIED: 'CONVERTED',
  CONVERTED: null,
  REJECTED: null,
};

const emptyForm: {
  referrerType: Referral['referrerType'];
  referredAgencyName: string;
  referredContact: string;
  notes: string;
} = {
  referrerType: 'MANUAL',
  referredAgencyName: '',
  referredContact: '',
  notes: '',
};

export function ReferralsPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const response = await fetch('/api/platform/referrals');
      if (!response.ok) throw new Error('Não foi possível carregar as indicações');
      const data = (await response.json()) as { referrals: Referral[] };
      setReferrals(data.referrals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }

  async function createReferral() {
    setError(null);
    const response = await fetch('/api/platform/referrals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!response.ok) {
      setError('Não foi possível criar a indicação');
      return;
    }
    setForm(emptyForm);
    setShowForm(false);
    await load();
  }

  async function advance(referral: Referral) {
    const next = NEXT_STATUS[referral.status];
    if (!next) return;
    await fetch(`/api/platform/referrals/${referral.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    await load();
  }

  async function reject(referral: Referral) {
    await fetch(`/api/platform/referrals/${referral.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'REJECTED' }),
    });
    await load();
  }

  if (loading) return <div className="text-center py-8">Carregando...</div>;

  const counts = STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: referrals.filter((r) => r.status === s).length }),
    {} as Record<string, number>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Indicações</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          {showForm ? 'Cancelar' : '+ Nova indicação'}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>
      )}

      <div className="grid grid-cols-5 gap-3 mb-6">
        {STATUSES.map((s) => (
          <div key={s} className="bg-white rounded-lg shadow p-3">
            <p className="text-xs text-gray-600 font-medium">{s}</p>
            <p className="text-xl font-bold">{counts[s]}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-3">
          <select
            value={form.referrerType}
            onChange={(e) => setForm({ ...form, referrerType: e.target.value as Referral['referrerType'] })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          >
            <option value="MANUAL">MANUAL</option>
            <option value="PARTNER">PARTNER</option>
            <option value="AGENCY">AGENCY</option>
            <option value="CAMPAIGN">CAMPAIGN</option>
          </select>
          <input
            placeholder="Nome da agência indicada"
            value={form.referredAgencyName}
            onChange={(e) => setForm({ ...form, referredAgencyName: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <input
            placeholder="Contato"
            value={form.referredContact}
            onChange={(e) => setForm({ ...form, referredContact: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <textarea
            placeholder="Notas"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <button
            onClick={() => void createReferral()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium"
          >
            Criar indicação
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="py-2 px-4">Agência indicada</th>
              <th className="py-2 px-4">Origem</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 px-4" />
            </tr>
          </thead>
          <tbody>
            {referrals.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="py-2 px-4 font-medium">{r.referredAgencyName}</td>
                <td className="py-2 px-4">{r.referrerType}</td>
                <td className="py-2 px-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[r.status]}`}>
                    {r.status}
                  </span>
                </td>
                <td className="py-2 px-4 space-x-2">
                  {NEXT_STATUS[r.status] && (
                    <button
                      onClick={() => void advance(r)}
                      className="text-green-700 hover:underline text-xs"
                    >
                      Avançar → {NEXT_STATUS[r.status]}
                    </button>
                  )}
                  {r.status !== 'REJECTED' && r.status !== 'CONVERTED' && (
                    <button onClick={() => void reject(r)} className="text-red-600 hover:underline text-xs">
                      Rejeitar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {referrals.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-gray-500">
                  Nenhuma indicação registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
