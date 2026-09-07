import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { Modal } from '../components/ui/modal';
import { StatusBadge } from '../components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  ApiError,
  createAirService,
  deleteAirService,
  listAirServices,
  listCustomers,
  listSuppliers,
  listTrips,
  updateAirService,
  type AirCabinClass,
  type AirSegmentDirection,
  type AirService,
  type AirServiceInput,
  type AirServiceStatus,
  type AirSupplierPaymentStatus,
  type Supplier,
} from '../lib/api';
import type { Customer } from '../types/customer';
import type { Trip } from '../types/trip';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success' };

type ModalState = { type: 'closed' } | { type: 'create' } | { type: 'edit'; airService: AirService };

type FormSection = 'flight' | 'passenger' | 'commercial' | 'supplier';

const DIRECTION_LABELS: Record<AirSegmentDirection, string> = {
  OUTBOUND: 'Ida',
  RETURN: 'Volta',
  INTERNAL: 'Trecho interno',
};

const CABIN_CLASS_LABELS: Record<AirCabinClass, string> = {
  ECONOMY: 'Econômica',
  PREMIUM_ECONOMY: 'Premium Econômica',
  BUSINESS: 'Executiva',
  FIRST: 'Primeira Classe',
};

const STATUS_LABELS: Record<AirServiceStatus, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
};

const STATUS_TONES: Record<AirServiceStatus, 'positive' | 'attention' | 'inactive'> = {
  PENDING: 'attention',
  CONFIRMED: 'positive',
  CANCELLED: 'inactive',
};

const SUPPLIER_PAYMENT_STATUS_LABELS: Record<AirSupplierPaymentStatus, string> = {
  OPEN: 'Em aberto',
  PARTIALLY_PAID: 'Parcialmente pago',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
};

const FORM_SECTIONS: Array<{ key: FormSection; label: string }> = [
  { key: 'flight', label: 'Voo' },
  { key: 'passenger', label: 'Passageiro' },
  { key: 'commercial', label: 'Comercial' },
  { key: 'supplier', label: 'Fornecedor & Pagamento' },
];

const emptyForm: AirServiceInput = {
  tripId: '',
  customerId: '',
  airline: '',
  direction: 'OUTBOUND',
  sequence: 1,
  origin: '',
  destination: '',
  departureDate: '',
  arrivalDate: '',
  cabinClass: 'ECONOMY',
  fare: 0,
  taxes: 0,
  fees: 0,
  cost: 0,
  saleValue: 0,
  currency: 'BRL',
  supplierPaymentStatus: 'OPEN',
  status: 'PENDING',
};

function toInput(airService: AirService): AirServiceInput {
  return {
    tripId: airService.tripId,
    supplierId: airService.supplierId ?? '',
    customerId: airService.customerId,
    airline: airService.airline,
    consolidator: airService.consolidator ?? '',
    direction: airService.direction,
    sequence: airService.sequence,
    origin: airService.origin,
    destination: airService.destination,
    departureDate: airService.departureDate.slice(0, 10),
    departureTime: airService.departureTime ?? '',
    arrivalDate: airService.arrivalDate.slice(0, 10),
    arrivalTime: airService.arrivalTime ?? '',
    flightNumber: airService.flightNumber ?? '',
    cabinClass: airService.cabinClass,
    bookingLocator: airService.bookingLocator ?? '',
    ticketNumber: airService.ticketNumber ?? '',
    baggage: airService.baggage ?? '',
    seat: airService.seat ?? '',
    fare: airService.fare,
    taxes: airService.taxes,
    fees: airService.fees,
    commission: airService.commission,
    cost: airService.cost,
    saleValue: airService.saleValue,
    currency: airService.currency,
    supplierDueDate: airService.supplierDueDate?.slice(0, 10) ?? '',
    supplierPaymentStatus: airService.supplierPaymentStatus,
    status: airService.status,
    notes: airService.notes ?? '',
  };
}

function sanitize(input: AirServiceInput): AirServiceInput {
  const result: AirServiceInput = {
    ...input,
    tripId: input.tripId.trim(),
    customerId: input.customerId.trim(),
    airline: input.airline.trim(),
    origin: input.origin.trim(),
    destination: input.destination.trim(),
  };
  if (!result.supplierId) delete result.supplierId;
  if (!result.consolidator) delete result.consolidator;
  if (!result.departureTime) delete result.departureTime;
  if (!result.arrivalTime) delete result.arrivalTime;
  if (!result.flightNumber) delete result.flightNumber;
  if (!result.bookingLocator) delete result.bookingLocator;
  if (!result.ticketNumber) delete result.ticketNumber;
  if (!result.baggage) delete result.baggage;
  if (!result.seat) delete result.seat;
  if (!result.supplierDueDate) delete result.supplierDueDate;
  if (!result.notes) delete result.notes;
  if (result.commission === undefined || Number.isNaN(result.commission)) delete result.commission;
  return result;
}

export function AirServicesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [airServices, setAirServices] = useState<AirService[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [tripFilter, setTripFilter] = useState<string>('ALL');
  const [modal, setModal] = useState<ModalState>({ type: 'closed' });
  const [form, setForm] = useState<AirServiceInput>(emptyForm);
  const [section, setSection] = useState<FormSection>('flight');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    Promise.all([listAirServices(), listTrips(), listCustomers(), listSuppliers()])
      .then(([airServicesRes, tripsRes, customersRes, suppliersRes]) => {
        setAirServices(airServicesRes);
        setTrips(tripsRes);
        setCustomers(customersRes);
        setSuppliers(suppliersRes.filter((s) => s.categories.includes('AIRLINE') || s.categories.includes('CONSOLIDATOR')));
        setState({ status: 'success' });
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar os serviços aéreos.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tripById = useMemo(() => new Map(trips.map((t) => [t.id, t])), [trips]);
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);

  const filtered = useMemo(() => {
    if (tripFilter === 'ALL') return airServices;
    return airServices.filter((a) => a.tripId === tripFilter);
  }, [airServices, tripFilter]);

  function openCreate() {
    setForm(emptyForm);
    setSection('flight');
    setFormError(null);
    setModal({ type: 'create' });
  }

  function openEdit(airService: AirService) {
    setForm(toInput(airService));
    setSection('flight');
    setFormError(null);
    setModal({ type: 'edit', airService });
  }

  function closeModal() {
    setModal({ type: 'closed' });
    setFormError(null);
  }

  async function handleSave() {
    if (!form.tripId) {
      setFormError('Selecione a viagem.');
      setSection('flight');
      return;
    }
    if (!form.customerId) {
      setFormError('Selecione o passageiro/cliente.');
      setSection('passenger');
      return;
    }
    if (!form.airline.trim()) {
      setFormError('Informe a companhia aérea.');
      setSection('flight');
      return;
    }
    if (!form.origin.trim() || !form.destination.trim()) {
      setFormError('Informe origem e destino.');
      setSection('flight');
      return;
    }
    if (!form.departureDate || !form.arrivalDate) {
      setFormError('Informe as datas de ida e chegada.');
      setSection('flight');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = sanitize(form);
      if (modal.type === 'edit') {
        await updateAirService(modal.airService.id, payload);
      } else {
        await createAirService(payload);
      }
      closeModal();
      load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o segmento aéreo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(airService: AirService) {
    setSaving(true);
    try {
      await deleteAirService(airService.id);
      load();
    } catch (err: unknown) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Não foi possível excluir o segmento aéreo.',
      });
    } finally {
      setSaving(false);
    }
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Aéreo" description="Segmentos de voo por viagem: ida, volta e conexões." />
        <LoadingState label="Carregando segmentos aéreos..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aéreo"
        description="Segmentos de voo vinculados a cada viagem: companhia, tarifa, custo, venda e status de pagamento ao fornecedor."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Aéreo' }]}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo Segmento
          </Button>
        }
      />

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <Select
          aria-label="Filtrar por viagem"
          value={tripFilter}
          onChange={(event) => setTripFilter(event.target.value)}
          className="sm:w-72"
        >
          <option value="ALL">Todas as viagens</option>
          {trips.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.name} — {trip.destination}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Segmentos Aéreos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {airServices.length === 0 ? (
            <EmptyState
              title="Nenhum segmento aéreo cadastrado"
              description="Cadastre trechos de voo (ida, volta ou conexões) vinculados às viagens dos clientes."
              action={
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Adicionar
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState title="Nenhum resultado" description="Ajuste os filtros para encontrar outros segmentos." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Viagem</TableHead>
                  <TableHead>Passageiro</TableHead>
                  <TableHead>Trecho</TableHead>
                  <TableHead>Companhia / Voo</TableHead>
                  <TableHead>Datas</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Custo / Venda</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((airService) => {
                  const trip = tripById.get(airService.tripId);
                  const customer = customerById.get(airService.customerId);
                  const supplier = airService.supplierId ? supplierById.get(airService.supplierId) : undefined;
                  return (
                    <TableRow key={airService.id}>
                      <TableCell className="font-medium">
                        {trip ? `${trip.name}` : airService.tripId}
                        <div className="text-xs font-normal text-slate-500">{trip?.destination}</div>
                      </TableCell>
                      <TableCell>{customer?.name ?? airService.customerId}</TableCell>
                      <TableCell>
                        <StatusBadge tone="neutral">{DIRECTION_LABELS[airService.direction]}</StatusBadge>
                        <div className="text-xs text-slate-500">{airService.origin} → {airService.destination}</div>
                      </TableCell>
                      <TableCell>
                        {airService.airline}
                        {airService.flightNumber ? (
                          <div className="text-xs text-slate-500">{airService.flightNumber}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{airService.departureDate.slice(0, 10)} {airService.departureTime ?? ''}</div>
                        <div>{airService.arrivalDate.slice(0, 10)} {airService.arrivalTime ?? ''}</div>
                      </TableCell>
                      <TableCell>{supplier?.name ?? '-'}</TableCell>
                      <TableCell className="text-xs">
                        <div>Custo: R$ {airService.cost.toFixed(2)}</div>
                        <div>Venda: R$ {airService.saleValue.toFixed(2)}</div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={STATUS_TONES[airService.status]}>
                          {STATUS_LABELS[airService.status]}
                        </StatusBadge>
                        <div className="mt-1 text-xs text-slate-500">
                          {SUPPLIER_PAYMENT_STATUS_LABELS[airService.supplierPaymentStatus]}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(airService)}
                            aria-label={`Editar segmento ${airService.origin}-${airService.destination}`}
                          >
                            <Pencil className="h-4 w-4" />
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { void handleDelete(airService); }}
                            disabled={saving}
                            aria-label={`Excluir segmento ${airService.origin}-${airService.destination}`}
                          >
                            <Trash2 className="h-4 w-4" />
                            Excluir
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal
        open={modal.type !== 'closed'}
        onClose={closeModal}
        title={modal.type === 'edit' ? 'Editar Segmento Aéreo' : 'Novo Segmento Aéreo'}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => { void handleSave(); }} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{formError}</p>}

          <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
            {FORM_SECTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSection(key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  section === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {section === 'flight' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="air-trip" className="mb-1 block text-sm font-medium text-slate-700">Viagem *</label>
                <Select
                  id="air-trip"
                  value={form.tripId}
                  onChange={(event) => setForm({ ...form, tripId: event.target.value })}
                >
                  <option value="">Selecione a viagem</option>
                  {trips.map((trip) => (
                    <option key={trip.id} value={trip.id}>{trip.name} — {trip.destination}</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="air-airline" className="mb-1 block text-sm font-medium text-slate-700">Companhia Aérea *</label>
                  <Input
                    id="air-airline"
                    value={form.airline}
                    onChange={(event) => setForm({ ...form, airline: event.target.value })}
                    placeholder="Ex: LATAM Airlines"
                  />
                </div>
                <div>
                  <label htmlFor="air-flight-number" className="mb-1 block text-sm font-medium text-slate-700">Número do Voo</label>
                  <Input
                    id="air-flight-number"
                    value={form.flightNumber ?? ''}
                    onChange={(event) => setForm({ ...form, flightNumber: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="air-direction" className="mb-1 block text-sm font-medium text-slate-700">Direção</label>
                  <Select
                    id="air-direction"
                    value={form.direction ?? 'OUTBOUND'}
                    onChange={(event) => setForm({ ...form, direction: event.target.value as AirSegmentDirection })}
                  >
                    {Object.entries(DIRECTION_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label htmlFor="air-cabin" className="mb-1 block text-sm font-medium text-slate-700">Classe</label>
                  <Select
                    id="air-cabin"
                    value={form.cabinClass ?? 'ECONOMY'}
                    onChange={(event) => setForm({ ...form, cabinClass: event.target.value as AirCabinClass })}
                  >
                    {Object.entries(CABIN_CLASS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="air-origin" className="mb-1 block text-sm font-medium text-slate-700">Origem *</label>
                  <Input
                    id="air-origin"
                    value={form.origin}
                    onChange={(event) => setForm({ ...form, origin: event.target.value })}
                    placeholder="Ex: GRU"
                  />
                </div>
                <div>
                  <label htmlFor="air-destination" className="mb-1 block text-sm font-medium text-slate-700">Destino *</label>
                  <Input
                    id="air-destination"
                    value={form.destination}
                    onChange={(event) => setForm({ ...form, destination: event.target.value })}
                    placeholder="Ex: CUN"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="air-departure-date" className="mb-1 block text-sm font-medium text-slate-700">Data de Partida *</label>
                  <Input
                    id="air-departure-date"
                    type="date"
                    value={form.departureDate}
                    onChange={(event) => setForm({ ...form, departureDate: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="air-departure-time" className="mb-1 block text-sm font-medium text-slate-700">Hora de Partida</label>
                  <Input
                    id="air-departure-time"
                    value={form.departureTime ?? ''}
                    onChange={(event) => setForm({ ...form, departureTime: event.target.value })}
                    placeholder="HH:MM"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="air-arrival-date" className="mb-1 block text-sm font-medium text-slate-700">Data de Chegada *</label>
                  <Input
                    id="air-arrival-date"
                    type="date"
                    value={form.arrivalDate}
                    onChange={(event) => setForm({ ...form, arrivalDate: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="air-arrival-time" className="mb-1 block text-sm font-medium text-slate-700">Hora de Chegada</label>
                  <Input
                    id="air-arrival-time"
                    value={form.arrivalTime ?? ''}
                    onChange={(event) => setForm({ ...form, arrivalTime: event.target.value })}
                    placeholder="HH:MM"
                  />
                </div>
              </div>
            </div>
          )}

          {section === 'passenger' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="air-customer" className="mb-1 block text-sm font-medium text-slate-700">Cliente / Passageiro *</label>
                <Select
                  id="air-customer"
                  value={form.customerId}
                  onChange={(event) => setForm({ ...form, customerId: event.target.value })}
                >
                  <option value="">Selecione o cliente</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="air-booking-locator" className="mb-1 block text-sm font-medium text-slate-700">Localizador (PNR)</label>
                  <Input
                    id="air-booking-locator"
                    value={form.bookingLocator ?? ''}
                    onChange={(event) => setForm({ ...form, bookingLocator: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="air-ticket-number" className="mb-1 block text-sm font-medium text-slate-700">Número do Bilhete</label>
                  <Input
                    id="air-ticket-number"
                    value={form.ticketNumber ?? ''}
                    onChange={(event) => setForm({ ...form, ticketNumber: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="air-baggage" className="mb-1 block text-sm font-medium text-slate-700">Bagagem</label>
                  <Input
                    id="air-baggage"
                    value={form.baggage ?? ''}
                    onChange={(event) => setForm({ ...form, baggage: event.target.value })}
                    placeholder="Ex: 1 despachada 23kg"
                  />
                </div>
                <div>
                  <label htmlFor="air-seat" className="mb-1 block text-sm font-medium text-slate-700">Assento</label>
                  <Input
                    id="air-seat"
                    value={form.seat ?? ''}
                    onChange={(event) => setForm({ ...form, seat: event.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {section === 'commercial' && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="air-fare" className="mb-1 block text-sm font-medium text-slate-700">Tarifa</label>
                  <Input
                    id="air-fare"
                    type="number"
                    step="0.01"
                    value={form.fare ?? 0}
                    onChange={(event) => setForm({ ...form, fare: Number(event.target.value) })}
                  />
                </div>
                <div>
                  <label htmlFor="air-taxes" className="mb-1 block text-sm font-medium text-slate-700">Taxas</label>
                  <Input
                    id="air-taxes"
                    type="number"
                    step="0.01"
                    value={form.taxes ?? 0}
                    onChange={(event) => setForm({ ...form, taxes: Number(event.target.value) })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="air-fees" className="mb-1 block text-sm font-medium text-slate-700">Taxas de Serviço</label>
                  <Input
                    id="air-fees"
                    type="number"
                    step="0.01"
                    value={form.fees ?? 0}
                    onChange={(event) => setForm({ ...form, fees: Number(event.target.value) })}
                  />
                </div>
                <div>
                  <label htmlFor="air-commission" className="mb-1 block text-sm font-medium text-slate-700">Comissão</label>
                  <Input
                    id="air-commission"
                    type="number"
                    step="0.01"
                    value={form.commission ?? ''}
                    onChange={(event) => setForm({ ...form, commission: event.target.value ? Number(event.target.value) : undefined })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="air-cost" className="mb-1 block text-sm font-medium text-slate-700">Custo (pago ao fornecedor)</label>
                  <Input
                    id="air-cost"
                    type="number"
                    step="0.01"
                    value={form.cost ?? 0}
                    onChange={(event) => setForm({ ...form, cost: Number(event.target.value) })}
                  />
                </div>
                <div>
                  <label htmlFor="air-sale-value" className="mb-1 block text-sm font-medium text-slate-700">Valor de Venda</label>
                  <Input
                    id="air-sale-value"
                    type="number"
                    step="0.01"
                    value={form.saleValue ?? 0}
                    onChange={(event) => setForm({ ...form, saleValue: Number(event.target.value) })}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="air-status" className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                <Select
                  id="air-status"
                  value={form.status ?? 'PENDING'}
                  onChange={(event) => setForm({ ...form, status: event.target.value as AirServiceStatus })}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </div>
            </div>
          )}

          {section === 'supplier' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="air-supplier" className="mb-1 block text-sm font-medium text-slate-700">Fornecedor (companhia aérea / consolidadora)</label>
                <Select
                  id="air-supplier"
                  value={form.supplierId ?? ''}
                  onChange={(event) => setForm({ ...form, supplierId: event.target.value })}
                >
                  <option value="">Nenhum</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor="air-consolidator" className="mb-1 block text-sm font-medium text-slate-700">Consolidadora</label>
                <Input
                  id="air-consolidator"
                  value={form.consolidator ?? ''}
                  onChange={(event) => setForm({ ...form, consolidator: event.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="air-supplier-due-date" className="mb-1 block text-sm font-medium text-slate-700">Vencimento com Fornecedor</label>
                  <Input
                    id="air-supplier-due-date"
                    type="date"
                    value={form.supplierDueDate ?? ''}
                    onChange={(event) => setForm({ ...form, supplierDueDate: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="air-supplier-payment-status" className="mb-1 block text-sm font-medium text-slate-700">Status de Pagamento</label>
                  <Select
                    id="air-supplier-payment-status"
                    value={form.supplierPaymentStatus ?? 'OPEN'}
                    onChange={(event) => setForm({ ...form, supplierPaymentStatus: event.target.value as AirSupplierPaymentStatus })}
                  >
                    {Object.entries(SUPPLIER_PAYMENT_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <label htmlFor="air-notes" className="mb-1 block text-sm font-medium text-slate-700">Observações</label>
                <Textarea
                  id="air-notes"
                  value={form.notes ?? ''}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
