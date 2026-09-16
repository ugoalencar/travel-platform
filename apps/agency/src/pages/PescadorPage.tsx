import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Fish,
  Plus,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import {
  ApiError,
  createPescadorSource,
  deletePescadorSearch,
  deletePescadorSearchResult,
  deletePescadorSource,
  listPescadorSearchResults,
  listPescadorSearches,
  listPescadorSources,
  publishPescadorSearchResult,
  runPescadorSearch,
  type PescadorSearch,
  type PescadorSearchResult,
  type PescadorSource,
} from '../lib/api';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';

const emptySourceForm = { name: '', urlTemplate: '' };
const emptySearchForm = {
  origin: '',
  destination: '',
  departureDate: '',
  returnDate: '',
  resultsLimit: '5' as '1' | '5' | '10',
};

export function PescadorPage() {
  const [sources, setSources] = useState<PescadorSource[] | null>(null);
  const [searches, setSearches] = useState<PescadorSearch[] | null>(null);
  const [selectedSearchId, setSelectedSearchId] = useState<string | null>(null);
  const [results, setResults] = useState<PescadorSearchResult[] | null>(null);

  const [sourceForm, setSourceForm] = useState(emptySourceForm);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [savingSource, setSavingSource] = useState(false);

  const [searchForm, setSearchForm] = useState(emptySearchForm);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const [resultActionError, setResultActionError] = useState<string | null>(null);
  const [busyResultId, setBusyResultId] = useState<string | null>(null);

  const loadSources = useCallback(() => {
    listPescadorSources()
      .then(setSources)
      .catch(() => setSources([]));
  }, []);

  const loadSearches = useCallback((selectAfterId?: string) => {
    listPescadorSearches()
      .then((list) => {
        setSearches(list);
        setSelectedSearchId((current) => {
          if (selectAfterId) return selectAfterId;
          if (current && list.some((s) => s.id === current)) return current;
          return list[0]?.id ?? null;
        });
      })
      .catch(() => setSearches([]));
  }, []);

  useEffect(() => {
    loadSources();
    loadSearches();
  }, [loadSources, loadSearches]);

  useEffect(() => {
    if (!selectedSearchId) {
      setResults(null);
      return;
    }
    listPescadorSearchResults(selectedSearchId)
      .then(setResults)
      .catch(() => setResults([]));
  }, [selectedSearchId]);

  async function handleAddSource() {
    const name = sourceForm.name.trim();
    const urlTemplate = sourceForm.urlTemplate.trim();
    if (!name || !urlTemplate) {
      setSourceError('Informe o nome e a URL de busca.');
      return;
    }
    setSavingSource(true);
    setSourceError(null);
    try {
      await createPescadorSource({ name, urlTemplate });
      setSourceForm(emptySourceForm);
      loadSources();
    } catch (err: unknown) {
      setSourceError(err instanceof ApiError ? err.message : 'Não foi possível salvar a fonte.');
    } finally {
      setSavingSource(false);
    }
  }

  async function handleDeleteSource(id: string) {
    try {
      await deletePescadorSource(id);
      loadSources();
    } catch (err: unknown) {
      setSourceError(err instanceof ApiError ? err.message : 'Não foi possível remover a fonte.');
    }
  }

  async function handleRunSearch() {
    const destination = searchForm.destination.trim();
    if (!destination) {
      setSearchError('Informe o destino.');
      return;
    }
    if (!searchForm.departureDate) {
      setSearchError('Informe a data de ida.');
      return;
    }
    if (sources && sources.length === 0) {
      setSearchError('Cadastre ao menos uma fonte de busca antes de pesquisar.');
      return;
    }
    setRunning(true);
    setSearchError(null);
    try {
      const { search } = await runPescadorSearch({
        destination,
        departureDate: searchForm.departureDate,
        resultsLimit: Number(searchForm.resultsLimit) as 1 | 5 | 10,
        ...(searchForm.origin.trim() ? { origin: searchForm.origin.trim() } : {}),
        ...(searchForm.returnDate ? { returnDate: searchForm.returnDate } : {}),
      });
      loadSearches(search.id);
    } catch (err: unknown) {
      setSearchError(err instanceof ApiError ? err.message : 'Não foi possível realizar a pesquisa.');
    } finally {
      setRunning(false);
    }
  }

  async function handleDeleteSearch(id: string) {
    try {
      await deletePescadorSearch(id);
      loadSearches();
    } catch (err: unknown) {
      setSearchError(err instanceof ApiError ? err.message : 'Não foi possível remover a pesquisa.');
    }
  }

  async function handleDeleteResult(id: string) {
    setBusyResultId(id);
    setResultActionError(null);
    try {
      await deletePescadorSearchResult(id);
      setResults((prev) => prev?.filter((r) => r.id !== id) ?? null);
    } catch (err: unknown) {
      setResultActionError(err instanceof ApiError ? err.message : 'Não foi possível remover o resultado.');
    } finally {
      setBusyResultId(null);
    }
  }

  async function handlePublishResult(id: string) {
    setBusyResultId(id);
    setResultActionError(null);
    try {
      const { result } = await publishPescadorSearchResult(id);
      setResults((prev) => prev?.map((r) => (r.id === id ? result : r)) ?? null);
    } catch (err: unknown) {
      setResultActionError(err instanceof ApiError ? err.message : 'Não foi possível criar a oferta.');
    } finally {
      setBusyResultId(null);
    }
  }

  const selectedSearch = searches?.find((s) => s.id === selectedSearchId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pescador"
        description="Cadastre fontes de busca de viagens e pesquise cotações por destino, data e quantidade de resultados."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Pescador' }]}
      />

      {/* Fontes de busca */}
      <Card>
        <CardHeader>
          <CardTitle>Fontes de busca</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            Cadastre links de busca de viagens que você usa na internet. Use{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{'{origin}'}</code>,{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{'{destination}'}</code>,{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{'{departureDate}'}</code> e{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{'{returnDate}'}</code> no lugar dos
            parâmetros — o Pescador substitui esses trechos pelos dados de cada pesquisa.
          </p>
          <div className="grid gap-2 sm:grid-cols-[200px_1fr_auto]">
            <Input
              placeholder="Nome (ex: Decolar)"
              value={sourceForm.name}
              onChange={(e) => setSourceForm({ ...sourceForm, name: e.target.value })}
            />
            <Input
              placeholder="https://exemplo.com/busca?destino={destination}&ida={departureDate}"
              value={sourceForm.urlTemplate}
              onChange={(e) => setSourceForm({ ...sourceForm, urlTemplate: e.target.value })}
            />
            <Button onClick={() => void handleAddSource()} disabled={savingSource}>
              <Plus className="h-4 w-4" />
              {savingSource ? 'Salvando…' : 'Adicionar'}
            </Button>
          </div>
          {sourceError && <p role="alert" className="text-sm font-medium text-red-700">{sourceError}</p>}

          {sources === null ? (
            <LoadingState label="Carregando fontes…" />
          ) : sources.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma fonte cadastrada ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {sources.map((source) => (
                <li key={source.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{source.name}</p>
                    <p className="truncate text-xs text-slate-500">{source.urlTemplate}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleDeleteSource(source.id)}
                    aria-label={`Remover fonte ${source.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Nova pesquisa */}
      <Card>
        <CardHeader>
          <CardTitle>Nova pesquisa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Origem</label>
              <Input
                placeholder="Ex: São Paulo"
                value={searchForm.origin}
                onChange={(e) => setSearchForm({ ...searchForm, origin: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Destino</label>
              <Input
                placeholder="Ex: Cancún, México"
                value={searchForm.destination}
                onChange={(e) => setSearchForm({ ...searchForm, destination: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Ida</label>
              <Input
                type="date"
                value={searchForm.departureDate}
                onChange={(e) => setSearchForm({ ...searchForm, departureDate: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Volta (opcional)</label>
              <Input
                type="date"
                value={searchForm.returnDate}
                onChange={(e) => setSearchForm({ ...searchForm, returnDate: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Resultados</label>
              <Select
                value={searchForm.resultsLimit}
                onChange={(e) => setSearchForm({ ...searchForm, resultsLimit: e.target.value as '1' | '5' | '10' })}
              >
                <option value="1">1</option>
                <option value="5">5</option>
                <option value="10">10</option>
              </Select>
            </div>
          </div>
          {searchError && <p role="alert" className="text-sm font-medium text-red-700">{searchError}</p>}
          <Button onClick={() => void handleRunSearch()} disabled={running}>
            <Search className="h-4 w-4" />
            {running ? 'Buscando…' : 'Buscar'}
          </Button>
        </CardContent>
      </Card>

      {/* Histórico de pesquisas + resultados */}
      {searches && searches.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {searches.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedSearchId(s.id)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedSearchId === s.id
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {s.destination} · {formatDateBR(s.departureDate, { assumeDateOnly: true })}
            </button>
          ))}
        </div>
      )}

      {resultActionError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {resultActionError}
        </div>
      )}

      {selectedSearch && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>
              Resultados — {selectedSearch.destination} ·{' '}
              {formatDateBR(selectedSearch.departureDate, { assumeDateOnly: true })}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleDeleteSearch(selectedSearch.id)}
              aria-label="Remover pesquisa"
            >
              <Trash2 className="h-4 w-4 text-red-600" />
              Remover pesquisa
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {results === null ? (
              <LoadingState label="Carregando resultados…" />
            ) : results.length === 0 ? (
              <EmptyState
                title="Nenhum resultado"
                description="Nenhuma fonte estava cadastrada no momento desta pesquisa, ou todos os resultados já foram removidos."
                icon={<Fish className="h-8 w-8" />}
              />
            ) : (
              results.map((result) => (
                <ResultRow
                  key={result.id}
                  result={result}
                  busy={busyResultId === result.id}
                  onDelete={() => void handleDeleteResult(result.id)}
                  onPublish={() => void handlePublishResult(result.id)}
                />
              ))
            )}
          </CardContent>
        </Card>
      )}

      {searches === null && <LoadingState label="Carregando pesquisas…" />}
    </div>
  );
}

function ResultRow({
  result,
  busy,
  onDelete,
  onPublish,
}: {
  result: PescadorSearchResult;
  busy: boolean;
  onDelete: () => void;
  onPublish: () => void;
}) {
  const hasFailure = !!result.fetchError;
  const canPublish = !!result.title && result.price !== undefined && !result.publishedOfferId;

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{result.sourceName}</p>
          {hasFailure ? (
            <div className="mt-1 flex items-start gap-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{result.fetchError}</span>
            </div>
          ) : (
            <>
              <p className="mt-0.5 text-sm font-medium text-slate-900">{result.title ?? 'Título não detectado'}</p>
              {result.description && <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{result.description}</p>}
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {result.price !== undefined
                  ? result.currency && result.currency !== 'BRL'
                    ? `${result.currency} ${result.price.toLocaleString('pt-BR')}`
                    : formatBRL(result.price)
                  : 'Preço não detectado'}
              </p>
            </>
          )}
          <a
            href={result.targetUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-800"
          >
            Ver na origem <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {result.publishedOfferId ? (
            <Link to={`/offers/${result.publishedOfferId}`}>
              <Button size="sm" variant="outline">
                <CheckCircle2 className="h-4 w-4" />
                Ver oferta
              </Button>
            </Link>
          ) : (
            <Button size="sm" onClick={onPublish} disabled={!canPublish || busy} title={!canPublish ? 'É preciso ter título e preço detectados' : undefined}>
              <Send className="h-4 w-4" />
              Criar oferta
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onDelete} disabled={busy} aria-label="Remover resultado">
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      </div>
    </div>
  );
}
