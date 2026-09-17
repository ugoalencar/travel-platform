import { useEffect, useState } from 'react';

interface Subscriber {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  created_at: string;
  updated_at: string;
}

interface SubscriberWithSubscription extends Subscriber {
  subscription?: {
    plan_id: string;
    plan_name: string;
    status: string;
  };
}

const STATUS_LABELS: Record<Subscriber['status'], string> = {
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
  INACTIVE: 'Inativo',
};

export function SubscribersPage() {
  const [subscribers, setSubscribers] = useState<SubscriberWithSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubscriber, setSelectedSubscriber] = useState<SubscriberWithSubscription | null>(null);

  useEffect(() => {
    void fetchSubscribers();
  }, []);

  async function fetchSubscribers() {
    try {
      setLoading(true);
      const response = await fetch('/api/platform/subscribers');
      if (!response.ok) throw new Error('Não foi possível carregar os assinantes');
      const data = (await response.json()) as { subscribers?: SubscriberWithSubscription[] };
      setSubscribers(data.subscribers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os assinantes');
    } finally {
      setLoading(false);
    }
  }

  const filteredSubscribers = subscribers.filter(
    (sub) =>
      sub.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    INACTIVE: 'bg-gray-100 text-gray-800',
  };

  if (loading) {
    return <div className="text-center py-8">Carregando assinantes...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Agências Assinantes</h1>
        <input
          type="text"
          placeholder="Buscar por nome ou email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2 border rounded-lg w-64"
        />
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {selectedSubscriber && (
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-2xl font-bold">{selectedSubscriber.name}</h2>
            <button
              onClick={() => setSelectedSubscriber(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              Fechar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="font-medium">{selectedSubscriber.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Telefone</p>
              <p className="font-medium">{selectedSubscriber.phone || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Cidade</p>
              <p className="font-medium">{selectedSubscriber.city || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <p>
                <span className={`${statusColors[selectedSubscriber.status]} px-2 py-1 rounded text-sm font-medium`}>
                  {STATUS_LABELS[selectedSubscriber.status]}
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Desde</p>
              <p className="font-medium">
                {new Date(selectedSubscriber.created_at).toLocaleDateString()}
              </p>
            </div>
            {selectedSubscriber.subscription && (
              <div>
                <p className="text-sm text-gray-600">Plano atual</p>
                <p className="font-medium">{selectedSubscriber.subscription.plan_name}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Agência</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Email</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Cidade</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Plano</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Desde</th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredSubscribers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-600">
                  Nenhum assinante encontrado
                </td>
              </tr>
            ) : (
              filteredSubscribers.map((subscriber) => (
                <tr key={subscriber.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{subscriber.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{subscriber.email}</td>
                  <td className="px-6 py-4 text-sm">{subscriber.city || '-'}</td>
                  <td className="px-6 py-4 text-sm">{subscriber.subscription?.plan_name ?? '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`${statusColors[subscriber.status]} px-2 py-1 rounded text-sm font-medium`}>
                      {STATUS_LABELS[subscriber.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {new Date(subscriber.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setSelectedSubscriber(subscriber)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Ver detalhes
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-600">
        Mostrando {filteredSubscribers.length} de {subscribers.length} assinantes
      </div>
    </div>
  );
}
