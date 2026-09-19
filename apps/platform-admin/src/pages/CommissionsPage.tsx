import { useEffect, useState } from 'react';

interface Partner {
  id: string;
  name: string;
}

interface Commission {
  id: string;
  partnerId: string;
  referralId: string | null;
  amount: number;
  currency: string;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';
  earnedAt: string;
  paidAt: string | null;
}

interface Benefit {
  id: string;
  partnerId: string | null;
  benefitType: string;
  value: number;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  PAID: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

const BENEFIT_TYPES = [
  'FIXED_COMMISSION', 'PERCENTAGE_COMMISSION', 'MONTHLY_CREDIT', 'PERCENTAGE_CREDIT', 'MANUAL_BENEFIT',
];

export function CommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commissionForm, setCommissionForm] = useState({ partnerId: '', amount: '' });
  const [benefitForm, setBenefitForm] = useState({ partnerId: '', benefitType: 'PERCENTAGE_COMMISSION', value: '' });

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const [commissionsRes, benefitsRes, partnersRes] = await Promise.all([
        fetch('/api/platform/partner-commissions'),
        fetch('/api/platform/partner-benefits'),
        fetch('/api/platform/partners'),
      ]);
      if (!commissionsRes.ok || !benefitsRes.ok || !partnersRes.ok) {
        throw new Error('Não foi possível carregar comissões');
      }
      const commissionsData = (await commissionsRes.json()) as { commissions: Commission[] };
      const benefitsData = (await benefitsRes.json()) as { benefits: Benefit[] };
      const partnersData = (await partnersRes.json()) as { partners: Partner[] };
      setCommissions(commissionsData.commissions);
      setBenefits(benefitsData.benefits);
      setPartners(partnersData.partners);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }

  async function createCommission() {
    if (!commissionForm.partnerId || !commissionForm.amount) return;
    const response = await fetch('/api/platform/partner-commissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerId: commissionForm.partnerId,
        amount: Number(commissionForm.amount),
      }),
    });
    if (!response.ok) {
      setError('Não foi possível criar a comissão');
      return;
    }
    setCommissionForm({ partnerId: '', amount: '' });
    await load();
  }

  async function createBenefit() {
    if (!benefitForm.partnerId || !benefitForm.value) return;
    const response = await fetch('/api/platform/partner-benefits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerId: benefitForm.partnerId,
        benefitType: benefitForm.benefitType,
        value: Number(benefitForm.value),
      }),
    });
    if (!response.ok) {
      setError('Não foi possível criar o benefício');
      return;
    }
    setBenefitForm({ partnerId: '', benefitType: 'PERCENTAGE_COMMISSION', value: '' });
    await load();
  }

  async function updateCommissionStatus(commission: Commission, status: string) {
    await fetch(`/api/platform/partner-commissions/${commission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  function partnerName(id: string): string {
    return partners.find((p) => p.id === id)?.name ?? id;
  }

  if (loading) return <div className="text-center py-8">Carregando...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Comissões e Benefícios</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6 space-y-3">
          <h2 className="text-lg font-bold">Nova comissão</h2>
          <select
            value={commissionForm.partnerId}
            onChange={(e) => setCommissionForm({ ...commissionForm, partnerId: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">Selecione o parceiro</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Valor (BRL)"
            value={commissionForm.amount}
            onChange={(e) => setCommissionForm({ ...commissionForm, amount: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <button
            onClick={() => void createCommission()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium"
          >
            Registrar comissão
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-3">
          <h2 className="text-lg font-bold">Novo benefício (regra comercial)</h2>
          <select
            value={benefitForm.partnerId}
            onChange={(e) => setBenefitForm({ ...benefitForm, partnerId: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">Selecione o parceiro</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={benefitForm.benefitType}
            onChange={(e) => setBenefitForm({ ...benefitForm, benefitType: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          >
            {BENEFIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Valor"
            value={benefitForm.value}
            onChange={(e) => setBenefitForm({ ...benefitForm, value: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <button
            onClick={() => void createBenefit()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium"
          >
            Registrar benefício
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
        <div className="px-4 py-3 border-b font-bold">Comissões</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="py-2 px-4">Parceiro</th>
              <th className="py-2 px-4">Valor</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 px-4" />
            </tr>
          </thead>
          <tbody>
            {commissions.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="py-2 px-4 font-medium">{partnerName(c.partnerId)}</td>
                <td className="py-2 px-4">
                  {c.amount.toLocaleString('pt-BR', { style: 'currency', currency: c.currency })}
                </td>
                <td className="py-2 px-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[c.status]}`}>
                    {c.status}
                  </span>
                </td>
                <td className="py-2 px-4 space-x-2">
                  {c.status === 'PENDING' && (
                    <button
                      onClick={() => void updateCommissionStatus(c, 'APPROVED')}
                      className="text-blue-700 hover:underline text-xs"
                    >
                      Aprovar
                    </button>
                  )}
                  {c.status === 'APPROVED' && (
                    <button
                      onClick={() => void updateCommissionStatus(c, 'PAID')}
                      className="text-green-700 hover:underline text-xs"
                    >
                      Marcar como paga
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {commissions.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-gray-500">
                  Nenhuma comissão registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 border-b font-bold">Benefícios ativos</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="py-2 px-4">Parceiro</th>
              <th className="py-2 px-4">Tipo</th>
              <th className="py-2 px-4">Valor</th>
              <th className="py-2 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {benefits.map((b) => (
              <tr key={b.id} className="border-b">
                <td className="py-2 px-4 font-medium">{b.partnerId ? partnerName(b.partnerId) : '—'}</td>
                <td className="py-2 px-4">{b.benefitType}</td>
                <td className="py-2 px-4">{b.value}</td>
                <td className="py-2 px-4">{b.status}</td>
              </tr>
            ))}
            {benefits.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-gray-500">
                  Nenhum benefício registrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
