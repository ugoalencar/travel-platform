import { useEffect, useState } from 'react';

export function DashboardPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const response = await fetch('http://127.0.0.1:4000/platform/financial');
        if (!response.ok) throw new Error('Failed to fetch metrics');
        const data = await response.json();
        setMetrics(data.metrics);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
      } finally {
        setLoading(false);
      }
    }

    fetchMetrics();
  }, []);

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-red-600">Error: {error}</div>;
  }

  if (!metrics) {
    return <div className="text-center py-8">No data available</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Active Subscriptions"
          value={metrics.activeSubscriptions.toString()}
          change={`${metrics.trialCount} trials`}
        />
        <StatCard title="MRR" value={`$${metrics.mrr.toLocaleString()}`} change="This month" />
        <StatCard title="ARR" value={`$${metrics.arr.toLocaleString()}`} change="Annualized" />
        <StatCard title="Churn Rate" value={`${metrics.churnRate.toFixed(2)}%`} change="30-day" />
      </div>

      {/* Charts and tables will go here */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Platform Metrics</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 rounded">
            <p className="text-sm text-gray-600">Cancelled Subscriptions</p>
            <p className="text-2xl font-bold">{metrics.cancelledSubscriptions}</p>
          </div>
          <div className="p-4 bg-gray-50 rounded">
            <p className="text-sm text-gray-600">Trial Subscriptions</p>
            <p className="text-2xl font-bold">{metrics.trialCount}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, change }: { title: string; value: string; change: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600 text-sm font-medium">{title}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
      <p className="text-green-600 text-sm mt-2">{change} from last month</p>
    </div>
  );
}
