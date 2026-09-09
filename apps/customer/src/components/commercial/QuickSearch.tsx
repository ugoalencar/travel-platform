import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { searchCustomers } from '../../lib/commercialApi';
import type { CustomerSearchResult } from '../../types/commercial';

// Global quick search: hits the server-side /commercial/customers/search
// endpoint (never fetches everything and filters client-side). Results
// link out to the existing Customer details page, which carries the
// Customer 360 additions.
export function QuickSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function runSearch(value: string) {
    setQuery(value);
    if (value.trim().length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const customers = await searchCustomers(value);
      setResults(customers);
      setOpen(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Busca falhou.');
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative w-full max-w-sm">
      <input
        type="search"
        value={query}
        onChange={(event) => void runSearch(event.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Buscar cliente (nome, email, telefone)..."
        aria-label="Busca global de clientes"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          {loading && <p className="p-3 text-sm text-slate-500">Buscando...</p>}
          {!loading && error && <p className="p-3 text-sm text-red-600">{error}</p>}
          {!loading && !error && results.length === 0 && (
            <p className="p-3 text-sm text-slate-500">Nenhum cliente encontrado.</p>
          )}
          {!loading &&
            !error &&
            results.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  void navigate(`/customers/${customer.id}`);
                }}
                aria-label={`Visualizar cliente ${customer.name}`}
                className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50"
              >
                <div className="font-medium text-slate-900">{customer.name}</div>
                <div className="text-xs text-slate-500">
                  {customer.email ?? '—'} · {customer.phone ?? '—'}
                  {customer.cpfMasked ? ` · CPF ${customer.cpfMasked}` : ''}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
