import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, Hotel, Banknote, CheckCircle2, Users } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { SectionCard } from '../components/ui/section-card';
import { StatCard } from '../components/ui/stat-card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { Modal } from '../components/ui/modal';
import { StatusBadge } from '../components/ui/status-badge';
import { formatBRL } from '../lib/formatCurrency';
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
  createLandService,
  deleteLandService,
  listCustomers,
  listLandServices,
  listSuppliers,
  listTrips,
  updateLandService,
  type LandService,
  type LandServiceInput,
  type LandServiceStatus,
  type LandServiceType,
  type LandSupplierPaymentStatus,
  type Supplier,
} from '../lib/api';
import type { Customer } from '../types/customer';
import type { Trip } from '../types/trip';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success' };

type ModalState = { type: 'closed' } | { type: 'create' } | { type: 'edit'; landService: LandService };

type FormSection = 'service' | 'traveler' | 'dates' | 'commercial' | 'supplier';

const SERVICE_TYPE_LABELS: Record<LandServiceType, string> = {
  ACCOMMODATION: 'Hospedagem',
  TRANSFER: 'Transfer',
  CAR_RENTAL: 'Locação de Veículo',
  TOUR: 'Passeio',
  TRAVEL_INSURANCE: 'Seguro Viagem',
  CRUISE: 'Cruzeiro',
  TRAIN: 'Trem',
  BUS: 'Ônibus',
  GUIDE: 'Guia',
  TICKET: 'Ingresso',
  RECEPTIVE: 'Receptivo',
  OTHER: 'Outro',
};

const LAND_SUPPLIER_CATEGORIES = [
  'HOTEL',
  'RESORT',
  'TRANSFER',
  'CAR_RENTAL',
  'TOUR_OPERATOR',
  'TOUR',
  'GUIDE',
  'CRUISE',
  'TRAIN',
  'BUS',
  'TICKET_PROVIDER',
  'RECEPTIVE_OPERATOR',
  'TRAVEL_INSURANCE',
  'INSURANCE',
];

const STATUS_LABELS: Record<LandServiceStatus, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
};

const STATUS_TONES: Record<LandServiceStatus, 'positive' | 'attention' | 'inactive'> = {
  PENDING: 'attention',
  CONFIRMED: 'positive',
  CANCELLED: 'inactive',
};

const SUPPLIER_PAYMENT_STATUS_LABELS: Record<LandSupplierPaymentStatus, string> = {
  OPEN: 'Em aberto',
  PARTIALLY_PAID: 'Parcialmente pago',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
};

const FORM_SECTIONS: Array<{ key: FormSection; label: string }> = [
  { key: 'service', label: 'Serviço' },
  { key: 'traveler', label: 'Viajante' },
  { key: 'dates', label: 'Datas & Quantidade' },
  { key: 'commercial', label: 'Comercial' },
  { key: 'supplier', label: 'Fornecedor & Pagamento' },
];

const emptyForm: LandServiceInput = {
  tripId: '',
  customerId: '',
  serviceType: 'ACCOMMODATION',
  description: '',
  startDate: '',
  endDate: '',
  quantity: 1,
  cost: 0,
  saleValue: 0,
  taxes: 0,
  fees: 0,
  currency: 'BRL',
  supplierPaymentStatus: 'OPEN',
  status: 'PENDING',
};

function toInput(landService: LandService): LandServiceInput {
  return {
    tripId: landService.tripId,
    supplierId: landService.supplierId ?? '',
    customerId: landService.customerId,
    serviceType: landService.serviceType,
    description: landService.description,
    startDate: landService.startDate.slice(0, 10),
    endDate: landService.endDate.slice(0, 10),
    quantity: landService.quantity,
    cost: landService.cost,
    saleValue: landService.saleValue,
    taxes: landService.taxes,
    fees: landService.fees,
    commission: landService.commission,
    currency: landService.currency,
    supplierDueDate: landService.supplierDueDate?.slice(0, 10) ?? '',
    supplierPaymentStatus: landService.supplierPaymentStatus,
    status: landService.status,
    confirmationNumber: landService.confirmationNumber ?? '',
    notes: landService.notes ?? '',
  };
}

function sanitize(input: LandServiceInput): LandServiceInput {
  const result: LandServiceInput = {
    ...input,
    tripId: input.tripId.trim(),
    customerId: input.customerId.trim(),
    description: input.description.trim(),
  };
  if (!result.supplierId) delete result.supplierId;
  if (!result.supplierDueDate) delete result.supplierDueDate;
  if (!result.confirmationNumber) delete result.confirmationNumber;
  if (!result.notes) delete result.notes;
  if (result.commission === undefined || Number.isNaN(result.commission)) delete result.commission;
  return result;
}

export function LandServicesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [landServices, setLandServices] = useState<LandService[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [tripFilter, setTripFilter] = useState<string>('ALL');
  const [modal, setModal] = useState<ModalState>({ type: 'closed' });
  const [form, setForm] = useState<LandServiceInput>(emptyForm);
  const [section, setSection] = useState<FormSection>('service');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    Promise.all([listLandServices(), listTrips(), listCustomers(), listSuppliers()])
      .then(([landServicesRes, tripsRes, customersRes, suppliersRes]) => {
        setLandServices(landServicesRes);
        setTrips(tripsRes);
        setCustomers(customersRes);
        setSuppliers(
          suppliersRes.filter((s) => s.categories.some((c) => LAND_SUPPLIER_CATEGORIES.includes(c))),
        );
        setState({ status: 'success' });
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar os serviços terrestres.';
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
    if (tripFilter === 'ALL') return landServices;
    return landServices.filter((l) => l.tripId === tripFilter);
  }, [landServices, tripFilter]);

  const confirmedCount = useMemo(
    () => landServices.filter((l) => l.status === 'CONFIRMED').length,
    [landServices],
  );
  const supplierCount = useMemo(
    () => new Set(landServices.map((l) => l.supplierId).filter(Boolean)).size,
    [landServices],
  );
  const totalCost = useMemo(() => landServices.reduce((sum, l) => sum + l.cost, 0), [landServices]);
  const totalRevenue = useMemo(() => landServices.reduce((sum, l) => sum + l.saleValue, 0), [landServices]);

  function openCreate() {
    setForm(emptyForm);
    setSection('service');
    setFormError(null);
    setModal({ type: 'create' });
  }

  function openEdit(landService: LandService) {
    setForm(toInput(landService));
    setSection('service');
    setFormError(null);
    setModal({ type: 'edit', landService });
  }

  function closeModal() {
    setModal({ type: 'closed' });
    setFormError(null);
  }

  async function handleSave() {
    if (!form.tripId) {
      setFormError('Selecione a viagem.');
      setSection('service');
      return;
    }
    if (!form.description.trim()) {
      setFormError('Informe a descrição do serviço.');
      setSection('service');
      return;
    }
    if (!form.customerId) {
      setFormError('Selecione o viajante/cliente.');
      setSection('traveler');
      return;
    }
    if (!form.startDate || !form.endDate) {
      setFormError('Informe as datas de início e fim.');
      setSection('dates');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = sanitize(form);
      if (modal.type === 'edit') {
        await updateLandService(modal.landService.id, payload);
      } else {
        await createLandService(payload);
      }
      closeModal();
      load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o serviço terrestre.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(landService: LandService) {
    setSaving(true);
    try {
      await deleteLandService(landService.id);
      load();
    } catch (err: unknown) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Não foi possível excluir o serviço terrestre.',
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
        <PageHeader title="Terrestre" description="Serviços terrestres por viagem: hospedagem, transfer, passeios e mais." />
        <LoadingState label="Carregando serviços terrestres..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Terrestre"
        description="Serviços terrestres vinculados a cada viagem: hospedagem, transfer, locação, passeios, seguro e status de pagamento ao fornecedor."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Terrestre' }]}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo Serviço
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Serviços"
          value={String(landServices.length)}
          delta={`${confirmedCount} confirmado${confirmedCount !== 1 ? 's' : ''}`}
          deltaTone="positive"
          icon={<Hotel className="h-4 w-4" />}
          accent="neutral"
        />
        <StatCard
          label="Fornecedores"
          value={String(supplierCount)}
          delta="Hotéis / operadoras / transfers"
          deltaTone="neutral"
          icon={<Users className="h-4 w-4" />}
          accent="pending"
        />
        <StatCard
          label="Custo total"
          value={formatBRL(totalCost)}
          delta="Pago aos fornecedores"
          deltaTone="negative"
          icon={<Banknote className="h-4 w-4" />}
          accent="expense"
        />
        <StatCard
          label="Receita total"
          value={formatBRL(totalRevenue)}
          delta="Valor de venda dos serviços"
          deltaTone="positive"
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="revenue"
        />
      </div>

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

      <SectionCard title="Serviços Terrestres" contentClassName="p-0">
        {landServices.length === 0 ? (
            <EmptyState
              title="Nenhum serviço terrestre cadastrado"
              description="Cadastre hospedagem, transfer, passeios e outros serviços vinculados às viagens dos clientes."
              action={
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Adicionar
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState title="Nenhum resultado" description="Ajuste os filtros para encontrar outros serviços." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Viagem</TableHead>
                  <TableHead>Viajante</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Datas</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Custo / Venda</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((landService) => {
                  const trip = tripById.get(landService.tripId);
                  const customer = customerById.get(landService.customerId);
                  const supplier = landService.supplierId ? supplierById.get(landService.supplierId) : undefined;
                  return (
                    <TableRow key={landService.id}>
                      <TableCell className="font-medium">
                        {trip ? `${trip.name}` : landService.tripId}
                        <div className="text-xs font-normal text-slate-500">{trip?.destination}</div>
                      </TableCell>
                      <TableCell>{customer?.name ?? landService.customerId}</TableCell>
                      <TableCell>
                        <StatusBadge tone="neutral">{SERVICE_TYPE_LABELS[landService.serviceType]}</StatusBadge>
                        <div className="text-xs text-slate-500">{landService.description}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{landService.startDate.slice(0, 10)}</div>
                        <div>{landService.endDate.slice(0, 10)}</div>
                      </TableCell>
                      <TableCell>{supplier?.name ?? '-'}</TableCell>
                      <TableCell className="text-xs">
                        <div>Custo: R$ {landService.cost.toFixed(2)}</div>
                        <div>Venda: R$ {landService.saleValue.toFixed(2)}</div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={STATUS_TONES[landService.status]}>
                          {STATUS_LABELS[landService.status]}
                        </StatusBadge>
                        <div className="mt-1 text-xs text-slate-500">
                          {SUPPLIER_PAYMENT_STATUS_LABELS[landService.supplierPaymentStatus]}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(landService)}
                            aria-label={`Editar serviço ${landService.description}`}
                          >
                            <Pencil className="h-4 w-4" />
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { void handleDelete(landService); }}
                            disabled={saving}
                            aria-label={`Excluir serviço ${landService.description}`}
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
      </SectionCard>

      <Modal
        open={modal.type !== 'closed'}
        onClose={closeModal}
        title={modal.type === 'edit' ? 'Editar Serviço Terrestre' : 'Novo Serviço Terrestre'}
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

          {section === 'service' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="land-trip" className="mb-1 block text-sm font-medium text-slate-700">Viagem *</label>
                <Select
                  id="land-trip"
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
                  <label htmlFor="land-service-type" className="mb-1 block text-sm font-medium text-slate-700">Tipo de Serviço</label>
                  <Select
                    id="land-service-type"
                    value={form.serviceType ?? 'ACCOMMODATION'}
                    onChange={(event) => setForm({ ...form, serviceType: event.target.value as LandServiceType })}
                  >
                    {Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label htmlFor="land-confirmation-number" className="mb-1 block text-sm font-medium text-slate-700">Número de Confirmação</label>
                  <Input
                    id="land-confirmation-number"
                    value={form.confirmationNumber ?? ''}
                    onChange={(event) => setForm({ ...form, confirmationNumber: event.target.value })}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="land-description" className="mb-1 block text-sm font-medium text-slate-700">Descrição *</label>
                <Input
                  id="land-description"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Ex: Hotel Grand Cancún - 7 noites"
                />
              </div>
              <div>
                <label htmlFor="land-status" className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                <Select
                  id="land-status"
                  value={form.status ?? 'PENDING'}
                  onChange={(event) => setForm({ ...form, status: event.target.value as LandServiceStatus })}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </div>
            </div>
          )}

          {section === 'traveler' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="land-customer" className="mb-1 block text-sm font-medium text-slate-700">Cliente / Viajante *</label>
                <Select
                  id="land-customer"
                  value={form.customerId}
                  onChange={(event) => setForm({ ...form, customerId: event.target.value })}
                >
                  <option value="">Selecione o cliente</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </Select>
              </div>
            </div>
          )}

          {section === 'dates' && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="land-start-date" className="mb-1 block text-sm font-medium text-slate-700">Data de Início *</label>
                  <Input
                    id="land-start-date"
                    type="date"
                    value={form.startDate}
                    onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="land-end-date" className="mb-1 block text-sm font-medium text-slate-700">Data de Fim *</label>
                  <Input
                    id="land-end-date"
                    type="date"
                    value={form.endDate}
                    onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="land-quantity" className="mb-1 block text-sm font-medium text-slate-700">Quantidade (noites/unidades)</label>
                <Input
                  id="land-quantity"
                  type="number"
                  step="1"
                  min="1"
                  value={form.quantity ?? 1}
                  onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })}
                />
              </div>
            </div>
          )}

          {section === 'commercial' && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="land-cost" className="mb-1 block text-sm font-medium text-slate-700">Custo (pago ao fornecedor)</label>
                  <Input
                    id="land-cost"
                    type="number"
                    step="0.01"
                    value={form.cost ?? 0}
                    onChange={(event) => setForm({ ...form, cost: Number(event.target.value) })}
                  />
                </div>
                <div>
                  <label htmlFor="land-sale-value" className="mb-1 block text-sm font-medium text-slate-700">Valor de Venda</label>
                  <Input
                    id="land-sale-value"
                    type="number"
                    step="0.01"
                    value={form.saleValue ?? 0}
                    onChange={(event) => setForm({ ...form, saleValue: Number(event.target.value) })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="land-taxes" className="mb-1 block text-sm font-medium text-slate-700">Taxas</label>
                  <Input
                    id="land-taxes"
                    type="number"
                    step="0.01"
                    value={form.taxes ?? 0}
                    onChange={(event) => setForm({ ...form, taxes: Number(event.target.value) })}
                  />
                </div>
                <div>
                  <label htmlFor="land-fees" className="mb-1 block text-sm font-medium text-slate-700">Taxas de Serviço</label>
                  <Input
                    id="land-fees"
                    type="number"
                    step="0.01"
                    value={form.fees ?? 0}
                    onChange={(event) => setForm({ ...form, fees: Number(event.target.value) })}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="land-commission" className="mb-1 block text-sm font-medium text-slate-700">Comissão</label>
                <Input
                  id="land-commission"
                  type="number"
                  step="0.01"
                  value={form.commission ?? ''}
                  onChange={(event) => setForm({ ...form, commission: event.target.value ? Number(event.target.value) : undefined })}
                />
              </div>
            </div>
          )}

          {section === 'supplier' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="land-supplier" className="mb-1 block text-sm font-medium text-slate-700">Fornecedor (hotel / transfer / operadora)</label>
                <Select
                  id="land-supplier"
                  value={form.supplierId ?? ''}
                  onChange={(event) => setForm({ ...form, supplierId: event.target.value })}
                >
                  <option value="">Nenhum</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="land-supplier-due-date" className="mb-1 block text-sm font-medium text-slate-700">Vencimento com Fornecedor</label>
                  <Input
                    id="land-supplier-due-date"
                    type="date"
                    value={form.supplierDueDate ?? ''}
                    onChange={(event) => setForm({ ...form, supplierDueDate: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="land-supplier-payment-status" className="mb-1 block text-sm font-medium text-slate-700">Status de Pagamento</label>
                  <Select
                    id="land-supplier-payment-status"
                    value={form.supplierPaymentStatus ?? 'OPEN'}
                    onChange={(event) => setForm({ ...form, supplierPaymentStatus: event.target.value as LandSupplierPaymentStatus })}
                  >
                    {Object.entries(SUPPLIER_PAYMENT_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <label htmlFor="land-notes" className="mb-1 block text-sm font-medium text-slate-700">Observações</label>
                <Textarea
                  id="land-notes"
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
