export function HealthPage() {
  const healthChecks = [
    { name: 'Servidor API', status: 'SAUDAVEL', latency: '45ms', uptime: '99.9%' },
    { name: 'Banco de dados', status: 'SAUDAVEL', latency: '12ms', uptime: '100%' },
    { name: 'Cache Redis', status: 'SAUDAVEL', latency: '3ms', uptime: '99.99%' },
    { name: 'Armazenamento', status: 'SAUDAVEL', latency: '156ms', uptime: '99.95%' },
    { name: 'Servico de email', status: 'SAUDAVEL', latency: '750ms', uptime: '99.8%' },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Saude do Sistema</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600">Status geral</p>
            <p className="text-3xl font-bold text-emerald-700">SAUDAVEL</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Tempo medio de resposta</p>
            <p className="text-3xl font-bold text-blue-600">193ms</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Uptime (30d)</p>
            <p className="text-3xl font-bold text-slate-700">99.95%</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Componente</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Latencia</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Disponibilidade</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {healthChecks.map((check, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium">{check.name}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-900 rounded text-xs font-semibold">
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
