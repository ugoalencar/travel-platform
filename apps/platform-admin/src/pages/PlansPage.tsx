import { useEffect, useState } from 'react';

interface Plan {
  id: string;
  name: string;
  description: string;
  price_monthly: number | null;
  price_annual: number | null;
  currency: string;
  max_users: number;
  max_customers: number;
  max_storage_gb: number;
  created_at: string;
  updated_at: string;
}

export function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [, setSelectedPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price_monthly: '',
    price_annual: '',
    max_users: '10',
    max_customers: '100',
    max_storage_gb: '50',
  });

  useEffect(() => {
    void fetchPlans();
  }, []);

  async function fetchPlans() {
    try {
      setLoading(true);
      const response = await fetch('/api/platform/plans');
      if (!response.ok) throw new Error('Nao foi possivel carregar os planos');
      const data = (await response.json()) as { plans?: Plan[] };
      setPlans(data.plans || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel carregar os planos');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    try {
      const response = await fetch('/api/platform/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          price_monthly: formData.price_monthly ? parseFloat(formData.price_monthly) : null,
          price_annual: formData.price_annual ? parseFloat(formData.price_annual) : null,
          currency: 'BRL',
          max_users: parseInt(formData.max_users),
          max_customers: parseInt(formData.max_customers),
          max_storage_gb: parseInt(formData.max_storage_gb),
        }),
      });

      if (!response.ok) throw new Error('Nao foi possivel criar o plano');

      setFormData({
        name: '',
        description: '',
        price_monthly: '',
        price_annual: '',
        max_users: '10',
        max_customers: '100',
        max_storage_gb: '50',
      });
      setShowForm(false);
      await fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel criar o plano');
    }
  }

  async function handleDeletePlan(planId: string) {
    if (!confirm('Tem certeza de que deseja excluir este plano?')) return;

    try {
      const response = await fetch(`/api/platform/plans/${planId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Nao foi possivel excluir o plano');
      await fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel excluir o plano');
    }
  }

  if (loading) {
    return <div className="text-center py-8">Carregando planos...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Planos de Cobranca</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          {showForm ? 'Cancelar' : 'Criar Plano'}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Criar Novo Plano</h2>
          <form onSubmit={(event) => void handleCreatePlan(event)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nome do plano</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Ex: Premium"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descricao</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Descricao breve"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Preco mensal (BRL)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.price_monthly}
                  onChange={(e) => setFormData({ ...formData, price_monthly: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Opcional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Preco anual (BRL)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.price_annual}
                  onChange={(e) => setFormData({ ...formData, price_annual: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Opcional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Maximo de usuarios</label>
                <input
                  type="number"
                  value={formData.max_users}
                  onChange={(e) => setFormData({ ...formData, max_users: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Maximo de clientes</label>
                <input
                  type="number"
                  value={formData.max_customers}
                  onChange={(e) => setFormData({ ...formData, max_customers: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Armazenamento (GB)</label>
                <input
                  type="number"
                  value={formData.max_storage_gb}
                  onChange={(e) => setFormData({ ...formData, max_storage_gb: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
            <button
              type="submit"
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
            >
              Criar Plano
            </button>
          </form>
        </div>
      )}

      {plans.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-600">Nenhum plano ainda. Crie um para comecar.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">Nome</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Descricao</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Preco mensal</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Maximo de usuarios</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Armazenamento (GB)</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {plans.map((plan) => (
                <tr key={plan.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium">{plan.name}</td>
                  <td className="px-6 py-3 text-sm text-gray-600">{plan.description || '-'}</td>
                  <td className="px-6 py-3">
                    {plan.price_monthly ? `R$ ${plan.price_monthly.toLocaleString()}` : 'Personalizado'}
                  </td>
                  <td className="px-6 py-3">{plan.max_users}</td>
                  <td className="px-6 py-3">{plan.max_storage_gb}</td>
                  <td className="px-6 py-3 text-right space-x-2">
                    <button
                      onClick={() => setSelectedPlan(plan)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Ver
                    </button>
                    <button
                      onClick={() => void handleDeletePlan(plan.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
