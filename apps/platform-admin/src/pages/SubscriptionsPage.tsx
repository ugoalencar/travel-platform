import { useEffect, useState } from 'react';

interface Subscription {
  id: string;
  tenant_id: string;
  tenant_name: string;
  plan_id: string;
  plan_name: string;
  status: 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED';
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ['PAST_DUE', 'SUSPENDED', 'CANCELLED'],
  TRIAL: ['ACTIVE', 'CANCELLED'],
  PAST_DUE: ['ACTIVE', 'SUSPENDED', 'CANCELLED'],
  SUSPENDED: ['ACTIVE', 'CANCELLED'],
  CANCELLED: [],
};

export function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [transitionStatus, setTransitionStatus] = useState<string>('');

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  async function fetchSubscriptions() {
    try {
      setLoading(true);
      const response = await fetch('http://127.0.0.1:4000/platform/subscriptions');
      if (!response.ok) throw new Error('Failed to fetch subscriptions');
      const data = await response.json();
      setSubscriptions(data.subscriptions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch subscriptions');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusTransition() {
    if (!selectedSub || !transitionStatus) return;

    try {
      const response = await fetch(
        `http://127.0.0.1:4000/platform/subscriptions/${selectedSub.id}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: transitionStatus }),
        }
      );

      if (!response.ok) throw new Error('Failed to update subscription status');

      setTransitionStatus('');
      setSelectedSub(null);
      await fetchSubscriptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update subscription');
    }
  }

  const filtered =
    filterStatus === 'ALL'
      ? subscriptions
      : subscriptions.filter((s) => s.status === filterStatus);

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    TRIAL: 'bg-blue-100 text-blue-800',
    PAST_DUE: 'bg-yellow-100 text-yellow-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    CANCELLED: 'bg-gray-100 text-gray-800',
  };

  const counts = {
    ACTIVE: subscriptions.filter((s) => s.status === 'ACTIVE').length,
    TRIAL: subscriptions.filter((s) => s.status === 'TRIAL').length,
    PAST_DUE: subscriptions.filter((s) => s.status === 'PAST_DUE').length,
    SUSPENDED: subscriptions.filter((s) => s.status === 'SUSPENDED').length,
    CANCELLED: subscriptions.filter((s) => s.status === 'CANCELLED').length,
  };

  if (loading) {
    return <div className="text-center py-8">Loading subscriptions...</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Subscriptions</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Status Summary */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        {Object.entries(counts).map(([status, count]) => (
          <div
            key={status}
            className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md"
            onClick={() =>
              setFilterStatus(filterStatus === status ? 'ALL' : status)
            }
          >
            <p className="text-sm text-gray-600">{status}</p>
            <p className="text-2xl font-bold">{count}</p>
          </div>
        ))}
      </div>

      {/* Selected Subscription Detail */}
      {selectedSub && (
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-2xl font-bold">{selectedSub.tenant_name}</h2>
              <p className="text-gray-600">Plan: {selectedSub.plan_name}</p>
            </div>
            <button
              onClick={() => {
                setSelectedSub(null);
                setTransitionStatus('');
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-600">Current Status</p>
              <p>
                <span
                  className={`${statusColors[selectedSub.status]} px-2 py-1 rounded text-sm font-medium`}
                >
                  {selectedSub.status}
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Started</p>
              <p className="font-medium">
                {new Date(selectedSub.started_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {(() => {
            const transitions = VALID_TRANSITIONS[selectedSub.status as keyof typeof VALID_TRANSITIONS];
            if (!transitions || transitions.length === 0) return null;
            return (
              <div className="mt-4 pt-4 border-t">
                <label className="block text-sm font-medium mb-2">
                  Change Status To:
                </label>
                <div className="flex gap-2">
                  <select
                    value={transitionStatus}
                    onChange={(e) => setTransitionStatus(e.target.value)}
                    className="px-3 py-2 border rounded-lg flex-1"
                  >
                    <option value="">-- Select new status --</option>
                    {transitions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleStatusTransition}
                    disabled={!transitionStatus}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Update Status
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Subscriptions Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Tenant
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Plan
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Status
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Started
              </th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-600">
                  No subscriptions found
                </td>
              </tr>
            ) : (
              filtered.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{sub.tenant_name}</td>
                  <td className="px-6 py-4 text-sm">{sub.plan_name}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`${statusColors[sub.status]} px-2 py-1 rounded text-sm font-medium`}
                    >
                      {sub.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {new Date(sub.started_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => {
                        setSelectedSub(sub);
                        setTransitionStatus('');
                      }}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-600">
        Showing {filtered.length} of {subscriptions.length} subscriptions
      </div>
    </div>
  );
}
