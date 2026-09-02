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

type SupportCasePriority = SupportCase['priority'];

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
    priority: 'MEDIUM' as SupportCasePriority,
  });

  useEffect(() => {
    void fetchCases();
  }, []);

  async function fetchCases() {
    try {
      setLoading(true);
      const response = await fetch('/api/platform/support');
      if (!response.ok) throw new Error('Nao foi possivel carregar os casos');
      const data = (await response.json()) as { cases?: SupportCase[] };
      setCases(data.cases || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel carregar os casos');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCase(e: React.FormEvent) {
    e.preventDefault();
    try {
      const response = await fetch('/api/platform/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Nao foi possivel criar o caso');
      await fetchCases();
      setShowForm(false);
      setFormData({
        subscriberTenantId: '',
        title: '',
        description: '',
        priority: 'MEDIUM',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel criar o caso');
    }
  }

  async function handleUpdateStatus(caseId: string, newStatus: SupportCase['status']) {
    try {
      const response = await fetch(`/api/platform/support/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error('Nao foi possivel atualizar o caso');
      await fetchCases();
      setSelectedCase(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel atualizar o caso');
    }
  }

  if (loading) {
    return <div className="text-center py-8">Carregando casos de suporte...</div>;
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
        <h1 className="text-3xl font-bold">Chamados de Suporte</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {showForm ? 'Cancelar' : 'Novo Caso'}
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
          <h2 className="text-lg font-semibold mb-4">Criar Caso de Suporte</h2>
          <form onSubmit={(event) => void handleCreateCase(event)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ID do inquilino assinante
              </label>
              <input
                type="text"
                required
                value={formData.subscriberTenantId}
                onChange={(e) => setFormData({ ...formData, subscriberTenantId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: tenant-id-aqui"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titulo</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Titulo do problema"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descricao
              </label>
              <textarea
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Descreva o problema"
                rows={4}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
              <select
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: e.target.value as SupportCase['priority'] })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="LOW">Baixa</option>
                <option value="MEDIUM">Media</option>
                <option value="HIGH">Alta</option>
                <option value="CRITICAL">Critica</option>
              </select>
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Criar Caso
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancelar
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
              Voltar para a lista
            </button>
          </div>

          <h2 className="text-2xl font-semibold mb-4">{selectedCase.title}</h2>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-600">ID</p>
              <p className="font-mono text-sm">{selectedCase.id}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Assinante</p>
              <p className="font-semibold">{selectedCase.subscriberTenantName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <select
                value={selectedCase.status}
                onChange={(e) =>
                  void handleUpdateStatus(selectedCase.id, e.target.value as SupportCase['status'])
                }
                className={`mt-1 px-3 py-1 rounded text-sm font-semibold ${
                  statusColors[selectedCase.status]
                }`}
              >
                <option value="OPEN">Aberto</option>
                <option value="IN_PROGRESS">Em andamento</option>
                <option value="RESOLVED">Resolvido</option>
                <option value="CLOSED">Fechado</option>
              </select>
            </div>
            <div>
              <p className="text-sm text-gray-600">Prioridade</p>
              <p className={`mt-1 px-3 py-1 rounded text-sm font-semibold w-fit ${
                priorityColors[selectedCase.priority]
              }`}>
                {selectedCase.priority}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Criado</p>
              <p className="text-sm">{new Date(selectedCase.createdAt).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Atualizado</p>
              <p className="text-sm">{new Date(selectedCase.updatedAt).toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded p-4">
            <p className="text-sm font-semibold mb-2">Descricao</p>
            <p className="text-gray-700 whitespace-pre-wrap">{selectedCase.description}</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Titulo</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  Assinante
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  Prioridade
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Criado</th>
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
              Nenhum caso de suporte ainda. Clique em "Novo Caso" para criar um.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
