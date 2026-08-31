import { useEffect, useState } from 'react';

interface AuditLog {
  id: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  changes?: Record<string, any>;
  timestamp: string;
}

export function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  async function fetchAuditLogs() {
    try {
      const response = await fetch('http://127.0.0.1:4000/platform/audit');
      if (!response.ok) throw new Error('Failed to fetch audit logs');
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading audit logs...</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Audit Trail</h1>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actor</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Action</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Resource</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-600">
                  No audit logs available
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{log.actor}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{log.action}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className="text-gray-600">{log.resourceType}</span>
                    <span className="text-gray-400 ml-2">{log.resourceId}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
