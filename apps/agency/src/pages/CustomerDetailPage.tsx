import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Map, Heart, FileText, CalendarCheck, Phone, Mail, Home, IdCard, Users, Plus, Trash2, Star, ShieldCheck, Clock, Wallet, UserCog, CreditCard, BookOpen } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { SectionCard } from '../components/ui/section-card';
import { Avatar } from '../components/ui/avatar';
import { StatusBadge } from '../components/ui/status-badge';
import { Tabs } from '../components/ui/tabs';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { Modal } from '../components/ui/modal';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import {
  ApiError,
  getCustomer,
  updateCustomer,
  listTripsByCustomer,
  listWishesByCustomer,
  listSales,
  listCustomerAddresses,
  createCustomerAddress,
  deleteCustomerAddress,
  listCustomerDependents,
  createCustomerDependent,
  deleteCustomerDependent,
  listCustomerDocuments,
  createCustomerDocument,
  deleteCustomerDocument,
  listTravelRequirements,
  createTravelRequirement,
  updateTravelRequirement,
  deleteTravelRequirement,
} from '../lib/api';
import { formatDateBR } from '../lib/formatDateBR';
import { formatBRL } from '../lib/formatCurrency';
import { getCustomerStatusLabel, getWishStatusLabel, getTripStatusLabel } from '../lib/statusLabels';
import type { CustomerStatus, WishStatus, TripStatus } from '../types';
import type { Customer } from '../types/customer';
import type { Wish } from '../types/wish';
import type { Trip } from '../types/trip';
import type { Sale } from '../types/sale';
import type { CustomerAddress, CustomerDependent, CustomerDocument, TravelRequirement, TravelRequirementType } from '../types/customer360';

const TABS = [
  { value: 'overview', label: 'Resumo' },
  { value: 'personal', label: 'Dados Pessoais' },
  { value: 'addresses', label: 'Endereços' },
  { value: 'dependents', label: 'Dependentes' },
  { value: 'documents', label: 'Documentos' },
  { value: 'requirements', label: 'Requisitos de viagem' },
  { value: 'preferences', label: 'Preferências' },
  { value: 'history', label: 'Histórico' },
  { value: 'financial', label: 'Financeiro' },
  { value: 'trips', label: 'Viagens' },
  { value: 'proposals', label: 'Propostas' },
  { value: 'bookings', label: 'Reservas' },
];

const MARITAL_STATUS_LABELS: Record<string, string> = {
  SOLTEIRO: 'Solteiro(a)',
  CASADO: 'Casado(a)',
  DIVORCIADO: 'Divorciado(a)',
  VIUVO: 'Viúvo(a)',
  UNIAO_ESTAVEL: 'União estável',
};

const SALE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmada',
  PAID: 'Paga',
  CANCELLED: 'Cancelada',
  REFUNDED: 'Reembolsada',
};

const TRAVEL_REQUIREMENT_TYPE_LABELS: Record<TravelRequirementType, string> = {
  PASSAPORTE_VALIDO: 'Passaporte válido',
  VISTO: 'Visto',
  VACINACAO: 'Vacinação',
  SEGURO: 'Seguro',
  AUTORIZACAO: 'Autorização',
  OUTROS: 'Outros',
};

function documentStatusTone(doc: CustomerDocument) {
  if (doc.isExpired) return 'inactive' as const;
  if (doc.verificationStatus === 'VERIFIED') return 'positive' as const;
  if (doc.verificationStatus === 'MISMATCH' || doc.verificationStatus === 'MANUAL_REVIEW') return 'attention' as const;
  return 'neutral' as const;
}

function documentStatusLabel(doc: CustomerDocument): string {
  if (doc.isExpired) return 'Expirado';
  const map: Record<string, string> = {
    PENDING: 'Pendente',
    VERIFIED: 'Verificado',
    MISMATCH: 'Divergência',
    EXPIRED: 'Expirado',
    MANUAL_REVIEW: 'Revisão manual',
  };
  return map[doc.verificationStatus] ?? doc.verificationStatus;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  PASSAPORTE: 'Passaporte',
  RG: 'RG',
  CNH: 'CNH',
  CPF: 'CPF',
  VISTO: 'Visto',
  CERTIDAO: 'Certidão de nascimento',
  AUTORIZACAO_VIAGEM: 'Autorização de viagem',
  CERTIFICADO_VACINACAO: 'Carteira/Certificado de vacinação',
  SEGURO_VIAGEM: 'Seguro viagem',
  OUTRO: 'Outro',
};

const DOCUMENT_TYPE_ICONS: Record<string, typeof IdCard> = {
  PASSAPORTE: BookOpen,
  RG: IdCard,
  CNH: CreditCard,
  CPF: CreditCard,
  VISTO: BookOpen,
  CERTIDAO: FileText,
  AUTORIZACAO_VIAGEM: FileText,
  CERTIFICADO_VACINACAO: ShieldCheck,
  SEGURO_VIAGEM: ShieldCheck,
  OUTRO: FileText,
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  SPOUSE: 'Cônjuge',
  CHILD: 'Filho(a)',
  PARENT: 'Pai/Mãe',
  COMPANION: 'Acompanhante',
  OTHER: 'Outro',
};

const ADDRESS_TYPE_LABELS: Record<string, string> = {
  RESIDENTIAL: 'Residencial',
  COMMERCIAL: 'Comercial',
  TEMPORARY: 'Temporário',
};

function wishStatusTone(s: WishStatus) {
  if (s === 'FULFILLED' || s === 'MATCHED') return 'positive' as const;
  if (s === 'ACTIVE') return 'attention' as const;
  if (s === 'CANCELLED' || s === 'EXPIRED') return 'inactive' as const;
  return 'neutral' as const;
}

function tripStatusTone(s: TripStatus) {
  if (s === 'CONFIRMED' || s === 'COMPLETED') return 'positive' as const;
  if (s === 'IN_PROGRESS') return 'attention' as const;
  return 'neutral' as const;
}

function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

/** Builds an update payload that omits blank fields entirely, rather than
 * setting them to `undefined` -- required under exactOptionalPropertyTypes. */
function buildOptionalFields<K extends string>(
  form: FormData,
  keys: readonly K[],
): Partial<Record<K, string>> {
  const result: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = formString(form, key);
    if (value) result[key] = value;
  }
  return result;
}

function Field({ label, value }: { label: string; value?: string | undefined }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value && value.length > 0 ? value : '—'}</dd>
    </div>
  );
}

function customerStatusTone(s: CustomerStatus) {
  if (s === 'ACTIVE') return 'positive' as const;
  if (s === 'INACTIVE') return 'inactive' as const;
  return 'attention' as const;
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState('overview');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [dependents, setDependents] = useState<CustomerDependent[]>([]);
  const [requirements, setRequirements] = useState<TravelRequirement[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [dependentModalOpen, setDependentModalOpen] = useState(false);
  const [requirementModalOpen, setRequirementModalOpen] = useState(false);
  const [personalModalOpen, setPersonalModalOpen] = useState(false);
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
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
    Promise.all([
      getCustomer(id),
      listWishesByCustomer(id),
      listTripsByCustomer(id),
      listCustomerAddresses(id),
      listCustomerDocuments(id),
      listCustomerDependents(id),
      listTravelRequirements(id),
      listSales(),
    ])
      .then(([c, w, t, a, doc, dep, req, allSales]) => {
        setCustomer(c);
        setWishes(w);
        setTrips(t);
        setAddresses(a);
        setDocuments(doc);
        setDependents(dep);
        setRequirements(req);
        setSales(allSales.filter((s) => s.customerId === id));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o cliente.');
        }
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const reloadAddresses = useCallback(() => {
    if (id) listCustomerAddresses(id).then(setAddresses).catch(() => undefined);
  }, [id]);
  const reloadDocuments = useCallback(() => {
    if (id) listCustomerDocuments(id).then(setDocuments).catch(() => undefined);
  }, [id]);
  const reloadDependents = useCallback(() => {
    if (id) listCustomerDependents(id).then(setDependents).catch(() => undefined);
  }, [id]);
  const reloadRequirements = useCallback(() => {
    if (id) listTravelRequirements(id).then(setRequirements).catch(() => undefined);
  }, [id]);

  async function handleCreateRequirement(form: FormData) {
    if (!id) return;
    setSaving(true);
    setFormError(null);
    try {
      const dependentId = formString(form, 'dependentId');
      await createTravelRequirement(id, {
        travelerType: dependentId ? 'DEPENDENT' : 'CUSTOMER',
        dependentId: dependentId || undefined,
        type: formString(form, 'type') || 'OUTROS',
        destination: formString(form, 'destination') || undefined,
        required: true,
        fulfilled: form.get('fulfilled') === 'on',
        expirationDate: formString(form, 'expirationDate') || undefined,
        notes: formString(form, 'notes') || undefined,
      });
      setRequirementModalOpen(false);
      reloadRequirements();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o requisito.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleRequirement(req: TravelRequirement) {
    if (!id) return;
    await updateTravelRequirement(id, req.id, { fulfilled: !req.fulfilled }).catch(() => undefined);
    reloadRequirements();
  }

  async function handleDeleteRequirement(requirementId: string) {
    if (!id) return;
    await deleteTravelRequirement(id, requirementId).catch(() => undefined);
    reloadRequirements();
  }

  async function handleSavePersonal(form: FormData) {
    if (!id) return;
    setSaving(true);
    setFormError(null);
    try {
      const updated = await updateCustomer(id, {
        name: formString(form, 'name') || customer?.name || '',
        ...buildOptionalFields(form, [
          'socialName', 'birthDate', 'nationality', 'maritalStatus', 'profession',
          'cpf', 'rg', 'idIssuingAuthority', 'idIssuedDate', 'email', 'phone', 'whatsapp', 'notes',
        ] as const),
      });
      setCustomer(updated);
      setPersonalModalOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar os dados pessoais.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEmergencyContact(form: FormData) {
    if (!id) return;
    setSaving(true);
    setFormError(null);
    try {
      const updated = await updateCustomer(
        id,
        buildOptionalFields(form, [
          'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone',
          'emergencyContactWhatsapp', 'emergencyContactEmail', 'emergencyContactNotes',
        ] as const),
      );
      setCustomer(updated);
      setEmergencyModalOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o contato de emergência.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateAddress(form: FormData) {
    if (!id) return;
    setSaving(true);
    setFormError(null);
    try {
      await createCustomerAddress(id, {
        type: formString(form, 'type') || 'RESIDENTIAL',
        isPrimary: form.get('isPrimary') === 'on',
        cep: formString(form, 'cep') || undefined,
        street: formString(form, 'street'),
        number: formString(form, 'number'),
        complement: formString(form, 'complement') || undefined,
        district: formString(form, 'district'),
        city: formString(form, 'city'),
        state: formString(form, 'state'),
        country: formString(form, 'country') || 'Brazil',
      });
      setAddressModalOpen(false);
      reloadAddresses();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o endereço.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAddress(addressId: string) {
    if (!id) return;
    await deleteCustomerAddress(id, addressId).catch(() => undefined);
    reloadAddresses();
  }

  async function handleCreateDocument(form: FormData) {
    if (!id) return;
    setSaving(true);
    setFormError(null);
    try {
      await createCustomerDocument(id, {
        documentType: formString(form, 'documentType') || 'OUTRO',
        documentNumber: formString(form, 'documentNumber'),
        holderName: formString(form, 'holderName') || undefined,
        issuingCountry: formString(form, 'issuingCountry') || undefined,
        issuingAuthority: formString(form, 'issuingAuthority') || undefined,
        issuedDate: formString(form, 'issuedDate') || undefined,
        expiryDate: formString(form, 'expiryDate') || undefined,
        notes: formString(form, 'notes') || undefined,
      });
      setDocumentModalOpen(false);
      reloadDocuments();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o documento.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDocument(documentId: string) {
    if (!id) return;
    await deleteCustomerDocument(id, documentId).catch(() => undefined);
    reloadDocuments();
  }

  async function handleCreateDependent(form: FormData) {
    if (!id) return;
    setSaving(true);
    setFormError(null);
    try {
      await createCustomerDependent(id, {
        name: formString(form, 'name'),
        relationshipType: formString(form, 'relationshipType') || 'OTHER',
        birthDate: formString(form, 'birthDate') || undefined,
        cpf: formString(form, 'cpf') || undefined,
        nationality: formString(form, 'nationality') || undefined,
        notes: formString(form, 'notes') || undefined,
      });
      setDependentModalOpen(false);
      reloadDependents();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o dependente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDependent(dependentId: string) {
    if (!id) return;
    await deleteCustomerDependent(id, dependentId).catch(() => undefined);
    reloadDependents();
  }

  if (loading) {
    return <LoadingState label="Carregando cliente…" />;
  }

  if (error) {
    return <ErrorState description={error} onRetry={load} />;
  }

  if (notFound || !customer) {
    return (
      <div className="space-y-4">
        <Link to="/customers" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <ErrorState title="Cliente não encontrado" description="O ID informado não corresponde a nenhum cliente cadastrado." />
      </div>
    );
  }

  // Proposals/Bookings are out of CORE-A scope (Customers + Wishes + Trips
  // only) -- these tabs render an honest empty state rather than fixture
  // data that would no longer correspond to this (now real) customer id.
  const proposals: never[] = [];
  const bookings: never[] = [];

  return (
    <div className="space-y-8">
      <div>
        <Link to="/customers" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-3 w-3" /> Clientes
        </Link>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={customer.name} size="lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{customer.name}</h1>
              <StatusBadge tone={customerStatusTone(customer.status)}>
                {getCustomerStatusLabel(customer.status)}
              </StatusBadge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              {customer.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-slate-400" /> {customer.phone}
                </span>
              )}
              {customer.email && (
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-slate-400" /> {customer.email}
                </span>
              )}
              {customer.cpf && (
                <span className="flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-slate-400" /> CPF {customer.cpf}
                </span>
              )}
              {customer.passport && (
                <span className="flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-slate-400" /> Passaporte {customer.passport}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Cliente desde {formatDateBR(customer.createdAt)}
            </p>
          </div>
        </div>
      </Card>

      <Tabs items={TABS} value={tab} onValueChange={setTab} />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <SectionCard title="Dados pessoais" description="Informações de cadastro do cliente">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nome social" value={customer.socialName} />
                <Field label="Nacionalidade" value={customer.nationality} />
                <Field
                  label="Data de nascimento"
                  value={customer.birthDate ? formatDateBR(customer.birthDate, { assumeDateOnly: true }) : undefined}
                />
                <Field
                  label="Estado civil"
                  value={customer.maritalStatus ? MARITAL_STATUS_LABELS[customer.maritalStatus] ?? customer.maritalStatus : undefined}
                />
                <Field label="Profissão" value={customer.profession} />
                <Field label="RG" value={customer.rg} />
              </dl>
              {customer.notes && (
                <div className="mt-4 rounded-md bg-slate-50 p-3">
                  <p className="text-xs text-slate-500 mb-1">Observações</p>
                  <p className="text-sm text-slate-700">{customer.notes}</p>
                </div>
              )}
            </SectionCard>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <SectionCard
                title="Endereços"
                description={`${addresses.length} cadastrado(s)`}
                actions={
                  <button onClick={() => setTab('addresses')} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                    Ver tudo
                  </button>
                }
              >
                {addresses.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">Nenhum endereço cadastrado</p>
                ) : (
                  <ul className="space-y-3">
                    {addresses.slice(0, 2).map((a) => (
                      <li key={a.id} className="flex items-start gap-2">
                        <Home className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-700">{ADDRESS_TYPE_LABELS[a.type] ?? a.type}</p>
                          <p className="truncate text-xs text-slate-500">{[a.street, a.city, a.state].filter(Boolean).join(', ')}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              <SectionCard
                title="Dependentes"
                description={`${dependents.length} cadastrado(s)`}
                actions={
                  <button onClick={() => setTab('dependents')} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                    Ver tudo
                  </button>
                }
              >
                {dependents.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">Nenhum dependente cadastrado</p>
                ) : (
                  <ul className="space-y-2">
                    {dependents.slice(0, 3).map((d) => (
                      <li key={d.id} className="flex items-center gap-2">
                        <Avatar name={d.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-700">{d.name}</p>
                          <p className="text-xs text-slate-500">{RELATIONSHIP_LABELS[d.relationshipType] ?? d.relationshipType}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>

            <SectionCard
              title="Documentos"
              description={`${documents.length} cadastrado(s)`}
              actions={
                <button onClick={() => setTab('documents')} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                  Ver tudo
                </button>
              }
            >
              {documents.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">Nenhum documento cadastrado</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {documents.slice(0, 4).map((doc) => {
                    const DocIcon = DOCUMENT_TYPE_ICONS[doc.documentType] ?? FileText;
                    return (
                      <div key={doc.id} className="flex items-center gap-2 rounded-md border border-slate-200 p-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-(--radius-sm) bg-slate-100 text-slate-500">
                          <DocIcon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-700">
                            {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                          </p>
                          <StatusBadge tone={documentStatusTone(doc)}>{documentStatusLabel(doc)}</StatusBadge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard title="Resumo">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Desejos</span>
                  <span className="text-sm font-semibold text-slate-900">{wishes.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Viagens</span>
                  <span className="text-sm font-semibold text-slate-900">{trips.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Propostas</span>
                  <span className="text-sm font-semibold text-slate-900">{proposals.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Reservas</span>
                  <span className="text-sm font-semibold text-slate-900">{bookings.length}</span>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Atividade recente">
              {(() => {
                type Event = { date: string; label: string; description: string };
                const events: Event[] = [
                  { date: customer.createdAt, label: 'Cadastro', description: 'Cliente cadastrado.' },
                  ...addresses.map((a) => ({ date: a.createdAt, label: 'Endereço', description: `Endereço ${ADDRESS_TYPE_LABELS[a.type] ?? a.type} adicionado.` })),
                  ...documents.map((d) => ({ date: d.createdAt, label: 'Documento', description: `Documento ${DOCUMENT_TYPE_LABELS[d.documentType] ?? d.documentType} adicionado.` })),
                  ...dependents.map((d) => ({ date: d.createdAt, label: 'Dependente', description: `Dependente ${d.name} adicionado.` })),
                  ...wishes.map((w) => ({ date: w.createdAt, label: 'Desejo', description: `Desejo de viagem para ${w.destination ?? 'destino a definir'} registrado.` })),
                  ...trips.map((t) => ({ date: t.createdAt, label: 'Viagem', description: `Viagem "${t.name}" registrada.` })),
                ]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, 4);

                if (events.length === 0) {
                  return <p className="py-4 text-center text-sm text-slate-400">Sem atividade registrada</p>;
                }

                return (
                  <ol className="space-y-3">
                    {events.map((e, idx) => (
                      <li key={idx} className="flex gap-2.5">
                        <span className="mt-1 flex h-2 w-2 shrink-0 rounded-full bg-blue-400" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-700">{e.label}</p>
                          <p className="truncate text-xs text-slate-500">{e.description}</p>
                          <p className="text-[11px] text-slate-400">{formatDateBR(e.date, { includeTime: true })}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                );
              })()}
              <button
                onClick={() => setTab('history')}
                className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Ver histórico completo
              </button>
            </SectionCard>
          </div>
        </div>
      )}

      {tab === 'trips' && (
        <div>
          {trips.length === 0 ? (
            <EmptyState
              title="Nenhuma viagem"
              description="Este cliente ainda não possui viagens registradas."
              icon={<Map className="h-8 w-8" />}
            />
          ) : (
            <div className="space-y-3">
              {trips.map((trip) => (
                <Link
                  key={trip.id}
                  to={`/trips/${trip.id}`}
                  className="block rounded-lg border border-slate-200 bg-white p-4 transition-all duration-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900">{trip.name}</p>
                      <p className="text-xs text-slate-500">{trip.destination}</p>
                      <p className="mt-2 text-xs text-slate-400">
                        {formatDateBR(trip.startDate, { assumeDateOnly: true })} —{' '}
                        {formatDateBR(trip.endDate, { assumeDateOnly: true })}
                      </p>
                    </div>
                    <StatusBadge tone={tripStatusTone(trip.status)}>
                      {getTripStatusLabel(trip.status)}
                    </StatusBadge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'preferences' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            As preferências de viagem deste cliente são registradas como Desejos —
            cada destino desejado carrega orçamento, datas e número de viajantes.
          </p>
          {wishes.length === 0 ? (
            <EmptyState
              title="Nenhum desejo"
              description="Registre o primeiro desejo deste cliente."
              icon={<Heart className="h-8 w-8" />}
            />
          ) : (
            <div className="space-y-3">
              {wishes.map((w) => (
                <Link
                  key={w.id}
                  to={`/wishes/${w.id}`}
                  className="block rounded-lg border border-slate-200 bg-white p-4 transition-all duration-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900">{w.destination ?? 'Destino não definido'}</p>
                      <p className="text-xs text-slate-500">
                        {w.travelersCount ?? '—'} viajantes · {formatBRL(w.budget)}
                      </p>
                      {w.startDate && (
                        <p className="mt-2 text-xs text-slate-400">
                          {formatDateBR(w.startDate, { assumeDateOnly: true })} —{' '}
                          {w.endDate ? formatDateBR(w.endDate, { assumeDateOnly: true }) : '—'}
                        </p>
                      )}
                    </div>
                    <StatusBadge tone={wishStatusTone(w.status)}>
                      {getWishStatusLabel(w.status)}
                    </StatusBadge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'proposals' && (
        <EmptyState
          title="Nenhuma proposta"
          description="A integração com propostas para este cliente ainda não está disponível nesta versão."
          icon={<FileText className="h-8 w-8" />}
        />
      )}

      {tab === 'bookings' && (
        <EmptyState
          title="Nenhuma reserva"
          description="A integração com reservas para este cliente ainda não está disponível nesta versão."
          icon={<CalendarCheck className="h-8 w-8" />}
        />
      )}

      {tab === 'personal' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Dados pessoais</CardTitle>
              <Button size="sm" variant="outline" onClick={() => { setFormError(null); setPersonalModalOpen(true); }}>
                <UserCog className="h-4 w-4" /> Editar
              </Button>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nome completo" value={customer.name} />
                <Field label="Nome social" value={customer.socialName} />
                <Field label="Data de nascimento" value={customer.birthDate ? formatDateBR(customer.birthDate, { assumeDateOnly: true }) : undefined} />
                <Field label="Nacionalidade" value={customer.nationality} />
                <Field label="Estado civil" value={customer.maritalStatus ? (MARITAL_STATUS_LABELS[customer.maritalStatus] ?? customer.maritalStatus) : undefined} />
                <Field label="Profissão" value={customer.profession} />
                <Field label="CPF" value={customer.cpf} />
                <Field label="RG" value={customer.rg} />
                <Field label="Órgão emissor" value={customer.idIssuingAuthority} />
                <Field label="Data de emissão" value={customer.idIssuedDate ? formatDateBR(customer.idIssuedDate, { assumeDateOnly: true }) : undefined} />
                <Field label="E-mail" value={customer.email} />
                <Field label="Telefone" value={customer.phone} />
                <Field label="WhatsApp" value={customer.whatsapp} />
              </dl>
              {customer.notes && (
                <div className="mt-4 rounded-md bg-slate-50 p-3">
                  <p className="text-xs text-slate-500 mb-1">Observações</p>
                  <p className="text-sm text-slate-700">{customer.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Contato de emergência</CardTitle>
              <Button size="sm" variant="outline" onClick={() => { setFormError(null); setEmergencyModalOpen(true); }}>
                <UserCog className="h-4 w-4" /> Editar
              </Button>
            </CardHeader>
            <CardContent>
              {customer.emergencyContactName ? (
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Nome" value={customer.emergencyContactName} />
                  <Field label="Parentesco" value={customer.emergencyContactRelationship} />
                  <Field label="Telefone" value={customer.emergencyContactPhone} />
                  <Field label="WhatsApp" value={customer.emergencyContactWhatsapp} />
                  <Field label="E-mail" value={customer.emergencyContactEmail} />
                  <Field label="Observações" value={customer.emergencyContactNotes} />
                </dl>
              ) : (
                <EmptyState
                  title="Nenhum contato de emergência"
                  description="Cadastre um contato para acionar em caso de emergência durante a viagem."
                  icon={<Phone className="h-8 w-8" />}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'requirements' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setFormError(null); setRequirementModalOpen(true); }}>
              <Plus className="h-4 w-4" /> Novo requisito
            </Button>
          </div>
          {requirements.length === 0 ? (
            <EmptyState
              title="Nenhum requisito de viagem"
              description="Cadastre a checklist de documentos e requisitos necessários para a viagem deste cliente."
              icon={<ShieldCheck className="h-8 w-8" />}
            />
          ) : (
            requirements.map((r) => {
              const traveler = r.dependentId
                ? dependents.find((d) => d.id === r.dependentId)?.name ?? 'Dependente'
                : customer.name;
              return (
                <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {TRAVEL_REQUIREMENT_TYPE_LABELS[r.type] ?? r.type}
                      </p>
                      <p className="text-xs text-slate-500">
                        Viajante: {traveler}
                        {r.destination ? ` · ${r.destination}` : ''}
                        {r.expirationDate ? ` · Validade: ${formatDateBR(r.expirationDate, { assumeDateOnly: true })}` : ''}
                      </p>
                      {r.notes && <p className="mt-1 text-xs text-slate-500">{r.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { void handleToggleRequirement(r); }}
                        className="focus:outline-none"
                        aria-label={r.fulfilled ? 'Marcar como pendente' : 'Marcar como cumprido'}
                      >
                        <StatusBadge tone={r.fulfilled ? 'positive' : 'attention'}>
                          {r.fulfilled ? 'Cumprido' : 'Pendente'}
                        </StatusBadge>
                      </button>
                      <button
                        aria-label="Excluir requisito"
                        onClick={() => { void handleDeleteRequirement(r.id); }}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          {(() => {
            type Event = { date: string; label: string; description: string };
            const events: Event[] = [
              { date: customer.createdAt, label: 'Cadastro', description: 'Cliente cadastrado.' },
              ...addresses.map((a) => ({ date: a.createdAt, label: 'Endereço', description: `Endereço ${ADDRESS_TYPE_LABELS[a.type] ?? a.type} adicionado.` })),
              ...documents.map((d) => ({ date: d.createdAt, label: 'Documento', description: `Documento ${DOCUMENT_TYPE_LABELS[d.documentType] ?? d.documentType} adicionado.` })),
              ...dependents.map((d) => ({ date: d.createdAt, label: 'Dependente', description: `Dependente ${d.name} adicionado.` })),
              ...wishes.map((w) => ({ date: w.createdAt, label: 'Desejo', description: `Desejo de viagem para ${w.destination ?? 'destino a definir'} registrado.` })),
              ...trips.map((t) => ({ date: t.createdAt, label: 'Viagem', description: `Viagem "${t.name}" registrada.` })),
              ...requirements.map((r) => ({ date: r.createdAt, label: 'Requisito de viagem', description: `Requisito ${TRAVEL_REQUIREMENT_TYPE_LABELS[r.type] ?? r.type} adicionado.` })),
              ...sales.map((s) => ({ date: s.createdAt, label: 'Venda', description: `Venda de ${formatBRL(s.total)} registrada.` })),
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            if (events.length === 0) {
              return (
                <EmptyState
                  title="Nenhum evento"
                  description="Ainda não há atividades registradas para este cliente."
                  icon={<Clock className="h-8 w-8" />}
                />
              );
            }

            return events.map((e, idx) => (
              <div key={idx} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">{e.label}</p>
                  <p className="text-xs text-slate-500">{e.description}</p>
                </div>
                <p className="whitespace-nowrap text-xs text-slate-400">{formatDateBR(e.date)}</p>
              </div>
            ));
          })()}
        </div>
      )}

      {tab === 'financial' && (
        <div className="space-y-3">
          {sales.length === 0 ? (
            <EmptyState
              title="Nenhuma movimentação financeira"
              description="Este cliente ainda não possui vendas registradas."
              icon={<Wallet className="h-8 w-8" />}
            />
          ) : (
            sales.map((s) => (
              <Link
                key={s.id}
                to={`/financial/sales/${s.id}/story`}
                className="block rounded-lg border border-slate-200 bg-white p-4 transition-all duration-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">{s.tripName ?? 'Venda'}</p>
                    <p className="text-xs text-slate-500">
                      Total {formatBRL(s.total)} · Registrada em {formatDateBR(s.createdAt)}
                    </p>
                  </div>
                  <StatusBadge tone={s.status === 'PAID' ? 'positive' : s.status === 'CANCELLED' ? 'inactive' : 'attention'}>
                    {SALE_STATUS_LABELS[s.status] ?? s.status}
                  </StatusBadge>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === 'addresses' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setFormError(null); setAddressModalOpen(true); }}>
              <Plus className="h-4 w-4" /> Novo endereço
            </Button>
          </div>
          {addresses.length === 0 ? (
            <EmptyState
              title="Nenhum endereço"
              description="Cadastre o primeiro endereço deste cliente."
              icon={<Home className="h-8 w-8" />}
            />
          ) : (
            addresses.map((a) => (
              <div key={a.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      {ADDRESS_TYPE_LABELS[a.type] ?? a.type}
                      {a.isPrimary && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                    </p>
                    <p className="text-sm text-slate-700">
                      {a.street}, {a.number}
                      {a.complement ? ` - ${a.complement}` : ''}
                    </p>
                    <p className="text-xs text-slate-500">
                      {a.district} · {a.city}/{a.state} · {a.country}
                      {a.cep ? ` · CEP ${a.cep}` : ''}
                    </p>
                  </div>
                  <button
                    aria-label="Excluir endereço"
                    onClick={() => { void handleDeleteAddress(a.id); }}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setFormError(null); setDocumentModalOpen(true); }}>
              <Plus className="h-4 w-4" /> Novo documento
            </Button>
          </div>
          {documents.length === 0 ? (
            <EmptyState
              title="Nenhum documento"
              description="Cadastre o primeiro documento deste cliente."
              icon={<IdCard className="h-8 w-8" />}
            />
          ) : (
            documents.map((doc) => {
              const DocIcon = DOCUMENT_TYPE_ICONS[doc.documentType] ?? FileText;
              return (
              <div key={doc.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-sm) bg-slate-100 text-slate-500">
                      <DocIcon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType} · {doc.documentNumber}
                      </p>
                      <p className="text-xs text-slate-500">
                        {doc.holderName ? `${doc.holderName} · ` : ''}
                        {doc.expiryDate ? `Validade: ${formatDateBR(doc.expiryDate, { assumeDateOnly: true })}` : 'Sem validade informada'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={documentStatusTone(doc)}>{documentStatusLabel(doc)}</StatusBadge>
                    <button
                      aria-label="Excluir documento"
                      onClick={() => { void handleDeleteDocument(doc.id); }}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 rounded-md border border-dashed border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-medium text-slate-500">Dados extraídos (OCR)</p>
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Field label="Nome extraído" value="Aguardando extração" />
                    <Field label="Nascimento" value="Aguardando extração" />
                    <Field label="Número" value="Aguardando extração" />
                    <Field label="Nacionalidade" value="Aguardando extração" />
                    <Field label="Validade" value="Aguardando extração" />
                    <Field label="Confiança" value="Aguardando extração" />
                    <Field label="Divergências" value="Nenhuma" />
                  </dl>
                  <p className="mt-2 text-[11px] text-slate-400">
                    A extração automática por OCR ainda não está habilitada. Estes campos serão
                    preenchidos automaticamente e nunca substituirão o cadastro sem revisão manual.
                  </p>
                </div>
              </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'dependents' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setFormError(null); setDependentModalOpen(true); }}>
              <Plus className="h-4 w-4" /> Novo dependente
            </Button>
          </div>
          {dependents.length === 0 ? (
            <EmptyState
              title="Nenhum dependente"
              description="Cadastre um dependente ou acompanhante de viagem."
              icon={<Users className="h-8 w-8" />}
            />
          ) : (
            dependents.map((d) => (
              <div key={d.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{d.name}</p>
                    <p className="text-xs text-slate-500">
                      {RELATIONSHIP_LABELS[d.relationshipType] ?? d.relationshipType}
                      {d.birthDate ? ` · Nasc. ${formatDateBR(d.birthDate, { assumeDateOnly: true })}` : ''}
                      {d.cpf ? ` · CPF ${d.cpf}` : ''}
                    </p>
                  </div>
                  <button
                    aria-label="Excluir dependente"
                    onClick={() => { void handleDeleteDependent(d.id); }}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Modal open={addressModalOpen} onClose={() => setAddressModalOpen(false)} title="Novo endereço">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreateAddress(new FormData(e.currentTarget));
          }}
        >
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">
              Tipo
              <Select name="type" defaultValue="RESIDENTIAL" className="mt-1">
                <option value="RESIDENTIAL">Residencial</option>
                <option value="COMMERCIAL">Comercial</option>
                <option value="TEMPORARY">Temporário</option>
              </Select>
            </label>
            <label className="mt-6 flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" name="isPrimary" className="h-4 w-4" /> Endereço principal
            </label>
          </div>
          <label className="text-xs text-slate-500">CEP<Input name="cep" className="mt-1" /></label>
          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-2 text-xs text-slate-500">Rua<Input name="street" required className="mt-1" /></label>
            <label className="text-xs text-slate-500">Número<Input name="number" required className="mt-1" /></label>
          </div>
          <label className="text-xs text-slate-500">Complemento<Input name="complement" className="mt-1" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">Bairro<Input name="district" required className="mt-1" /></label>
            <label className="text-xs text-slate-500">Cidade<Input name="city" required className="mt-1" /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">Estado<Input name="state" required className="mt-1" /></label>
            <label className="text-xs text-slate-500">País<Input name="country" defaultValue="Brazil" className="mt-1" /></label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setAddressModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>Salvar</Button>
          </div>
        </form>
      </Modal>

      <Modal open={documentModalOpen} onClose={() => setDocumentModalOpen(false)} title="Novo documento">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreateDocument(new FormData(e.currentTarget));
          }}
        >
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">
              Tipo
              <Select name="documentType" defaultValue="PASSAPORTE" className="mt-1">
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </label>
            <label className="text-xs text-slate-500">Número<Input name="documentNumber" required className="mt-1" /></label>
          </div>
          <label className="text-xs text-slate-500">Nome do titular<Input name="holderName" className="mt-1" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">País emissor<Input name="issuingCountry" className="mt-1" /></label>
            <label className="text-xs text-slate-500">Órgão emissor<Input name="issuingAuthority" className="mt-1" /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">Emissão<Input type="date" name="issuedDate" className="mt-1" /></label>
            <label className="text-xs text-slate-500">Validade<Input type="date" name="expiryDate" className="mt-1" /></label>
          </div>
          <label className="text-xs text-slate-500">Observações<Input name="notes" className="mt-1" /></label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDocumentModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>Salvar</Button>
          </div>
        </form>
      </Modal>

      <Modal open={dependentModalOpen} onClose={() => setDependentModalOpen(false)} title="Novo dependente">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreateDependent(new FormData(e.currentTarget));
          }}
        >
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <label className="text-xs text-slate-500">Nome<Input name="name" required className="mt-1" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">
              Parentesco
              <Select name="relationshipType" defaultValue="COMPANION" className="mt-1">
                {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </label>
            <label className="text-xs text-slate-500">Nascimento<Input type="date" name="birthDate" className="mt-1" /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">CPF<Input name="cpf" className="mt-1" /></label>
            <label className="text-xs text-slate-500">Nacionalidade<Input name="nationality" defaultValue="Brasileira" className="mt-1" /></label>
          </div>
          <label className="text-xs text-slate-500">Observações<Input name="notes" className="mt-1" /></label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDependentModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>Salvar</Button>
          </div>
        </form>
      </Modal>

      <Modal open={requirementModalOpen} onClose={() => setRequirementModalOpen(false)} title="Novo requisito de viagem">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreateRequirement(new FormData(e.currentTarget));
          }}
        >
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">
              Tipo
              <Select name="type" defaultValue="PASSAPORTE_VALIDO" className="mt-1">
                {Object.entries(TRAVEL_REQUIREMENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </label>
            <label className="text-xs text-slate-500">
              Viajante
              <Select name="dependentId" defaultValue="" className="mt-1">
                <option value="">{customer.name} (titular)</option>
                {dependents.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">Destino<Input name="destination" className="mt-1" /></label>
            <label className="text-xs text-slate-500">Validade<Input type="date" name="expirationDate" className="mt-1" /></label>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" name="fulfilled" className="h-4 w-4" /> Já cumprido
          </label>
          <label className="text-xs text-slate-500">Observações<Input name="notes" className="mt-1" /></label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setRequirementModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>Salvar</Button>
          </div>
        </form>
      </Modal>

      <Modal open={personalModalOpen} onClose={() => setPersonalModalOpen(false)} title="Editar dados pessoais">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSavePersonal(new FormData(e.currentTarget));
          }}
        >
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <label className="text-xs text-slate-500">Nome completo<Input name="name" defaultValue={customer.name} required className="mt-1" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">Nome social<Input name="socialName" defaultValue={customer.socialName} className="mt-1" /></label>
            <label className="text-xs text-slate-500">Data de nascimento<Input type="date" name="birthDate" defaultValue={customer.birthDate?.slice(0, 10)} className="mt-1" /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">Nacionalidade<Input name="nationality" defaultValue={customer.nationality} className="mt-1" /></label>
            <label className="text-xs text-slate-500">
              Estado civil
              <Select name="maritalStatus" defaultValue={customer.maritalStatus ?? ''} className="mt-1">
                <option value="">—</option>
                {Object.entries(MARITAL_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </label>
          </div>
          <label className="text-xs text-slate-500">Profissão<Input name="profession" defaultValue={customer.profession} className="mt-1" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">CPF<Input name="cpf" defaultValue={customer.cpf} className="mt-1" /></label>
            <label className="text-xs text-slate-500">RG<Input name="rg" defaultValue={customer.rg} className="mt-1" /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">Órgão emissor<Input name="idIssuingAuthority" defaultValue={customer.idIssuingAuthority} className="mt-1" /></label>
            <label className="text-xs text-slate-500">Data de emissão<Input type="date" name="idIssuedDate" defaultValue={customer.idIssuedDate?.slice(0, 10)} className="mt-1" /></label>
          </div>
          <label className="text-xs text-slate-500">E-mail<Input type="email" name="email" defaultValue={customer.email} className="mt-1" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">Telefone<Input name="phone" defaultValue={customer.phone} className="mt-1" /></label>
            <label className="text-xs text-slate-500">WhatsApp<Input name="whatsapp" defaultValue={customer.whatsapp} className="mt-1" /></label>
          </div>
          <label className="text-xs text-slate-500">Observações<Input name="notes" defaultValue={customer.notes} className="mt-1" /></label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setPersonalModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>Salvar</Button>
          </div>
        </form>
      </Modal>

      <Modal open={emergencyModalOpen} onClose={() => setEmergencyModalOpen(false)} title="Editar contato de emergência">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSaveEmergencyContact(new FormData(e.currentTarget));
          }}
        >
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <label className="text-xs text-slate-500">Nome<Input name="emergencyContactName" defaultValue={customer.emergencyContactName} className="mt-1" /></label>
          <label className="text-xs text-slate-500">Parentesco<Input name="emergencyContactRelationship" defaultValue={customer.emergencyContactRelationship} className="mt-1" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">Telefone<Input name="emergencyContactPhone" defaultValue={customer.emergencyContactPhone} className="mt-1" /></label>
            <label className="text-xs text-slate-500">WhatsApp<Input name="emergencyContactWhatsapp" defaultValue={customer.emergencyContactWhatsapp} className="mt-1" /></label>
          </div>
          <label className="text-xs text-slate-500">E-mail<Input type="email" name="emergencyContactEmail" defaultValue={customer.emergencyContactEmail} className="mt-1" /></label>
          <label className="text-xs text-slate-500">Observações<Input name="emergencyContactNotes" defaultValue={customer.emergencyContactNotes} className="mt-1" /></label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setEmergencyModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>Salvar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
