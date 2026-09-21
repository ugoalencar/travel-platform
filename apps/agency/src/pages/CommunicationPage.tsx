import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Megaphone, Eye, Clock, Send } from 'lucide-react';
import { listCommunications } from '../lib/api';
import type { AgencyCommunication } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

const TYPE_LABELS: Record<string, string> = {
  OFFER: 'Oferta',
  NOTICE: 'Aviso',
  CAMPAIGN: 'Campanha',
  INFORMATION: 'Informação',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  SCHEDULED: 'Agendado',
  ACTIVE: 'Ativo',
  EXPIRED: 'Expirado',
  ARCHIVED: 'Arquivado',
};

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  DRAFT: 'default',
  SCHEDULED: 'warning',
  ACTIVE: 'success',
  EXPIRED: 'error',
  ARCHIVED: 'default',
};

const PLACEMENT_LABELS: Record<string, string> = {
  CUSTOMER_APP_HOME: 'Home do Cliente',
  CUSTOMER_APP_OFFERS: 'Ofertas do Cliente',
  AGENCY_DASHBOARD: 'Dashboard da Agência',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; communications: AgencyCommunication[] };

export function CommunicationPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    const query = filter !== 'all' ? { status: filter } : undefined;
    listCommunications(query)
      .then((communications) => {
        if (!cancelled) setState({ status: 'success', communications });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Não foi possível carregar as comunicações.';
        setState({ status: 'error', message });
      });

    return () => { cancelled = true; };
  }, [filter]);

  const activeCount = state.status === 'success'
    ? state.communications.filter((c) => c.status === 'ACTIVE').length
    : 0;
  const scheduledCount = state.status === 'success'
    ? state.communications.filter((c) => c.status === 'SCHEDULED').length
    : 0;
  const draftCount = state.status === 'success'
    ? state.communications.filter((c) => c.status === 'DRAFT').length
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Comunicação</h1>
          <p className="text-sm text-slate-500">
            Banners, avisos e campanhas da agência para seus clientes.
          </p>
        </div>
        <Link to="/communications/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nova Comunicação
          </Button>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
              <Megaphone className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{activeCount}</p>
              <p className="text-xs text-slate-500">Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{scheduledCount}</p>
              <p className="text-xs text-slate-500">Agendados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50">
              <Send className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{draftCount}</p>
              <p className="text-xs text-slate-500">Rascunhos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {[
          { value: 'all', label: 'Todas' },
          { value: 'ACTIVE', label: 'Ativas' },
          { value: 'SCHEDULED', label: 'Agendadas' },
          { value: 'DRAFT', label: 'Rascunhos' },
          { value: 'ARCHIVED', label: 'Arquivadas' },
        ].map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Content */}
      <div aria-live="polite">
        {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
        {state.status === 'error' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
        {state.status === 'success' && state.communications.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <Megaphone className="mx-auto mb-4 h-12 w-12 text-slate-300" />
            <p className="text-sm text-slate-500">Nenhuma comunicação encontrada.</p>
            <Link to="/communications/new" className="mt-4 inline-block">
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Criar primeira comunicação
              </Button>
            </Link>
          </div>
        )}
      </div>

      {state.status === 'success' && state.communications.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {state.communications.map((comm) => (
            <Link
              key={comm.id}
              to={`/communications/${comm.id}`}
              className="group flex flex-col overflow-hidden rounded-xl border-2 border-slate-200 bg-white shadow-sm transition-all hover:border-purple-300 hover:shadow-md"
            >
              {comm.imageUrl && (
                <div className="h-32 bg-slate-100">
                  <img
                    src={comm.imageUrl}
                    alt={comm.title}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <div className="flex flex-1 flex-col p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[comm.status] ?? 'default'}>
                    {STATUS_LABELS[comm.status]}
                  </Badge>
                  <Badge variant="outline">{TYPE_LABELS[comm.type]}</Badge>
                </div>
                <h3 className="text-base font-semibold text-slate-900 group-hover:text-purple-700">
                  {comm.title}
                </h3>
                {comm.body && (
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{comm.body}</p>
                )}
                <div className="mt-auto pt-3 text-xs text-slate-400">
                  <div className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {PLACEMENT_LABELS[comm.placement]}
                  </div>
                  {comm.visibleFrom && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(comm.visibleFrom).toLocaleDateString('pt-BR')}
                      {comm.visibleUntil && ` — ${new Date(comm.visibleUntil).toLocaleDateString('pt-BR')}`}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
