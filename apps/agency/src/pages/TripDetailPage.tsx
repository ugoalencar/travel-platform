import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Pencil } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { StatusBadge } from '../components/ui/status-badge';
import { Tabs } from '../components/ui/tabs';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { Modal } from '../components/ui/modal';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import {
  ApiError,
  getCustomer,
  getTrip,
  listAirServicesByTrip,
  listLandServicesByTrip,
  listSales,
  updateTrip,
  type AirService,
  type AirServiceStatus,
  type LandService,
  type LandServiceStatus,
} from '../lib/api';
import { formatDateBR } from '../lib/formatDateBR';
import { getTripStatusLabel } from '../lib/statusLabels';
import type { TripStatus } from '../types';
import type { Trip } from '../types/trip';
import type { Customer } from '../types/customer';
import type { Sale, SaleStatus } from '../types/sale';

const TABS = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'itinerary', label: 'Itinerário' },
  { value: 'related', label: 'Relacionados' },
];

function tripStatusTone(s: TripStatus) {
  if (s === 'CONFIRMED' || s === 'COMPLETED') return 'positive' as const;
  if (s === 'IN_PROGRESS') return 'attention' as const;
  return 'neutral' as const;
}

const AIR_LAND_STATUS_LABELS: Record<AirServiceStatus | LandServiceStatus, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
};

const AIR_LAND_STATUS_TONES: Record<AirServiceStatus | LandServiceStatus, 'positive' | 'attention' | 'inactive'> = {
  PENDING: 'attention',
  CONFIRMED: 'positive',
  CANCELLED: 'inactive',
};

const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
};

function saleStatusTone(status: SaleStatus): 'positive' | 'attention' | 'inactive' | 'neutral' {
  if (status === 'PAID') return 'positive';
  if (status === 'CANCELLED' || status === 'REFUNDED') return 'inactive';
  return 'attention';
}

const emptyForm = { name: '', destination: '', startDate: '', endDate: '', description: '' };

export function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState('overview');
  const [trip, setTrip] = useState<Trip | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [airServices, setAirServices] = useState<AirService[]>([]);
  const [landServices, setLandServices] = useState<LandService[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!id) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);
    getTrip(id)
      .then(async (t) => {
        setTrip(t);
        const [c, air, land, allSales] = await Promise.all([
          getCustomer(t.customerId),
          listAirServicesByTrip(t.id),
          listLandServicesByTrip(t.id),
          listSales(),
        ]);
        setCustomer(c);
        setAirServices(air);
        setLandServices(land);
        setSales(allSales.filter((s) => s.tripId === t.id));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a viagem.');
        }
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <LoadingState label="Carregando viagem…" />;
  }

  if (error) {
    return <ErrorState description={error} onRetry={load} />;
  }

  if (notFound || !trip) {
    return (
      <div className="space-y-4">
        <Link to="/trips" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Viagens
        </Link>
        <ErrorState title="Viagem não encontrada" description="O ID informado não corresponde a nenhuma viagem registrada." />
      </div>
    );
  }

  // Itinerary and Proposals ("Relacionados") remain out of CORE-A scope --
  // no itinerary or trip-linked proposal data source exists yet, so these
  // render an honest empty state instead of unrelated fixture data. Sales,
  // air and land services are linked via tripId and rendered below.
  const itinerary: never[] = [];
  const proposals: never[] = [];

  function openEdit() {
    setForm({
      name: trip!.name,
      destination: trip!.destination,
      startDate: trip!.startDate.slice(0, 10),
      endDate: trip!.endDate.slice(0, 10),
      description: trip!.description ?? '',
    });
    setFormError(null);
    setShowEdit(true);
  }

  async function handleEdit() {
    if (!form.name.trim() || !form.destination.trim()) {
      setFormError('Informe o nome e o destino da viagem.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const updated = await updateTrip(trip!.id, {
        name: form.name.trim(),
        destination: form.destination.trim(),
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        description: form.description.trim() || undefined,
      });
      setTrip(updated);
      setShowEdit(false);
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar as alterações.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={trip.name}
        description={`${customer?.name ?? 'Cliente'} · ${trip.destination}`}
        breadcrumbs={[
          { label: 'Painel', to: '/' },
          { label: 'Viagens', to: '/trips' },
          { label: trip.name },
        ]}
        actions={
          <StatusBadge tone={tripStatusTone(trip.status)}>
            {getTripStatusLabel(trip.status)}
          </StatusBadge>
        }
      />

      <div className="flex items-center justify-between">
        <Tabs items={TABS} value={tab} onValueChange={setTab} />
        <Button variant="outline" size="sm" onClick={openEdit}>
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>Detalhes da viagem</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Destino</p>
                      <p className="text-sm font-medium text-slate-900">{trip.destination}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Período</p>
                      <p className="text-sm font-medium text-slate-900">
                        {formatDateBR(trip.startDate, { assumeDateOnly: true })} —{' '}
                        {formatDateBR(trip.endDate, { assumeDateOnly: true })}
                      </p>
                    </div>
                  </div>
                </div>
                {trip.description && (
                  <div className="mt-4 rounded-md bg-slate-50 p-3">
                    <p className="text-xs text-slate-500 mb-1">Descrição</p>
                    <p className="text-sm text-slate-700">{trip.description}</p>
                  </div>
                )}
                {trip.notes && (
                  <div className="mt-3 rounded-md bg-blue-50 p-3">
                    <p className="text-xs text-blue-600 mb-1">Notas internas</p>
                    <p className="text-sm text-blue-800">{trip.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Resumo</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Status</span>
                  <StatusBadge tone={tripStatusTone(trip.status)}>
                    {getTripStatusLabel(trip.status)}
                  </StatusBadge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Criada em</span>
                  <span className="text-sm text-slate-900">{formatDateBR(trip.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Atualizada</span>
                  <span className="text-sm text-slate-900">{formatDateBR(trip.updatedAt)}</span>
                </div>
                {customer && (
                  <Link
                    to={`/customers/${customer.id}`}
                    className="flex items-center justify-between rounded-md bg-slate-50 p-2 text-sm hover:bg-slate-100"
                  >
                    <span className="text-slate-500">Cliente</span>
                    <span className="font-medium text-slate-900">{customer.name}</span>
                  </Link>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === 'itinerary' && (
        <div>
          {itinerary.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-sm font-medium text-slate-500">Itinerário não disponível para esta viagem</p>
                <p className="text-xs text-slate-400 mt-1">O itinerário detalhado será exibido aqui quando disponível.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === 'related' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Propostas</CardTitle></CardHeader>
            <CardContent>
              {proposals.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Nenhuma proposta</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Vendas</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {sales.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Nenhuma venda</p>}
              {sales.map((sale) => (
                <Link
                  key={sale.id}
                  to={`/sales/${sale.id}`}
                  className="flex items-center justify-between rounded-md bg-slate-50 p-2 text-sm hover:bg-slate-100"
                >
                  <span className="text-slate-700">
                    {sale.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                  <StatusBadge tone={saleStatusTone(sale.status)}>
                    {SALE_STATUS_LABELS[sale.status]}
                  </StatusBadge>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Aéreo</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {airServices.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Nenhum segmento aéreo</p>}
              {airServices.map((service) => (
                <Link
                  key={service.id}
                  to="/operations/air"
                  className="flex items-center justify-between rounded-md bg-slate-50 p-2 text-sm hover:bg-slate-100"
                >
                  <span className="text-slate-700">{service.airline} · {service.origin} → {service.destination}</span>
                  <StatusBadge tone={AIR_LAND_STATUS_TONES[service.status]}>
                    {AIR_LAND_STATUS_LABELS[service.status]}
                  </StatusBadge>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Terrestre</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {landServices.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Nenhum serviço terrestre</p>}
              {landServices.map((service) => (
                <Link
                  key={service.id}
                  to="/operations/land"
                  className="flex items-center justify-between rounded-md bg-slate-50 p-2 text-sm hover:bg-slate-100"
                >
                  <span className="text-slate-700">{service.description}</span>
                  <StatusBadge tone={AIR_LAND_STATUS_TONES[service.status]}>
                    {AIR_LAND_STATUS_LABELS[service.status]}
                  </StatusBadge>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Modal
        open={showEdit}
        onClose={() => { setShowEdit(false); setFormError(null); }}
        title="Editar viagem"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => { setShowEdit(false); setFormError(null); }} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={() => { void handleEdit(); }} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <p role="alert" className="rounded-md bg-red-50 p-2 text-xs text-red-700">{formError}</p>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Nome da viagem</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Destino</label>
            <Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Início</label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Fim</label>
              <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Descrição</label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
