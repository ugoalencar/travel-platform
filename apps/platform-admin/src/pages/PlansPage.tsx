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
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
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
    fetchPlans();
  }, []);

  async function fetchPlans() {
    try {
      setLoading(true);
      const response = await fetch('http://127.0.0.1:4000/platform/plans');
      if (!response.ok) throw new Error('Failed to fetch plans');
      const data = await response.json();
      setPlans(data.plans || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch plans');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    try {
      const response = await fetch('http://127.0.0.1:4000/platform/plans', {
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

      if (!response.ok) throw new Error('Failed to create plan');

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
      setError(err instanceof Error ? err.message : 'Failed to create plan');
    }
  }

  async function handleDeletePlan(planId: string) {
    if (!confirm('Are you sure you want to delete this plan?')) return;

    try {
      const response = await fetch(`http://127.0.0.1:4000/platform/plans/${planId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete plan');
      await fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete plan');
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading plans...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Billing Plans</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'Create Plan'}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Create New Plan</h2>
          <form onSubmit={handleCreatePlan} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Plan Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="e.g., Premium"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Brief description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Monthly Price (BRL)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.price_monthly}
                  onChange={(e) => setFormData({ ...formData, price_monthly: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Annual Price (BRL)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.price_annual}
                  onChange={(e) => setFormData({ ...formData, price_annual: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Users</label>
                <input
                  type="number"
                  value={formData.max_users}
                  onChange={(e) => setFormData({ ...formData, max_users: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Customers</label>
                <input
                  type="number"
                  value={formData.max_customers}
                  onChange={(e) => setFormData({ ...formData, max_customers: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Storage (GB)</label>
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
              Create Plan
            </button>
          </form>
        </div>
      )}

      {plans.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-600">No plans yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">Name</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Description</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Monthly Price</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Max Users</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Storage (GB)</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {plans.map((plan) => (
                <tr key={plan.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium">{plan.name}</td>
                  <td className="px-6 py-3 text-sm text-gray-600">{plan.description || '-'}</td>
                  <td className="px-6 py-3">
                    {plan.price_monthly ? `R$ ${plan.price_monthly.toLocaleString()}` : 'Custom'}
                  </td>
                  <td className="px-6 py-3">{plan.max_users}</td>
                  <td className="px-6 py-3">{plan.max_storage_gb}</td>
                  <td className="px-6 py-3 text-right space-x-2">
                    <button
                      onClick={() => setSelectedPlan(plan)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleDeletePlan(plan.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
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
