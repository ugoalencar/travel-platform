import { useEffect, useState } from 'react';

interface Lead {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'DEMO_SCHEDULED' | 'TRIAL' | 'WON' | 'LOST';
  source: string;
  created_at: string;
  updated_at: string;
}

const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'DEMO_SCHEDULED',
  'TRIAL',
  'WON',
  'LOST',
];

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-gray-100 text-gray-800',
  CONTACTED: 'bg-blue-100 text-blue-800',
  QUALIFIED: 'bg-purple-100 text-purple-800',
  DEMO_SCHEDULED: 'bg-indigo-100 text-indigo-800',
  TRIAL: 'bg-cyan-100 text-cyan-800',
  WON: 'bg-green-100 text-green-800',
  LOST: 'bg-red-100 text-red-800',
};

export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [newStatus, setNewStatus] = useState<string>('');
  const [note, setNote] = useState('');

  useEffect(() => {
    fetchLeads();
  }, []);

  async function fetchLeads() {
    try {
      setLoading(true);
      const response = await fetch('http://127.0.0.1:4000/platform/leads');
      if (!response.ok) throw new Error('Failed to fetch leads');
      const data = await response.json();
      setLeads(data.leads || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange() {
    if (!selectedLead || !newStatus) return;

    try {
      const response = await fetch(
        `http://127.0.0.1:4000/platform/leads/${selectedLead.id}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (!response.ok) throw new Error('Failed to update lead status');

      if (note) {
        // Add note would go here if API supports it
        console.log('Note:', note);
      }

      setNewStatus('');
      setNote('');
      setSelectedLead(null);
      await fetchLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update lead');
    }
  }

  const filtered = leads.filter((lead) => {
    const matchesStatus = filterStatus === 'ALL' || lead.status === filterStatus;
    const matchesSearch =
      lead.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.contact_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const statusCounts = LEAD_STATUSES.reduce(
    (acc, status) => ({
      ...acc,
      [status]: leads.filter((l) => l.status === status).length,
    }),
    {} as Record<string, number>
  );

  if (loading) {
    return <div className="text-center py-8">Loading leads...</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Sales Leads</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Pipeline Overview */}
      <div className="grid grid-cols-7 gap-3 mb-8">
        {LEAD_STATUSES.map((status) => (
          <div
            key={status}
            className="bg-white rounded-lg shadow p-3 cursor-pointer hover:shadow-md"
            onClick={() =>
              setFilterStatus(filterStatus === status ? 'ALL' : status)
            }
          >
            <p className="text-xs text-gray-600 font-medium">{status}</p>
            <p className="text-xl font-bold text-center">
              {statusCounts[status as keyof typeof statusCounts]}
            </p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by company, contact, or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
        />
      </div>

      {/* Lead Detail */}
      {selectedLead && (
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-2xl font-bold">{selectedLead.company_name}</h2>
              <p className="text-gray-600">{selectedLead.contact_name}</p>
            </div>
            <button
              onClick={() => {
                setSelectedLead(null);
                setNewStatus('');
                setNote('');
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="font-medium">{selectedLead.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Phone</p>
              <p className="font-medium">{selectedLead.phone}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Current Status</p>
              <span
                className={`${STATUS_COLORS[selectedLead.status]} px-2 py-1 rounded text-sm font-medium inline-block`}
              >
                {selectedLead.status}
              </span>
            </div>
            <div>
              <p className="text-sm text-gray-600">Lead Source</p>
              <p className="font-medium">{selectedLead.source}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Created</p>
              <p className="font-medium">
                {new Date(selectedLead.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t space-y-3">
            <div>
              <label className="block text-sm font-medium mb-2">
                Update Status:
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">-- Select new status --</option>
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Add Note (optional):
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                rows={3}
                placeholder="Add internal notes about this lead..."
              />
            </div>

            <button
              onClick={handleStatusChange}
              disabled={!newStatus}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Update Lead Status
            </button>
          </div>
        </div>
      )}

      {/* Leads Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Company
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Email
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Status
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Source
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Created
              </th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-600">
                  No leads found
                </td>
              </tr>
            ) : (
              filtered.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{lead.company_name}</td>
                  <td className="px-6 py-4 text-sm">{lead.contact_name}</td>
                  <td className="px-6 py-4 text-sm">{lead.email}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`${STATUS_COLORS[lead.status]} px-2 py-1 rounded text-xs font-medium`}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">{lead.source}</td>
                  <td className="px-6 py-4 text-sm">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setSelectedLead(lead)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-600">
        Showing {filtered.length} of {leads.length} leads
      </div>
    </div>
  );
}
