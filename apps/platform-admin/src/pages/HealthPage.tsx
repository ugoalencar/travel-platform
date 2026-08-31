export function HealthPage() {
  const healthChecks = [
    { name: 'API Server', status: 'HEALTHY', latency: '45ms', uptime: '99.9%' },
    { name: 'Database', status: 'HEALTHY', latency: '12ms', uptime: '100%' },
    { name: 'Redis Cache', status: 'HEALTHY', latency: '3ms', uptime: '99.99%' },
    { name: 'Storage Service', status: 'HEALTHY', latency: '156ms', uptime: '99.95%' },
    { name: 'Email Service', status: 'HEALTHY', latency: '750ms', uptime: '99.8%' },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">System Health</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600">Overall Status</p>
            <p className="text-3xl font-bold text-green-600">HEALTHY</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Avg Response Time</p>
            <p className="text-3xl font-bold text-blue-600">193ms</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Uptime (30d)</p>
            <p className="text-3xl font-bold text-purple-600">99.95%</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Component</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Latency</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Uptime</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {healthChecks.map((check, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium">{check.name}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                    {check.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{check.latency}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{check.uptime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
