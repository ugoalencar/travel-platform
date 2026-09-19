import { useEffect, useRef, useState } from 'react';

interface Credit {
  id: string;
  agencyId: string;
  sourceType: string;
  sourceId: string | null;
  amount: number;
  currency: string;
  status: 'PENDING' | 'AVAILABLE' | 'APPLIED' | 'CANCELLED';
  appliedAt: string | null;
}

interface AgencySearchResult {
  id: string;
  name: string;
  slug: string;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-800',
  AVAILABLE: 'bg-blue-100 text-blue-800',
  APPLIED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

const NEXT_STATUS: Record<string, string | null> = {
  PENDING: 'AVAILABLE',
  AVAILABLE: 'APPLIED',
  APPLIED: null,
  CANCELLED: null,
};

export function CreditsPage() {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [agencyNames, setAgencyNames] = useState<Record<string, AgencySearchResult>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ sourceType: 'REFERRAL', amount: '' });
  const [selectedAgency, setSelectedAgency] = useState<AgencySearchResult | null>(null);
  const [agencyQuery, setAgencyQuery] = useState('');
  const [agencyResults, setAgencyResults] = useState<AgencySearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void load();
  }, []);

  // Busca com debounce -- Platform Admin > Parcerias > Créditos > seletor
  // de agência. Chama GET /platform/agencies/search?q=, que por sua vez
  // usa a função SECURITY DEFINER platform_search_agencies (migração 079)
  // para ler além da própria agência sem enfraquecer o RLS de `agencies`.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!agencyQuery.trim()) {
      setAgencyResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void searchAgencies(agencyQuery);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [agencyQuery]);

  async function searchAgencies(q: string) {
    try {
      const response = await fetch(`/api/platform/agencies/search?q=${encodeURIComponent(q)}`);
      if (!response.ok) return;
      const data = (await response.json()) as { agencies: AgencySearchResult[] };
      setAgencyResults(data.agencies);
      setAgencyNames((prev) => {
        const next = { ...prev };
        for (const agency of data.agencies) next[agency.id] = agency;
        return next;
      });
    } catch {
      // Falha na busca não deve travar o formulário -- apenas fica sem sugestões.
    }
  }

  async function load() {
    try {
      setLoading(true);
      const creditsRes = await fetch('/api/platform/referral-credits');
      if (!creditsRes.ok) throw new Error('Não foi possível carregar os créditos');
      const creditsData = (await creditsRes.json()) as { credits: Credit[] };
      setCredits(creditsData.credits);
      await resolveAgencyNames(creditsData.credits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }

  // Resolve nome/slug para as agências já presentes no ledger (não só a
  // que está sendo selecionada agora), usando o mesmo endpoint de busca
  // com o id exato -- a função platform_search_agencies também casa por
  // id = search_query.
  async function resolveAgencyNames(list: Credit[]) {
    const unresolvedIds = Array.from(new Set(list.map((c) => c.agencyId))).filter(
      (id) => !(id in agencyNames)
    );
    for (const id of unresolvedIds) {
      try {
        const response = await fetch(`/api/platform/agencies/search?q=${encodeURIComponent(id)}`);
        if (!response.ok) continue;
        const data = (await response.json()) as { agencies: AgencySearchResult[] };
        const match = data.agencies.find((a) => a.id === id);
        if (match) setAgencyNames((prev) => ({ ...prev, [id]: match }));
      } catch {
        // Melhor mostrar o ID cru do que travar a tela por uma agência não resolvida.
      }
    }
  }

  async function createCredit() {
    if (!selectedAgency || !form.amount) return;
    const response = await fetch('/api/platform/referral-credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agencyId: selectedAgency.id,
        sourceType: form.sourceType,
        amount: Number(form.amount),
      }),
    });
    if (!response.ok) {
      setError('Não foi possível criar o crédito');
      return;
    }
    setSelectedAgency(null);
    setAgencyQuery('');
    setForm({ sourceType: 'REFERRAL', amount: '' });
    await load();
  }

  async function advance(credit: Credit) {
    const next = NEXT_STATUS[credit.status];
    if (!next) return;
    await fetch(`/api/platform/referral-credits/${credit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    await load();
  }

  function agencyLabel(id: string): string {
    const agency = agencyNames[id];
    return agency ? `${agency.name} (${agency.slug})` : id;
  }

  if (loading) return <div className="text-center py-8">Carregando...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Créditos de Indicação</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-3">
        <h2 className="text-lg font-bold">Novo crédito</h2>

        <div className="relative">
          <label className="block text-xs font-medium text-gray-600 mb-1">Agência</label>
          {selectedAgency ? (
            <div className="flex items-center justify-between rounded-lg border bg-blue-50 px-3 py-2 text-sm">
              <span>
                <strong>{selectedAgency.name}</strong>{' '}
                <span className="text-gray-500">
                  ({selectedAgency.slug} · {selectedAgency.status})
                </span>
              </span>
              <button
                onClick={() => {
                  setSelectedAgency(null);
                  setAgencyQuery('');
                }}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                Trocar
              </button>
            </div>
          ) : (
            <>
              <input
                placeholder="Buscar por nome, slug ou ID..."
                value={agencyQuery}
                onChange={(e) => {
                  setAgencyQuery(e.target.value);
                  setShowResults(true);
                }}
                onFocus={() => setShowResults(true)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
              {showResults && agencyResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-56 overflow-y-auto">
                  {agencyResults.map((agency) => (
                    <button
                      key={agency.id}
                      onClick={() => {
                        setSelectedAgency(agency);
                        setShowResults(false);
                      }}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0"
                    >
                      <span className="font-medium">{agency.name}</span>{' '}
                      <span className="text-gray-500">
                        ({agency.slug} · {agency.status})
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Origem (ex.: REFERRAL)"
            value={form.sourceType}
            onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <input
            type="number"
            placeholder="Valor (BRL)"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="px-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <button
          onClick={() => void createCredit()}
          disabled={!selectedAgency || !form.amount}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium disabled:opacity-40"
        >
          Registrar crédito
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="py-2 px-4">Agência</th>
              <th className="py-2 px-4">Origem</th>
              <th className="py-2 px-4">Valor</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 px-4" />
            </tr>
          </thead>
          <tbody>
            {credits.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="py-2 px-4">{agencyLabel(c.agencyId)}</td>
                <td className="py-2 px-4">{c.sourceType}</td>
                <td className="py-2 px-4">
                  {c.amount.toLocaleString('pt-BR', { style: 'currency', currency: c.currency })}
                </td>
                <td className="py-2 px-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[c.status]}`}>
                    {c.status}
                  </span>
                </td>
                <td className="py-2 px-4">
                  {NEXT_STATUS[c.status] && (
                    <button
                      onClick={() => void advance(c)}
                      className="text-green-700 hover:underline text-xs"
                    >
                      Avançar → {NEXT_STATUS[c.status]}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {credits.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-500">
                  Nenhum crédito registrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
