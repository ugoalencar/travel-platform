import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Ban, CheckCircle2, Pencil } from 'lucide-react';
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
  createSupplier,
  deactivateSupplier,
  listSuppliers,
  updateSupplier,
  SUPPLIER_CATEGORY_OPTIONS,
  type Supplier,
  type SupplierCategory,
  type SupplierInput,
  type SupplierType,
} from '../lib/api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; suppliers: Supplier[] };

type ModalState = { type: 'closed' } | { type: 'create' } | { type: 'edit'; supplier: Supplier };

type FormSection = 'legal' | 'contact' | 'address' | 'banking' | 'categories';

const SUPPLIER_TYPE_LABELS: Record<SupplierType, string> = {
  TRAVEL: 'Viagem',
  OPERATIONAL: 'Operacional',
  BOTH: 'Ambos',
};

const SUPPLIER_CATEGORY_LABELS: Record<SupplierCategory, string> = {
  AIRLINE: 'Companhia Aérea',
  CONSOLIDATOR: 'Consolidadora',
  HOTEL: 'Hotel',
  RESORT: 'Resort',
  TOUR_OPERATOR: 'Operadora',
  TRANSFER: 'Transfer',
  CAR_RENTAL: 'Locadora de Veículos',
  TRAVEL_INSURANCE: 'Seguro Viagem',
  TOUR: 'Passeio',
  GUIDE: 'Guia',
  CRUISE: 'Cruzeiro',
  TRAIN: 'Trem',
  BUS: 'Ônibus',
  TICKET_PROVIDER: 'Emissor de Ingressos',
  RECEPTIVE_OPERATOR: 'Receptivo',
  RENT: 'Aluguel',
  ELECTRICITY: 'Energia',
  WATER: 'Água',
  INTERNET: 'Internet',
  PHONE: 'Telefonia',
  SOFTWARE: 'Software',
  ACCOUNTING: 'Contabilidade',
  LEGAL: 'Jurídico',
  MARKETING: 'Marketing',
  OFFICE: 'Escritório',
  CLEANING: 'Limpeza',
  MAINTENANCE: 'Manutenção',
  EQUIPMENT: 'Equipamentos',
  BANKING: 'Bancário',
  INSURANCE: 'Seguros',
  OTHER: 'Outro',
};

const emptyForm: SupplierInput = {
  name: '',
  tradeName: '',
  document: '',
  contact: '',
  supplierType: 'TRAVEL',
  email: '',
  phone: '',
  website: '',
  addressLine: '',
  addressCity: '',
  addressState: '',
  addressZip: '',
  addressCountry: '',
  bankName: '',
  bankBranch: '',
  bankAccount: '',
  bankPix: '',
  paymentTerms: '',
  notes: '',
  active: true,
  categories: [],
};

const FORM_SECTIONS: Array<{ key: FormSection; label: string }> = [
  { key: 'legal', label: 'Dados Legais' },
  { key: 'contact', label: 'Contato' },
  { key: 'address', label: 'Endereço' },
  { key: 'banking', label: 'Dados Bancários' },
  { key: 'categories', label: 'Categorias' },
];

function toInput(supplier: Supplier): SupplierInput {
  return {
    name: supplier.name,
    tradeName: supplier.tradeName ?? '',
    document: supplier.document ?? '',
    contact: supplier.contact ?? '',
    supplierType: supplier.supplierType,
    email: supplier.email ?? '',
    phone: supplier.phone ?? '',
    website: supplier.website ?? '',
    addressLine: supplier.addressLine ?? '',
    addressCity: supplier.addressCity ?? '',
    addressState: supplier.addressState ?? '',
    addressZip: supplier.addressZip ?? '',
    addressCountry: supplier.addressCountry ?? '',
    bankName: supplier.bankName ?? '',
    bankBranch: supplier.bankBranch ?? '',
    bankAccount: supplier.bankAccount ?? '',
    bankPix: supplier.bankPix ?? '',
    paymentTerms: supplier.paymentTerms ?? '',
    notes: supplier.notes ?? '',
    active: supplier.active,
    categories: supplier.categories,
  };
}

function sanitize(input: SupplierInput): SupplierInput {
  const field = (value?: string): { value?: string } =>
    value && value.trim().length > 0 ? { value: value.trim() } : {};

  const result: SupplierInput = {
    name: input.name.trim(),
    categories: input.categories ?? [],
  };
  if (input.active !== undefined) result.active = input.active;
  if (input.supplierType !== undefined) result.supplierType = input.supplierType;

  const stringFields: Array<keyof SupplierInput> = [
    'tradeName', 'document', 'contact', 'email', 'phone', 'website',
    'addressLine', 'addressCity', 'addressState', 'addressZip', 'addressCountry',
    'bankName', 'bankBranch', 'bankAccount', 'bankPix', 'paymentTerms', 'notes',
  ];
  for (const key of stringFields) {
    const trimmed = field(input[key] as string | undefined);
    if (trimmed.value !== undefined) {
      (result as unknown as Record<string, unknown>)[key] = trimmed.value;
    }
  }
  return result;
}

export function SuppliersPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | SupplierType>('ALL');
  const [modal, setModal] = useState<ModalState>({ type: 'closed' });
  const [form, setForm] = useState<SupplierInput>(emptyForm);
  const [section, setSection] = useState<FormSection>('legal');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    listSuppliers()
      .then((suppliers) => setState({ status: 'success', suppliers }))
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar os fornecedores.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setForm(emptyForm);
    setSection('legal');
    setFormError(null);
    setModal({ type: 'create' });
  }

  function openEdit(supplier: Supplier) {
    setForm(toInput(supplier));
    setSection('legal');
    setFormError(null);
    setModal({ type: 'edit', supplier });
  }

  function closeModal() {
    setModal({ type: 'closed' });
    setFormError(null);
  }

  function toggleCategory(category: SupplierCategory) {
    setForm((prev) => {
      const current = prev.categories ?? [];
      const next = current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category];
      return { ...prev, categories: next };
    });
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setFormError('Informe a razão social / nome do fornecedor.');
      setSection('legal');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = sanitize(form);
      if (modal.type === 'edit') {
        await updateSupplier(modal.supplier.id, payload);
      } else {
        await createSupplier(payload);
      }
      closeModal();
      load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o fornecedor.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(supplier: Supplier) {
    setSaving(true);
    try {
      if (supplier.active) {
        await deactivateSupplier(supplier.id);
      } else {
        await updateSupplier(supplier.id, { active: true });
      }
      load();
    } catch (err: unknown) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Não foi possível atualizar o fornecedor.',
      });
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    if (state.status !== 'success') return [];
    const normalizedQuery = query.trim().toLowerCase();
    return state.suppliers.filter((supplier) => {
      const matchesType = typeFilter === 'ALL' || supplier.supplierType === typeFilter;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        supplier.name.toLowerCase().includes(normalizedQuery) ||
        (supplier.tradeName ?? '').toLowerCase().includes(normalizedQuery) ||
        (supplier.document ?? '').toLowerCase().includes(normalizedQuery);
      return matchesType && matchesQuery;
    });
  }, [state, query, typeFilter]);

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Fornecedores" description="Cadastro de fornecedores de viagem e operacionais." />
        <LoadingState label="Carregando fornecedores..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fornecedores"
        description="Cadastro de fornecedores de viagem (companhias aéreas, hotéis, operadoras) e operacionais (softwares, contabilidade)."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Fornecedores' }]}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Novo Fornecedor
          </Button>
        }
      />

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <label htmlFor="suppliers-search" className="sr-only">Buscar fornecedores</label>
          <Input
            id="suppliers-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, nome fantasia ou documento"
            className="max-w-md"
          />
        </div>
        <Select
          aria-label="Filtrar por tipo"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as 'ALL' | SupplierType)}
          className="sm:w-52"
        >
          <option value="ALL">Todos os tipos</option>
          {Object.entries(SUPPLIER_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fornecedores</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {state.suppliers.length === 0 ? (
            <EmptyState
              title="Nenhum fornecedor cadastrado"
              description="Cadastre fornecedores de viagem ou operacionais para vincular a custos e compras."
              action={
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Adicionar
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState title="Nenhum resultado" description="Ajuste os filtros para encontrar outros fornecedores." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categorias</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">
                      {supplier.name}
                      {supplier.tradeName ? (
                        <div className="text-xs font-normal text-slate-500">{supplier.tradeName}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>{supplier.document ?? '-'}</TableCell>
                    <TableCell>
                      <StatusBadge tone="neutral">{SUPPLIER_TYPE_LABELS[supplier.supplierType]}</StatusBadge>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {supplier.categories.length === 0 ? (
                          <span className="text-xs text-slate-400">-</span>
                        ) : (
                          supplier.categories.map((category) => (
                            <StatusBadge key={category} tone="neutral">
                              {SUPPLIER_CATEGORY_LABELS[category]}
                            </StatusBadge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={supplier.active ? 'positive' : 'inactive'}>
                        {supplier.active ? 'Ativo' : 'Inativo'}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(supplier)}
                          aria-label={`Editar ${supplier.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { void handleToggleActive(supplier); }}
                          disabled={saving}
                          aria-label={supplier.active ? `Desativar ${supplier.name}` : `Ativar ${supplier.name}`}
                        >
                          {supplier.active ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                          {supplier.active ? 'Desativar' : 'Ativar'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal
        open={modal.type !== 'closed'}
        onClose={closeModal}
        title={modal.type === 'edit' ? 'Editar Fornecedor' : 'Novo Fornecedor'}
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

          {section === 'legal' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="supplier-name" className="mb-1 block text-sm font-medium text-slate-700">Razão Social *</label>
                <Input
                  id="supplier-name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Ex: Cia Aérea Latam S.A."
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="supplier-trade-name" className="mb-1 block text-sm font-medium text-slate-700">Nome Fantasia</label>
                  <Input
                    id="supplier-trade-name"
                    value={form.tradeName ?? ''}
                    onChange={(event) => setForm({ ...form, tradeName: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="supplier-document" className="mb-1 block text-sm font-medium text-slate-700">CNPJ/CPF</label>
                  <Input
                    id="supplier-document"
                    value={form.document ?? ''}
                    onChange={(event) => setForm({ ...form, document: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="supplier-type" className="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
                  <Select
                    id="supplier-type"
                    value={form.supplierType ?? 'TRAVEL'}
                    onChange={(event) => setForm({ ...form, supplierType: event.target.value as SupplierType })}
                  >
                    {Object.entries(SUPPLIER_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label htmlFor="supplier-payment-terms" className="mb-1 block text-sm font-medium text-slate-700">Condições de Pagamento</label>
                  <Input
                    id="supplier-payment-terms"
                    value={form.paymentTerms ?? ''}
                    onChange={(event) => setForm({ ...form, paymentTerms: event.target.value })}
                    placeholder="Ex: 30 dias, à vista"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="supplier-notes" className="mb-1 block text-sm font-medium text-slate-700">Observações</label>
                <Textarea
                  id="supplier-notes"
                  value={form.notes ?? ''}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </div>
            </div>
          )}

          {section === 'contact' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="supplier-contact" className="mb-1 block text-sm font-medium text-slate-700">Pessoa de Contato</label>
                <Input
                  id="supplier-contact"
                  value={form.contact ?? ''}
                  onChange={(event) => setForm({ ...form, contact: event.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="supplier-email" className="mb-1 block text-sm font-medium text-slate-700">E-mail</label>
                  <Input
                    id="supplier-email"
                    type="email"
                    value={form.email ?? ''}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="supplier-phone" className="mb-1 block text-sm font-medium text-slate-700">Telefone</label>
                  <Input
                    id="supplier-phone"
                    value={form.phone ?? ''}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="supplier-website" className="mb-1 block text-sm font-medium text-slate-700">Website</label>
                <Input
                  id="supplier-website"
                  value={form.website ?? ''}
                  onChange={(event) => setForm({ ...form, website: event.target.value })}
                  placeholder="https://"
                />
              </div>
            </div>
          )}

          {section === 'address' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="supplier-address-line" className="mb-1 block text-sm font-medium text-slate-700">Endereço</label>
                <Input
                  id="supplier-address-line"
                  value={form.addressLine ?? ''}
                  onChange={(event) => setForm({ ...form, addressLine: event.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="supplier-address-city" className="mb-1 block text-sm font-medium text-slate-700">Cidade</label>
                  <Input
                    id="supplier-address-city"
                    value={form.addressCity ?? ''}
                    onChange={(event) => setForm({ ...form, addressCity: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="supplier-address-state" className="mb-1 block text-sm font-medium text-slate-700">Estado</label>
                  <Input
                    id="supplier-address-state"
                    value={form.addressState ?? ''}
                    onChange={(event) => setForm({ ...form, addressState: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="supplier-address-zip" className="mb-1 block text-sm font-medium text-slate-700">CEP</label>
                  <Input
                    id="supplier-address-zip"
                    value={form.addressZip ?? ''}
                    onChange={(event) => setForm({ ...form, addressZip: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="supplier-address-country" className="mb-1 block text-sm font-medium text-slate-700">País</label>
                  <Input
                    id="supplier-address-country"
                    value={form.addressCountry ?? ''}
                    onChange={(event) => setForm({ ...form, addressCountry: event.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {section === 'banking' && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="supplier-bank-name" className="mb-1 block text-sm font-medium text-slate-700">Banco</label>
                  <Input
                    id="supplier-bank-name"
                    value={form.bankName ?? ''}
                    onChange={(event) => setForm({ ...form, bankName: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="supplier-bank-branch" className="mb-1 block text-sm font-medium text-slate-700">Agência</label>
                  <Input
                    id="supplier-bank-branch"
                    value={form.bankBranch ?? ''}
                    onChange={(event) => setForm({ ...form, bankBranch: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="supplier-bank-account" className="mb-1 block text-sm font-medium text-slate-700">Conta</label>
                  <Input
                    id="supplier-bank-account"
                    value={form.bankAccount ?? ''}
                    onChange={(event) => setForm({ ...form, bankAccount: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="supplier-bank-pix" className="mb-1 block text-sm font-medium text-slate-700">Chave PIX</label>
                  <Input
                    id="supplier-bank-pix"
                    value={form.bankPix ?? ''}
                    onChange={(event) => setForm({ ...form, bankPix: event.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {section === 'categories' && (
            <div className="grid gap-2 sm:grid-cols-2">
              {SUPPLIER_CATEGORY_OPTIONS.map((category) => (
                <label key={category} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={(form.categories ?? []).includes(category)}
                    onChange={() => toggleCategory(category)}
                  />
                  {SUPPLIER_CATEGORY_LABELS[category]}
                </label>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
