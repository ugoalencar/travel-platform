export function FinancialPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Financial Dashboard</h1>
      <div className="grid grid-cols-3 gap-6 mb-8">
        <StatCard title="MRR" value="$28,500" />
        <StatCard title="ARR" value="$342,000" />
        <StatCard title="Churn" value="2.3%" />
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600 text-sm">{title}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
  );
}
