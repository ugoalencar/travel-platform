import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Map, Heart, FileText, CalendarCheck, Phone, Mail, Home, IdCard, Users, Plus, Trash2, Star } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
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
  listTripsByCustomer,
  listWishesByCustomer,
  listCustomerAddresses,
  createCustomerAddress,
  deleteCustomerAddress,
  listCustomerDependents,
  createCustomerDependent,
  deleteCustomerDependent,
  listCustomerDocuments,
  createCustomerDocument,
  deleteCustomerDocument,
} from '../lib/api';
import { formatDateBR } from '../lib/formatDateBR';
import { formatBRL } from '../lib/formatCurrency';
import { getCustomerStatusLabel, getWishStatusLabel, getTripStatusLabel } from '../lib/statusLabels';
import type { CustomerStatus, WishStatus, TripStatus } from '../types';
import type { Customer } from '../types/customer';
import type { Wish } from '../types/wish';
import type { Trip } from '../types/trip';
import type { CustomerAddress, CustomerDependent, CustomerDocument } from '../types/customer360';

const TABS = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'trips', label: 'Viagens' },
  { value: 'wishes', label: 'Desejos' },
  { value: 'proposals', label: 'Propostas' },
  { value: 'bookings', label: 'Reservas' },
  { value: 'addresses', label: 'Endereços' },
  { value: 'documents', label: 'Documentos' },
  { value: 'dependents', label: 'Dependentes' },
];

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
  CERTIDAO: 'Certidão',
  OUTRO: 'Outro',
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [dependentModalOpen, setDependentModalOpen] = useState(false);
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
    ])
      .then(([c, w, t, a, doc, dep]) => {
        setCustomer(c);
        setWishes(w);
        setTrips(t);
        setAddresses(a);
        setDocuments(doc);
        setDependents(dep);
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
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Link to="/customers" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-3 w-3" /> Clientes
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{customer.name}</h1>
        </div>
        <StatusBadge tone={customerStatusTone(customer.status)}>
          {getCustomerStatusLabel(customer.status)}
        </StatusBadge>
      </div>

      <Tabs items={TABS} value={tab} onValueChange={setTab} />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>Informações do cliente</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-slate-500">E-mail</dt>
                    <dd className="flex items-center gap-1.5 text-sm text-slate-900">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      {customer.email ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Telefone</dt>
                    <dd className="flex items-center gap-1.5 text-sm text-slate-900">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      {customer.phone ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Cadastro</dt>
                    <dd className="text-sm text-slate-900">{formatDateBR(customer.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Última atualização</dt>
                    <dd className="text-sm text-slate-900">{formatDateBR(customer.updatedAt)}</dd>
                  </div>
                </dl>
                {customer.notes && (
                  <div className="mt-4 rounded-md bg-slate-50 p-3">
                    <p className="text-xs text-slate-500 mb-1">Observações</p>
                    <p className="text-sm text-slate-700">{customer.notes}</p>
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
              </CardContent>
            </Card>
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

      {tab === 'wishes' && (
        <div>
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
            documents.map((doc) => (
              <div key={doc.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType} · {doc.documentNumber}
                    </p>
                    <p className="text-xs text-slate-500">
                      {doc.holderName ? `${doc.holderName} · ` : ''}
                      {doc.expiryDate ? `Validade: ${formatDateBR(doc.expiryDate, { assumeDateOnly: true })}` : 'Sem validade informada'}
                    </p>
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
              </div>
            ))
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
    </div>
  );
}
