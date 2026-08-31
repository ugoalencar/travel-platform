import { useEffect, useState } from 'react';

interface SupportCase {
  id: string;
  subscriberTenantId: string;
  subscriberTenantName: string;
  title: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assignedToId?: string;
  assignedToEmail?: string;
  createdAt: string;
  updatedAt: string;
}

export function SupportPage() {
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedCase, setSelectedCase] = useState<SupportCase | null>(null);
  const [formData, setFormData] = useState({
    subscriberTenantId: '',
    title: '',
    description: '',
    priority: 'MEDIUM' as const,
  });

  useEffect(() => {
    fetchCases();
  }, []);

  async function fetchCases() {
    try {
      setLoading(true);
      const response = await fetch('http://127.0.0.1:4000/platform/support');
      if (!response.ok) throw new Error('Failed to fetch cases');
      const data = await response.json();
      setCases(data.cases || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cases');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCase(e: React.FormEvent) {
    e.preventDefault();
    try {
      const response = await fetch('http://127.0.0.1:4000/platform/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Failed to create case');
      await fetchCases();
      setShowForm(false);
      setFormData({
        subscriberTenantId: '',
        title: '',
        description: '',
        priority: 'MEDIUM',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create case');
    }
  }

  async function handleUpdateStatus(caseId: string, newStatus: SupportCase['status']) {
    try {
      const response = await fetch(`http://127.0.0.1:4000/platform/support/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error('Failed to update case');
      await fetchCases();
      setSelectedCase(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update case');
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading support cases...</div>;
  }

  const statusColors: Record<string, string> = {
    OPEN: 'bg-red-100 text-red-800',
    IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
    RESOLVED: 'bg-green-100 text-green-800',
    CLOSED: 'bg-gray-100 text-gray-800',
  };

  const priorityColors: Record<string, string> = {
    LOW: 'bg-blue-100 text-blue-800',
    MEDIUM: 'bg-yellow-100 text-yellow-800',
    HIGH: 'bg-orange-100 text-orange-800',
    CRITICAL: 'bg-red-100 text-red-800',
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Support Cases</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'New Case'}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Create Support Case</h2>
          <form onSubmit={handleCreateCase} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Subscriber Tenant ID
              </label>
              <input
                type="text"
                required
                value={formData.subscriberTenantId}
                onChange={(e) => setFormData({ ...formData, subscriberTenantId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., tenant-id-here"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Issue title"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Describe the issue"
                rows={4}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: e.target.value as any })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Create Case
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cases List */}
      {selectedCase ? (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex gap-4 mb-4">
            <button
              onClick={() => setSelectedCase(null)}
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back to List
            </button>
          </div>

          <h2 className="text-2xl font-semibold mb-4">{selectedCase.title}</h2>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-600">ID</p>
              <p className="font-mono text-sm">{selectedCase.id}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Subscriber</p>
              <p className="font-semibold">{selectedCase.subscriberTenantName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <select
                value={selectedCase.status}
                onChange={(e) =>
                  handleUpdateStatus(selectedCase.id, e.target.value as SupportCase['status'])
                }
                className={`mt-1 px-3 py-1 rounded text-sm font-semibold ${
                  statusColors[selectedCase.status]
                }`}
              >
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
            <div>
              <p className="text-sm text-gray-600">Priority</p>
              <p className={`mt-1 px-3 py-1 rounded text-sm font-semibold w-fit ${
                priorityColors[selectedCase.priority]
              }`}>
                {selectedCase.priority}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Created</p>
              <p className="text-sm">{new Date(selectedCase.createdAt).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Updated</p>
              <p className="text-sm">{new Date(selectedCase.updatedAt).toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded p-4">
            <p className="text-sm font-semibold mb-2">Description</p>
            <p className="text-gray-700 whitespace-pre-wrap">{selectedCase.description}</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Title</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  Subscriber
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {cases.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedCase(c)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-6 py-4 text-sm font-medium">{c.title}</td>
                  <td className="px-6 py-4 text-sm">{c.subscriberTenantName}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      statusColors[c.status]
                    }`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      priorityColors[c.priority]
                    }`}>
                      {c.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {cases.length === 0 && (
            <div className="text-center py-12 text-gray-600">
              No support cases yet. Click "New Case" to create one.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
