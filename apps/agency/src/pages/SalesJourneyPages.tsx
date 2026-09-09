import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, Copy, Edit3, Eye, Search, Send, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { StatusBadge, type StatusTone } from '../components/ui/status-badge';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import { getProposalStatusLabel } from '../lib/statusLabels';
import {
  ApiError,
  listProposals,
  getProposal,
  listBookings,
  getBooking,
  listOffers,
  createProposal,
  listSales,
  getSale,
  getSaleFinancialStory,
  type Proposal,
  type Offer,
  type SaleFinancialStory,
} from '../lib/api';
import type { Booking } from '../types/booking';
import type { Sale, SaleStatus } from '../types/sale';

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: T | null };

type StepKey = 'Wish' | 'Proposal' | 'Booking' | 'Sale';

function statusTone(status: string): StatusTone {
  if (status === 'ACCEPTED') return 'positive';
  if (status === 'SENT') return 'neutral';
  if (status === 'DRAFT') return 'attention';
  return 'neutral';
}

function PageIntro({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">UI-03</p>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
      <p className="max-w-3xl text-sm text-slate-600">{description}</p>
    </div>
  );
}

function JourneyRail({ active }: { active: StepKey }) {
  const steps: StepKey[] = ['Wish', 'Proposal', 'Booking', 'Sale'];

  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-2 md:grid-cols-4">
      {steps.map((step, index) => (
        <div
          key={step}
          className={`rounded-md px-3 py-2 ${step === active ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-600'}`}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide">
            {String(index + 1).padStart(2, '0')}
          </span>
          <p className="text-sm font-semibold">{step}</p>
        </div>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-950">{value}</dd>
    </div>
  );
}

export function ProposalListPage() {
  const [state, setState] = useState<LoadState<Proposal[]>>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    listProposals()
      .then((proposals) => {
        setState({ status: 'success', data: proposals });
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar as propostas.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const renderContent = () => {
    if (state.status === 'loading') {
      return <LoadingState label="Carregando propostas…" />;
    }

    if (state.status === 'error') {
      return <ErrorState description={state.message} onRetry={load} />;
    }

    const proposals = state.data || [];
    if (proposals.length === 0) {
      return (
        <EmptyState
          title="Nenhuma proposta encontrada"
          description="Quando houver propostas, elas aparecerão aqui."
          action={<Button size="sm" disabled>Nova proposta</Button>}
        />
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-190 text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Destino</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            { }
            {proposals.map((proposal: Proposal) => (
              <tr key={proposal.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-4 font-medium text-slate-950">{proposal.customerName || proposal.customerId}</td>
                <td className="px-4 py-4 text-slate-600">{proposal.notes || '—'}</td>
                <td className="px-4 py-4 font-semibold text-slate-950">
                  {formatBRL(proposal.total)}
                </td>
                <td className="px-4 py-4">
                  <StatusBadge tone={statusTone(proposal.status)}>
                    {getProposalStatusLabel(proposal.status)}
                  </StatusBadge>
                </td>
                <td className="px-4 py-4 text-right">
                  <Link
                    to={`/proposals/${proposal.id}`}
                    className="inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageIntro
        title="Jornada comercial"
        description="Fluxo visual de apresentacao que acompanha o desejo do cliente ate proposta, reserva operacional e venda."
      />
      <JourneyRail active="Proposal" />
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Propostas em apresentacao</CardTitle>
          <Button size="sm" disabled>
            <Edit3 className="h-4 w-4" />
            Montar proposta
          </Button>
        </CardHeader>
        <CardContent>{renderContent()}</CardContent>
      </Card>
    </div>
  );
}

export function ProposalDetailPage() {
  const { id } = useParams();
  const [state, setState] = useState<LoadState<Proposal>>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    setState({ status: 'loading' });
    getProposal(id)
      .then((proposal) => {
        setState({ status: 'success', data: proposal });
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar a proposta.';
        setState({ status: 'error', message });
      });
  }, [id]);

  if (!id) {
    return <Navigate to="/proposals" replace />;
  }

  if (state.status === 'loading') {
    return <LoadingState label="Carregando proposta…" />;
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={() => {}} />;
  }

  if (!state.data) {
    return <Navigate to="/proposals" replace />;
  }

  const proposal = state.data;

   
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PageIntro title={`Proposta ${proposal.id}`} description={proposal.notes || 'Detalhes da proposta'} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled>
            <Edit3 className="h-4 w-4" />
            Editar
          </Button>
          <Button variant="outline" disabled>
            <Copy className="h-4 w-4" />
            Duplicar
          </Button>
          <Button variant="outline" disabled>
            <Eye className="h-4 w-4" />
            Prévia
          </Button>
          <Button variant="outline" disabled>
            <Send className="h-4 w-4" />
            Enviar
          </Button>
          <Button disabled>
            <CheckCircle2 className="h-4 w-4" />
            Converter
          </Button>
        </div>
      </div>
      <JourneyRail active="Proposal" />
      <Card>
        <CardHeader>
          <CardTitle>Informacoes da proposta</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          { }
          <Field label="Cliente" value={proposal.customerName || proposal.customerId} />
          { }
          <Field label="Preco proposto" value={formatBRL(proposal.proposedPrice)} />
          { }
          <Field label="Desconto" value={formatBRL(proposal.discount)} />
          { }
          <Field label="Total" value={formatBRL(proposal.total)} />
          { }
          <Field label="Status" value={getProposalStatusLabel(proposal.status)} />
          { }
          {proposal.validUntil && <Field label="Valido ate" value={proposal.validUntil} />}
        </CardContent>
      </Card>
    </div>
  );
}

interface ItineraryItem {
  type: 'transport' | 'accommodation' | 'activity';
  description: string;
  price: number;
}

export function ProposalBuilderPage() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [itineraryItems, setItineraryItems] = useState<ItineraryItem[]>([]);
  const [proposedPrice, setProposedPrice] = useState<number>(0);
  const [markupPercentage, setMarkupPercentage] = useState<number>(0);
  const [conditions, setConditions] = useState('');
  const [notes, setNotes] = useState('');

  const [itemType, setItemType] = useState<'transport' | 'accommodation' | 'activity'>('transport');
  const [itemDescription, setItemDescription] = useState('');
  const [itemPrice, setItemPrice] = useState<number>(0);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [bookingsData, offersData] = await Promise.all([
          listBookings(),
          listOffers(),
        ]);
        setBookings(bookingsData || []);
        setOffers(offersData || []);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar os dados.';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, []);

  const handleBookingChange = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setSelectedOfferId('');
  };

  const calculateTotal = (): number => {
    const baseTotal = proposedPrice + itineraryItems.reduce((sum, item) => sum + item.price, 0);
    const markupAmount = baseTotal * (markupPercentage / 100);
    return baseTotal + markupAmount;
  };

  const addItineraryItem = () => {
    if (itemDescription && itemPrice > 0) {
      setItineraryItems([
        ...itineraryItems,
        { type: itemType, description: itemDescription, price: itemPrice },
      ]);
      setItemDescription('');
      setItemPrice(0);
      setItemType('transport');
    }
  };

  const removeItineraryItem = (index: number) => {
    setItineraryItems(itineraryItems.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedBookingId) {
      setError('Selecione uma reserva.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const selectedBooking = bookings.find(b => b.id === selectedBookingId);
      if (!selectedBooking) {
        throw new Error('Reserva não encontrada.');
      }

      const input: Parameters<typeof createProposal>[0] = {
        customerId: selectedBooking.bookerCustomerId,
        proposedPrice,
      };

      if (selectedOfferId) input.offerId = selectedOfferId;
      if (markupPercentage < 0) input.discount = Math.abs(markupPercentage * proposedPrice / 100);
      if (conditions) input.conditions = conditions;
      if (notes) input.notes = notes;

      const proposal = await createProposal(input);
      void navigate(`/proposals/${proposal.id}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível criar a proposta.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageIntro
          title="Builder de proposta"
          description="Interface para compor uma proposta completa com itinerário, transporte, hospedagem e pricing."
        />
        <JourneyRail active="Proposal" />
        <LoadingState label="Carregando dados..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Builder de proposta"
        description="Interface para compor uma proposta completa com itinerário, transporte, hospedagem e pricing."
      />
      <JourneyRail active="Proposal" />

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex gap-3 pt-6">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
              <p className="text-sm text-red-800">{error}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Dados da reserva</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Reserva *</label>
              <Select
                value={selectedBookingId}
                onChange={(e) => handleBookingChange(e.target.value)}
                required
                className="mt-1"
              >
                <option value="">Selecione uma reserva</option>
                {bookings.map((booking) => (
                  <option key={booking.id} value={booking.id}>
                    {booking.customerName || booking.bookerCustomerId} - {booking.id}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Oferta</label>
              <Select
                value={selectedOfferId}
                onChange={(e) => setSelectedOfferId(e.target.value)}
                className="mt-1"
              >
                <option value="">Selecione uma oferta (opcional)</option>
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.name} - {formatBRL(offer.price)}
                  </option>
                ))}
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Preço proposto (BRL) *</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={proposedPrice}
                onChange={(e) => setProposedPrice(parseFloat(e.target.value) || 0)}
                required
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Markup/Desconto (%)</label>
              <Input
                type="number"
                step="0.01"
                value={markupPercentage}
                onChange={(e) => setMarkupPercentage(parseFloat(e.target.value) || 0)}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-slate-500">Positivo para markup, negativo para desconto</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Itinerário</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-12">
              <div className="md:col-span-3">
                <label className="text-sm font-medium text-slate-700">Tipo</label>
                <Select
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value as 'transport' | 'accommodation' | 'activity')}
                  className="mt-1"
                >
                  <option value="transport">Transporte</option>
                  <option value="accommodation">Hospedagem</option>
                  <option value="activity">Atividade</option>
                </Select>
              </div>

              <div className="md:col-span-5">
                <label className="text-sm font-medium text-slate-700">Descrição</label>
                <Input
                  type="text"
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  placeholder="Ex: Voo São Paulo - Rio de Janeiro"
                  className="mt-1"
                />
              </div>

              <div className="md:col-span-3">
                <label className="text-sm font-medium text-slate-700">Preço (BRL)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={itemPrice}
                  onChange={(e) => setItemPrice(parseFloat(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>

              <div className="flex items-end md:col-span-1">
                <Button
                  type="button"
                  onClick={addItineraryItem}
                  size="sm"
                  variant="outline"
                  className="w-full"
                >
                  Adicionar
                </Button>
              </div>
            </div>

            {itineraryItems.length > 0 && (
              <div className="mt-6 space-y-2 border-t border-slate-200 pt-4">
                <h4 className="text-sm font-medium text-slate-700">Itens adicionados</h4>
                {itineraryItems.map((item, index) => (
                  <div key={index} className="flex items-center justify-between rounded-md border border-slate-200 p-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {item.type === 'transport' && 'Transporte'}
                        {item.type === 'accommodation' && 'Hospedagem'}
                        {item.type === 'activity' && 'Atividade'}: {item.description}
                      </p>
                      <p className="text-sm text-slate-600">{formatBRL(item.price)}</p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => removeItineraryItem(index)}
                      size="sm"
                      variant="outline"
                      className="ml-4 text-red-600 hover:bg-red-50"
                    >
                      Remover
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-300 bg-slate-50">
          <CardHeader>
            <CardTitle>Resumo do preço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Preço proposto:</span>
              <span className="font-medium text-slate-950">{formatBRL(proposedPrice)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Itinerário:</span>
              <span className="font-medium text-slate-950">
                {formatBRL(itineraryItems.reduce((sum, item) => sum + item.price, 0))}
              </span>
            </div>
            {markupPercentage !== 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Markup/Desconto:</span>
                <span className={`font-medium ${markupPercentage > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {markupPercentage > 0 ? '+' : ''}{formatBRL((proposedPrice + itineraryItems.reduce((sum, item) => sum + item.price, 0)) * (markupPercentage / 100))}
                </span>
              </div>
            )}
            <div className="border-t border-slate-300 pt-2">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-950">Total:</span>
                <span className="text-lg font-bold text-slate-950">{formatBRL(calculateTotal())}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Termos e condições</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Condições da proposta</label>
              <Textarea
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                placeholder="Descreva as condições e termos da proposta..."
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Observações</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Adicione observações adicionais..."
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={submitting || !selectedBookingId}
            className="bg-slate-950 text-white hover:bg-slate-800"
          >
            {submitting ? 'Salvando...' : 'Salvar proposta'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void navigate('/proposals')}
            disabled={submitting}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}

export function ProposalPreviewPage() {
  return (
    <div className="space-y-6">
      <PageIntro
        title="Prévia de proposta"
        description="Visualização da proposta como será apresentada ao cliente."
      />
      <JourneyRail active="Proposal" />
      <EmptyState
        title="Prévia de proposta"
        description="Esta funcionalidade ainda não está implementada. Aguarde a integração com o backend."
      />
    </div>
  );
}

export function BookingListPage() {
  const [state, setState] = useState<LoadState<Booking[]>>({ status: 'loading' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CANCELLED'>('ALL');

  const load = useCallback(() => {
    setState({ status: 'loading' });
    listBookings()
      .then((bookings) => {
        setState({ status: 'success', data: bookings });
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar as reservas.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const bookings = useMemo(() => (state.status === 'success' ? state.data || [] : []), [state]);
  const activeCount = bookings.filter((booking) => !booking.cancelled).length;
  const cancelledCount = bookings.filter((booking) => booking.cancelled).length;
  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const searchable = [
        booking.customerName,
        booking.bookerCustomerId,
        booking.tripType,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesSearch = searchable.includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && !booking.cancelled) ||
        (statusFilter === 'CANCELLED' && booking.cancelled);
      return matchesSearch && matchesStatus;
    });
  }, [bookings, search, statusFilter]);

  const renderContent = () => {
    if (state.status === 'loading') {
      return <LoadingState label="Carregando reservas…" />;
    }

    if (state.status === 'error') {
      return <ErrorState description={state.message} onRetry={load} />;
    }

    if (bookings.length === 0) {
      return (
        <EmptyState
          title="Nenhuma reserva encontrada"
          description="Quando houver reservas, elas aparecerão aqui."
        />
      );
    }

    if (filteredBookings.length === 0) {
      return <EmptyState title="Nenhuma reserva encontrada" description="Ajuste busca ou status para ampliar a visão." />;
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Viagem</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Criada em</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredBookings.map((booking: Booking) => (
              <tr key={booking.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-4">
                  <p className="font-semibold text-slate-950">{booking.customerName || booking.bookerCustomerId}</p>
                  <p className="text-xs text-slate-500">Responsável pela reserva</p>
                </td>
                <td className="px-4 py-4 text-slate-600">Reserva vinculada</td>
                <td className="px-4 py-4 text-slate-600">{booking.tripType}</td>
                <td className="px-4 py-4">
                  <StatusBadge tone={booking.cancelled ? 'inactive' : 'positive'}>
                    {booking.cancelled ? 'Cancelada' : 'Confirmada'}
                  </StatusBadge>
                </td>
                <td className="px-4 py-4 text-slate-500">{formatDateBR(booking.createdAt)}</td>
                <td className="px-4 py-4 text-right">
                  <Link
                    to={`/bookings/${booking.id}`}
                    className="inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageIntro
        title="Reservas operacionais"
        description="Visualize todos os voos, hotéis e serviços confirmados para cada viagem."
      />
      <JourneyRail active="Booking" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric label="Reservas ativas" value={String(activeCount)} />
        <Metric label="Canceladas" value={String(cancelledCount)} />
        <Metric label="Total em operação" value={String(bookings.length)} />
      </div>
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Reservas em execução</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                aria-label="Buscar reservas"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cliente, viagem ou tipo"
                className="h-9 min-w-72 pl-9"
              />
            </label>
            <Select
              aria-label="Filtrar reservas por status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="h-9 sm:w-40"
            >
              <option value="ALL">Todas</option>
              <option value="ACTIVE">Confirmadas</option>
              <option value="CANCELLED">Canceladas</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent>{renderContent()}</CardContent>
      </Card>
    </div>
  );
}

export function BookingDetailPage() {
  const { id } = useParams();
  const [state, setState] = useState<LoadState<Booking>>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    setState({ status: 'loading' });
    getBooking(id)
      .then((booking) => {
        setState({ status: 'success', data: booking });
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar a reserva.';
        setState({ status: 'error', message });
      });
  }, [id]);

  if (!id) {
    return <Navigate to="/bookings" replace />;
  }

  if (state.status === 'loading') {
    return <LoadingState label="Carregando reserva…" />;
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={() => {}} />;
  }

  if (!state.data) {
    return <Navigate to="/bookings" replace />;
  }

  const booking = state.data;

   
  return (
    <div className="space-y-6">
      <PageIntro
        title={`Reserva ${booking.id}`}
        description="Detalhes da reserva operacional, confirmações e documentação."
      />
      <JourneyRail active="Booking" />
      <Card>
        <CardHeader>
          <CardTitle>Informacoes da reserva</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          { }
          <Field label="Cliente" value={booking.customerName || booking.bookerCustomerId} />
          { }
          <Field label="Tipo" value={booking.tripType} />
          { }
          <Field label="Status" value={booking.cancelled ? 'Cancelada' : 'Confirmada'} />
          { }
          <Field
            label="Criada em"
            value={new Date(booking.createdAt).toLocaleDateString('pt-BR')}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function saleStatusTone(status: SaleStatus): StatusTone {
  if (status === 'PAID') return 'positive';
  if (status === 'CONFIRMED') return 'neutral';
  if (status === 'CANCELLED' || status === 'REFUNDED') return 'inactive';
  return 'attention';
}

function saleStatusLabel(status: SaleStatus): string {
  const labels: Record<SaleStatus, string> = {
    PENDING: 'Pendente',
    CONFIRMED: 'Confirmada',
    PAID: 'Paga',
    CANCELLED: 'Cancelada',
    REFUNDED: 'Reembolsada',
  };
  return labels[status] || status;
}

export function SalesListPage() {
  const [state, setState] = useState<LoadState<Sale[]>>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    listSales()
      .then((sales) => {
        setState({ status: 'success', data: sales });
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar as vendas.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const renderContent = () => {
    if (state.status === 'loading') {
      return <LoadingState label="Carregando vendas…" />;
    }

    if (state.status === 'error') {
      return <ErrorState description={state.message} onRetry={load} />;
    }

    const sales = state.data || [];
    if (sales.length === 0) {
      return (
        <EmptyState
          title="Nenhuma venda encontrada"
          description="Quando houver vendas, elas aparecerão aqui."
        />
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-190 text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-4 font-medium text-slate-950">{sale.customerName || sale.customerId}</td>
                <td className="px-4 py-4 text-slate-600">{formatDateBR(sale.createdAt)}</td>
                <td className="px-4 py-4 font-semibold text-slate-950">{formatBRL(sale.total)}</td>
                <td className="px-4 py-4">
                  <StatusBadge tone={saleStatusTone(sale.status)}>
                    {saleStatusLabel(sale.status)}
                  </StatusBadge>
                </td>
                <td className="px-4 py-4 text-right">
                  <Link
                    to={`/sales/${sale.id}`}
                    className="inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageIntro
        title="Vendas realizadas"
        description="Histórico de todas as vendas fechadas, pagamentos e comissões."
      />
      <JourneyRail active="Sale" />
      <Card>
        <CardHeader>
          <CardTitle>Vendas</CardTitle>
        </CardHeader>
        <CardContent>{renderContent()}</CardContent>
      </Card>
    </div>
  );
}

interface SaleDetail {
  sale: Sale;
  story: SaleFinancialStory | null;
}

export function SaleSummaryPage() {
  const { id } = useParams();
  const [state, setState] = useState<LoadState<SaleDetail>>({ status: 'loading' });

  const load = useCallback(() => {
    if (!id) return;
    setState({ status: 'loading' });
    Promise.all([getSale(id), getSaleFinancialStory(id).catch(() => null)])
      .then(([sale, story]) => {
        setState({ status: 'success', data: { sale, story } });
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.code === 'NOT_FOUND') {
          setState({ status: 'success', data: null });
          return;
        }
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar a venda.';
        setState({ status: 'error', message });
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!id) {
    return <Navigate to="/sales" replace />;
  }

  if (state.status === 'loading') {
    return <LoadingState label="Carregando venda…" />;
  }

  if (state.status === 'error') {
    return (
      <div className="space-y-6">
        <PageIntro
          title="Resumo de venda"
          description="Detalhes completos da venda, faturamento, margens e status de pagamento."
        />
        <JourneyRail active="Sale" />
        <ErrorState description={state.message} onRetry={load} />
      </div>
    );
  }

  if (!state.data) {
    return (
      <div className="space-y-6">
        <PageIntro
          title="Resumo de venda"
          description="Detalhes completos da venda, faturamento, margens e status de pagamento."
        />
        <JourneyRail active="Sale" />
        <EmptyState
          title="Venda não encontrada"
          description="A venda que você está procurando não existe."
        />
      </div>
    );
  }

  const { sale, story } = state.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageIntro
          title={`Venda ${sale.customerName || sale.customerId}`}
          description="Detalhes completos da venda, faturamento, margens e status de pagamento."
        />
        <div className="flex flex-wrap gap-2">
          <Link to={`/customers/${sale.customerId}`}>
            <Button size="sm" variant="outline">Abrir cliente</Button>
          </Link>
          {sale.tripId && (
            <Link to={`/trips/${sale.tripId}`}>
              <Button size="sm" variant="outline">Abrir viagem</Button>
            </Link>
          )}
          <Link to={`/financial/sales/${sale.id}/story`}>
            <Button size="sm" variant="outline">Historia financeira</Button>
          </Link>
        </div>
      </div>
      <JourneyRail active="Sale" />

      <Card>
        <CardHeader>
          <CardTitle>Informacoes da venda</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <Field label="Data da venda" value={formatDateBR(sale.createdAt)} />
          <Field label="Cliente" value={sale.customerName || sale.customerId} />
          <Field label="Vendedor" value={sale.salespersonName || '—'} />
          <Field label="Viagem" value={sale.tripName || '—'} />
          <Field label="Status" value={saleStatusLabel(sale.status)} />
          <Field label="Valor bruto" value={formatBRL(sale.amount)} />
          <Field label="Desconto" value={formatBRL(sale.discount)} />
          <Field label="Total" value={formatBRL(sale.total)} />
          {sale.notes && <Field label="Observacoes" value={sale.notes} />}
        </CardContent>
      </Card>

      {story ? (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <Metric label="Venda bruta" value={formatBRL(story.grossSale)} />
            <Metric label="Recebido" value={formatBRL(story.received)} />
            <Metric label="A receber" value={formatBRL(story.remainingReceivable)} />
            <Metric label="Margem liquida" value={formatBRL(story.margin.netMargin)} />
          </section>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Compromissos com fornecedores</CardTitle>
              <Link to="/financial/payables">
                <Button size="sm" variant="outline">Ver contas a pagar</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {story.supplierPayables.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum compromisso com fornecedores para esta venda.</p>
              ) : (
                story.supplierPayables.map((item) => (
                  <Row
                    key={`${item.description}-${item.dueAt}`}
                    left={item.description}
                    middle={formatDateBR(item.dueAt, { assumeDateOnly: true })}
                    right={formatBRL(item.amount)}
                  />
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Parcelas do cliente</CardTitle>
              <Link to="/financial/receivables">
                <Button size="sm" variant="outline">Ver contas a receber</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {story.installmentSchedule.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma parcela registrada para esta venda.</p>
              ) : (
                story.installmentSchedule.map((item) => (
                  <Row
                    key={`${item.description}-${item.dueDate}`}
                    left={item.description}
                    middle={formatDateBR(item.dueDate, { assumeDateOnly: true })}
                    right={formatBRL(item.amount)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">
              Não foi possível carregar o resumo financeiro detalhado desta venda.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Row({ left, middle, right }: { left: string; middle: string; right: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-b border-slate-100 py-3 text-sm last:border-0 md:grid-cols-[1fr_220px_auto] md:items-center">
      <span className="min-w-0 text-slate-900">{left}</span>
      <span className="text-slate-500 md:text-center">{middle}</span>
      <span className="col-span-2 text-slate-900 md:col-span-1 md:text-right">{right}</span>
    </div>
  );
}
