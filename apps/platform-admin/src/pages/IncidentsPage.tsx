import { useState } from 'react';

interface Incident {
  id: string;
  title: string;
  status: 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  affectedSystems: string[];
  startTime: string;
  resolvedAt?: string;
}

export function IncidentsPage() {
  const [incidents] = useState<Incident[]>([
    {
      id: '1',
      title: 'API Latency Spike',
      status: 'RESOLVED',
      severity: 'HIGH',
      affectedSystems: ['API', 'Database'],
      startTime: '2026-08-29T14:30:00Z',
      resolvedAt: '2026-08-29T15:45:00Z',
    },
    {
      id: '2',
      title: 'Redis Connection Issues',
      status: 'MONITORING',
      severity: 'MEDIUM',
      affectedSystems: ['Cache'],
      startTime: '2026-08-29T10:00:00Z',
    },
  ]);

  const statusColors: Record<string, string> = {
    INVESTIGATING: 'bg-red-100 text-red-800',
    IDENTIFIED: 'bg-orange-100 text-orange-800',
    MONITORING: 'bg-yellow-100 text-yellow-800',
    RESOLVED: 'bg-green-100 text-green-800',
  };

  const severityColors: Record<string, string> = {
    LOW: 'bg-blue-100 text-blue-800',
    MEDIUM: 'bg-yellow-100 text-yellow-800',
    HIGH: 'bg-orange-100 text-orange-800',
    CRITICAL: 'bg-red-100 text-red-800',
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Incidents</h1>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Title</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Severity</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Systems</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {incidents.map((incident) => (
              <tr key={incident.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium">{incident.title}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${statusColors[incident.status]}`}>
                    {incident.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${severityColors[incident.severity]}`}>
                    {incident.severity}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {incident.affectedSystems.join(', ')}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {new Date(incident.startTime).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
