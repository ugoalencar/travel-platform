export function DashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <StatCard title="Active Subscribers" value="42" change="+12%" />
        <StatCard title="MRR" value="$28,500" change="+8%" />
        <StatCard title="Churn Rate" value="2.3%" change="-0.5%" />
        <StatCard title="Trial Leads" value="156" change="+24%" />
      </div>

      {/* Charts and tables will go here */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Revenue Trend</h2>
        <div className="h-64 bg-gray-100 rounded flex items-center justify-center">
          <p className="text-gray-500">Chart placeholder</p>
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
