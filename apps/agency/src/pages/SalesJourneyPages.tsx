import {
  CalendarDays,
  CheckCircle2,
  Copy,
  Edit3,
  Eye,
  FileText,
  Hotel,
  Plane,
  Send,
  Sparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { StatusBadge, type StatusTone } from '../components/ui/status-badge';
import { Textarea } from '../components/ui/textarea';
import { formatBRL } from '../lib/formatCurrency';

type StepKey = 'Wish' | 'Proposal' | 'Booking' | 'Sale';

interface JourneyProposal {
  id: string;
  title: string;
  customer: string;
  destination: string;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED';
  expiration: string;
  dates: string;
  travelers: string;
  wishTitle: string;
  tripSummary: string;
  heroImage: string;
  hotel: {
    name: string;
    room: string;
    nights: string;
  };
  transport: {
    name: string;
    route: string;
    schedule: string;
  };
  services: string[];
  activities: string[];
  pricing: {
    proposedPrice: number;
    discount: number;
    total: number;
    fees: number;
  };
  bookingId: string;
  saleId: string;
  presentationOnly: {
    internalCost: number;
    margin: number;
    paymentStatus: 'Parcial' | 'Pago' | 'Pendente';
    supplier: string;
    confirmationStatus: string;
    documents: string[];
    internalNotes: string;
  };
}

const journeyProposals: JourneyProposal[] = [
  {
    id: 'prop-001',
    title: 'Proposta Portugal em família',
    customer: 'Lucas Martins',
    destination: 'Lisboa + Porto, Portugal',
    status: 'ACCEPTED',
    expiration: '15/09/2026',
    dates: '15/10 a 28/10/2026',
    travelers: '4 viajantes (2 adultos, 2 crianças)',
    wishTitle: 'Família em Portugal',
    tripSummary:
      'Roteiro cultural por Portugal: Lisboa, Sintra e Porto, com degustação de vinhos no Vale do Douro e experiências gastronômicas pensadas para toda a família.',
    heroImage:
      'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1600&q=80',
    hotel: {
      name: 'Lisboa: Hotel Alfama Rio · Porto: Hotel Ribeira Collection',
      room: 'Duas suítes família com café da manhã',
      nights: '13 noites',
    },
    transport: {
      name: 'Aéreo + trem Alfa Pendular',
      route: 'São Paulo -> Lisboa -> Porto -> Lisboa',
      schedule: 'Voo direto LATAM ida/volta, traslados privativos e trem Lisboa-Porto',
    },
    services: ['Seguro viagem família', 'Concierge local', 'Transfer aeroporto', 'Suporte 24h'],
    activities: ['Degustação de vinhos no Vale do Douro', 'Palácio da Pena em Sintra', 'Tour gastronômico no Porto'],
    pricing: {
      proposedPrice: 38500,
      discount: 3500,
      total: 35000,
      fees: 1200,
    },
    bookingId: 'bk-001',
    saleId: 'sale-001',
    presentationOnly: {
      internalCost: 27200,
      margin: 7800,
      paymentStatus: 'Pago',
      supplier: 'Douro Ground Partners',
      confirmationStatus: 'Hotéis e voos confirmados',
      documents: ['Passaportes validados', 'Seguro viagem contratado', 'Vouchers de hotel emitidos'],
      internalNotes: 'Nota interna: cliente VIP, priorizar upgrades quando disponíveis.',
    },
  },
];

const primaryProposal = journeyProposals[0];

function requirePrimaryProposal(): JourneyProposal {
  if (!primaryProposal) {
    throw new Error('UI-03 proposal fixture is missing.');
  }
  return primaryProposal;
}

function findProposal(id: string | undefined): JourneyProposal | undefined {
  return journeyProposals.find((proposal) => proposal.id === id);
}

function statusTone(status: JourneyProposal['status']): StatusTone {
  if (status === 'ACCEPTED') return 'positive';
  if (status === 'SENT') return 'neutral';
  return 'attention';
}

function statusLabel(status: JourneyProposal['status']): string {
  const labels: Record<JourneyProposal['status'], string> = {
    ACCEPTED: 'Aceita',
    DRAFT: 'Rascunho',
    SENT: 'Enviada',
  };
  return labels[status];
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
          <Link
            to="/proposals/prop-001/edit"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <Edit3 className="h-4 w-4" />
            Montar proposta
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Wish</th>
                  <th className="px-4 py-3">Destino</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {journeyProposals.map((proposal) => (
                  <tr key={proposal.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-4 font-medium text-slate-950">{proposal.customer}</td>
                    <td className="px-4 py-4 text-slate-600">{proposal.wishTitle}</td>
                    <td className="px-4 py-4 text-slate-600">{proposal.destination}</td>
                    <td className="px-4 py-4 font-semibold text-slate-950">
                      {formatBRL(proposal.pricing.total)}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge tone={statusTone(proposal.status)}>
                        {statusLabel(proposal.status)}
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
        </CardContent>
      </Card>
    </div>
  );
}

export function ProposalDetailPage() {
  const proposal = findProposal(useParams().id);
  if (!proposal) return <Navigate to="/proposals" replace />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PageIntro title={proposal.title} description={proposal.tripSummary} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline">
            <Edit3 className="h-4 w-4" />
            Editar
          </Button>
          <Button variant="outline">
            <Copy className="h-4 w-4" />
            Duplicar
          </Button>
          <Link
            to={`/proposals/${proposal.id}/preview`}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <Eye className="h-4 w-4" />
            Preview
          </Link>
          <Button variant="outline">
            <Send className="h-4 w-4" />
            Enviar
          </Button>
          <Button>
            <CheckCircle2 className="h-4 w-4" />
            Converter
          </Button>
        </div>
      </div>
      <JourneyRail active="Proposal" />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Composicao da viagem</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <Field label="Cliente" value={proposal.customer} />
            <Field label="Destino" value={proposal.destination} />
            <Field label="Datas" value={proposal.dates} />
            <Field label="Viajantes" value={proposal.travelers} />
            <Field label="Hotel" value={`${proposal.hotel.name} · ${proposal.hotel.nights}`} />
            <Field label="Flight/transport" value={proposal.transport.route} />
            <Field label="Status" value={statusLabel(proposal.status)} />
            <Field label="Expiracao" value={proposal.expiration} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <Field label="Preco proposto" value={formatBRL(proposal.pricing.proposedPrice)} />
              <Field label="Desconto" value={formatBRL(proposal.pricing.discount)} />
              <Field label="Markup/fees" value={formatBRL(proposal.pricing.fees)} />
              <Field label="Total" value={formatBRL(proposal.pricing.total)} />
            </dl>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChecklistCard title="Servicos" items={proposal.services} />
        <ChecklistCard title="Experiencias" items={proposal.activities} />
      </div>
    </div>
  );
}

export function ProposalBuilderPage() {
  const proposal = findProposal(useParams().id) ?? requirePrimaryProposal();

  return (
    <div className="space-y-6">
      <PageIntro
        title="Builder de proposta"
        description="Editor visual de apresentacao com dados reais do dominio e metadados mockados apenas para composicao."
      />
      <JourneyRail active="Proposal" />
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Dados comerciais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <LabelledInput label="Cliente" value={proposal.customer} />
            <LabelledInput label="Destino" value={proposal.destination} />
            <LabelledInput label="Periodo" value={proposal.dates} />
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Narrativa
              </span>
              <Textarea value={proposal.tripSummary} readOnly />
            </label>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Servicos selecionados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ChecklistCard title="Hotel e transporte" items={[proposal.hotel.name, proposal.transport.name]} />
            <div className="rounded-md border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-950">Resumo de preco</h3>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {formatBRL(proposal.pricing.total)}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Total calculado a partir de preco proposto e desconto.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function BookingListPage() {
  const proposal = requirePrimaryProposal();

  return (
    <div className="space-y-6">
      <PageIntro
        title="Reservas"
        description="Lista operacional para acompanhar confirmacoes, fornecedores, passageiros e documentos."
      />
      <JourneyRail active="Booking" />
      <Card>
        <CardContent className="p-0">
          <Link
            to={`/bookings/${proposal.bookingId}`}
            className="grid gap-3 p-4 transition-colors hover:bg-slate-50 md:grid-cols-[1fr_1fr_auto]"
          >
            <div>
              <p className="font-semibold text-slate-950">Reserva {proposal.bookingId}</p>
              <p className="text-sm text-slate-500">{proposal.customer}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">{proposal.destination}</p>
              <p className="text-sm text-slate-500">{proposal.dates}</p>
            </div>
            <StatusBadge tone="attention">{proposal.presentationOnly.paymentStatus}</StatusBadge>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

export function BookingDetailPage() {
  const proposal = requirePrimaryProposal();

  return (
    <div className="space-y-6">
      <PageIntro
        title="Reserva operacional"
        description="Visao de staff para confirmar servicos e documentos sem levar notas internas para telas do viajante."
      />
      <JourneyRail active="Booking" />
      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Confirmacoes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <Field label="Cliente" value={proposal.customer} />
            <Field label="Viajantes" value={proposal.travelers} />
            <Field label="Fornecedor" value={proposal.presentationOnly.supplier} />
            <Field label="Confirmacao" value={proposal.presentationOnly.confirmationStatus} />
            <Field label="Pagamento" value={proposal.presentationOnly.paymentStatus} />
            <Field label="Datas" value={proposal.dates} />
          </CardContent>
        </Card>
        <ChecklistCard title="Documentos" items={proposal.presentationOnly.documents} />
      </div>
    </div>
  );
}

export function SalesListPage() {
  const proposal = requirePrimaryProposal();

  return (
    <div className="space-y-6">
      <PageIntro
        title="Vendas"
        description="Resumo executivo das vendas originadas por proposta e reserva."
      />
      <JourneyRail active="Sale" />
      <Card>
        <CardContent>
          <Link to={`/sales/${proposal.saleId}`} className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-950">Venda {proposal.saleId}</p>
              <p className="text-sm text-slate-500">{proposal.customer} · Reserva {proposal.bookingId}</p>
            </div>
            <p className="text-lg font-semibold text-slate-950">{formatBRL(proposal.pricing.total)}</p>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

export function SaleSummaryPage() {
  const proposal = requirePrimaryProposal();
  const gross = proposal.pricing.proposedPrice;
  const cost = proposal.presentationOnly.internalCost;
  const margin = gross - proposal.pricing.discount - cost;

  return (
    <div className="space-y-6">
      <PageIntro
        title="Resumo comercial"
        description="Visao interna para apresentacao gerencial, usando campos existentes de Sale e metadados mockados para custo/pagamentos."
      />
      <JourneyRail active="Sale" />
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Valor bruto" value={formatBRL(gross)} />
        <Metric label="Custo" value={formatBRL(cost)} />
        <Metric label="Margem" value={formatBRL(margin)} />
        <Metric label="Pagamentos" value={proposal.presentationOnly.paymentStatus} />
      </div>
      <Card>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <Field label="Cliente" value={proposal.customer} />
          <Field label="Status" value="Confirmada" />
          <Field label="Reserva relacionada" value={`Reserva ${proposal.bookingId}`} />
          <Field label="Proposta" value={proposal.title} />
        </CardContent>
      </Card>
    </div>
  );
}

export function ProposalPreviewPage() {
  const proposal = findProposal(useParams().id);
  if (!proposal) return <Navigate to="/proposals" replace />;

  return (
    <div className="-m-6 min-h-screen bg-stone-50 text-slate-950">
      <section
        className="relative min-h-[440px] overflow-hidden bg-slate-900 px-6 py-8 text-white md:px-10"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(15,23,42,0.72), rgba(15,23,42,0.18)), url(${proposal.heroImage})`,
          backgroundPosition: 'center',
          backgroundSize: 'cover',
        }}
      >
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-100">
            Horizonte Viagens
          </p>
          <h1 className="mt-8 text-5xl font-semibold tracking-tight md:text-7xl">
            Portugal em família
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-100">{proposal.tripSummary}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Badge variant="dark">{proposal.dates}</Badge>
            <Badge variant="dark">{proposal.travelers}</Badge>
            <Badge variant="dark">Proposta valida ate {proposal.expiration}</Badge>
          </div>
        </div>
      </section>
      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8 md:px-10">
        <div className="grid gap-6 lg:grid-cols-[1fr_0.72fr]">
          <Card>
            <CardHeader>
              <CardTitle>Seu roteiro</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <PreviewTile icon={<CalendarDays className="h-5 w-5" />} title="Contexto" value={proposal.dates} />
              <PreviewTile icon={<Hotel className="h-5 w-5" />} title="Hotel" value={proposal.hotel.name} />
              <PreviewTile icon={<Plane className="h-5 w-5" />} title="Transporte" value={proposal.transport.route} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Investimento</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-semibold tracking-tight">{formatBRL(proposal.pricing.total)}</p>
              <p className="mt-2 text-sm text-slate-500">
                Para {proposal.travelers}, com hospedagem, transporte e experiencias selecionadas.
              </p>
              <Button className="mt-5 w-full" size="mobile-lg">
                Confirmar interesse
              </Button>
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <PreviewSection title="Hoteis" icon={<Hotel className="h-5 w-5" />}>
            <p className="text-sm font-semibold text-slate-950">{proposal.hotel.name}</p>
            <p className="mt-1 text-sm text-slate-600">
              {proposal.hotel.room} · {proposal.hotel.nights}
            </p>
          </PreviewSection>
          <PreviewSection title="Transportes" icon={<Plane className="h-5 w-5" />}>
            <p className="text-sm font-semibold text-slate-950">{proposal.transport.name}</p>
            <p className="mt-1 text-sm text-slate-600">{proposal.transport.schedule}</p>
          </PreviewSection>
          <PreviewSection title="Experiencias" icon={<Sparkles className="h-5 w-5" />}>
            <ul className="space-y-2 text-sm text-slate-600">
              {proposal.activities.map((activity) => (
                <li key={activity}>• {activity}</li>
              ))}
            </ul>
          </PreviewSection>
          <PreviewSection title="Incluso" icon={<FileText className="h-5 w-5" />}>
            <ul className="space-y-2 text-sm text-slate-600">
              {proposal.services.map((service) => (
                <li key={service}>• {service}</li>
              ))}
            </ul>
          </PreviewSection>
        </div>
      </main>
    </div>
  );
}

function ChecklistCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function LabelledInput({ label, value }: { label: string; value: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <Input value={value} readOnly aria-label={label} />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      </CardContent>
    </Card>
  );
}

function PreviewTile({
  icon,
  title,
  value,
}: {
  icon: ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="text-cyan-700">{icon}</div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function PreviewSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <span className="text-cyan-700">{icon}</span>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
