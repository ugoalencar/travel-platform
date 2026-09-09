import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Globe2,
  Heart,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  ShieldCheck,
  Ticket,
  UserRound,
} from 'lucide-react';
import {
  listBookings,
  listProposals,
  listReceivables,
  listSales,
  listTrips,
  listWishes,
} from '../../lib/api';
import {
  listInteractions,
  listOpportunities,
  listPipelines,
  listStages,
  listTasks,
} from '../../lib/commercialApi';
import type { Booking } from '../../types/booking';
import type { Customer } from '../../types/customer';
import type { Receivable } from '../../types/financial';
import type { Proposal } from '../../types/proposal';
import type { Sale } from '../../types/sale';
import type { Trip } from '../../types/trip';
import type { Wish } from '../../types/wish';
import {
  type CommercialOpportunity,
  type CommercialTask,
  type CustomerInteraction,
  type PipelineStageColor,
} from '../../types/commercial';

interface Customer360Data {
  wishes: Wish[];
  proposals: Proposal[];
  sales: Sale[];
  bookings: Booking[];
  receivables: Receivable[] | null;
  trips: Trip[];
  opportunities: CommercialOpportunity[];
  interactions: CustomerInteraction[];
  tasks: CommercialTask[];
  pipelineNames: Record<string, string>;
  stageNames: Record<string, string>;
  stageColors: Record<string, PipelineStageColor>;
}

interface Customer360Props {
  customer: Customer;
  onBack: () => void;
  onEdit: () => void;
}

const TABS = [
  'Dados pessoais',
  'Enderecos',
  'Dependentes',
  'Documentos',
  'Preferencias',
  'Historico',
  'Financeiro',
] as const;

export function Customer360({ customer, onBack, onEdit }: Customer360Props) {
  const [data, setData] = useState<Customer360Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      listWishes(),
      listProposals(),
      listSales(),
      listBookings(),
      listReceivables().catch(() => null),
      listTrips(),
      listOpportunities({ customerId: customer.id }),
      listInteractions(customer.id),
      listTasks({ customerId: customer.id }),
      listPipelines(),
    ])
      .then(
        async ([
          wishes,
          proposals,
          sales,
          bookings,
          receivables,
          trips,
          opportunitiesResult,
          interactionsResult,
          tasksResult,
          pipelines,
        ]) => {
          if (cancelled) return;

          const pipelineNames: Record<string, string> = {};
          for (const pipeline of pipelines) pipelineNames[pipeline.id] = pipeline.name;

          const relevantPipelineIds = Array.from(
            new Set(opportunitiesResult.opportunities.map((opportunity) => opportunity.pipelineId)),
          );
          const stageLists = await Promise.all(
            relevantPipelineIds.map((id) => listStages(id).catch(() => [])),
          );
          const stageNames: Record<string, string> = {};
          const stageColors: Record<string, PipelineStageColor> = {};
          for (const stages of stageLists) {
            for (const stage of stages) {
              stageNames[stage.id] = stage.name;
              stageColors[stage.id] = stage.colorKey;
            }
          }

          if (cancelled) return;
          setData({
            wishes: wishes.filter((wish) => wish.customerId === customer.id),
            proposals: proposals.filter((proposal) => proposal.customerId === customer.id),
            sales: sales.filter((sale) => sale.customerId === customer.id),
            bookings: bookings.filter((booking) => booking.bookerCustomerId === customer.id),
            receivables: receivables?.filter((receivable) => receivable.customerId === customer.id) ?? null,
            trips: trips.filter((trip) => trip.customerId === customer.id),
            opportunities: opportunitiesResult.opportunities,
            interactions: interactionsResult.interactions,
            tasks: tasksResult.tasks,
            pipelineNames,
            stageNames,
            stageColors,
          });
        },
      )
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar o histórico do cliente.');
      });

    return () => {
      cancelled = true;
    };
  }, [customer]);

  const summary = useMemo(() => (data ? buildSummary(data) : null), [data]);

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Detalhes do cliente</h1>
      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="relative border-b border-blue-100 bg-[linear-gradient(135deg,#eff6ff_0%,#e0f2fe_48%,#dbeafe_100%)] px-5 py-5 sm:px-6">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_70%_20%,rgba(37,99,235,.22),transparent_34%),linear-gradient(135deg,rgba(14,165,233,.18),rgba(255,255,255,0))] lg:block" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <button
                type="button"
                onClick={onBack}
                className="mb-4 text-sm font-semibold text-blue-700 hover:text-blue-800"
              >
                Voltar
              </button>
              <h1 className="text-3xl font-black tracking-tight text-slate-950">Cliente 360</h1>
              <p className="mt-1 text-sm text-blue-900">
                Visão completa do cliente, histórico e relacionamento em um só lugar.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton onClick={onEdit} icon={<FileText size={16} />} label="Editar cadastro" />
              <ActionButton icon={<UserRound size={16} />} label="Adicionar dependente" />
              <ActionButton icon={<ShieldCheck size={16} />} label="Enviar documento" />
              <ActionButton icon={<Heart size={16} />} label="Abrir desejo" />
              <ActionButton strong icon={<Plus size={16} />} label="Nova proposta" />
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[1.1fr_1.6fr]">
          <div className="flex gap-4">
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-blue-600 text-3xl font-black text-white shadow-lg shadow-blue-200">
                {initials(customer.name)}
              </div>
              <span className="absolute -bottom-2 -right-2 inline-flex h-9 w-9 items-center justify-center rounded-full border-4 border-white bg-blue-700 text-white">
                <UserRound size={16} />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-black tracking-tight text-slate-950">{customer.name}</h2>
                <StatusChip label={customer.status === 'ACTIVE' ? 'Cliente ativo' : customer.status} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Cliente desde {formatDate(customer.createdAt)} | Perfil comercial prioritario
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <MiniTag label="VIP" />
                <MiniTag label="Viagens internacionais" />
                <MiniTag label="Familia" />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <ContactItem icon={<Phone size={17} />} label="Telefone" value={customer.phone ? 'Cadastrado' : undefined} />
            <ContactItem icon={<MessageCircle size={17} />} label="WhatsApp" value={customer.phone ? 'Disponível' : undefined} />
            <ContactItem icon={<Mail size={17} />} label="E-mail" value={customer.email ? 'Cadastrado' : undefined} />
            <ContactItem icon={<FileText size={17} />} label="CPF" value={customer.cpf ? 'Validado' : undefined} />
            <ContactItem icon={<Globe2 size={17} />} label="Passaporte" value={customer.passport ? 'Validado' : undefined} />
            <ContactItem icon={<UserRound size={17} />} label="Agente responsavel" value="Carla Mendes" />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto border-t border-slate-100 px-5">
          {TABS.map((tab, index) => (
            <button
              key={tab}
              type="button"
              className={[
                'shrink-0 border-b-2 px-3 py-3 text-sm font-semibold transition',
                index === 0
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-900',
              ].join(' ')}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <Panel title="Dados pessoais" action="Editar">
        <dl>
          <InfoRow label="Nome completo" value="Titular" />
          <InfoRow label="E-mail" value={customer.email} />
          <InfoRow label="Telefone" value={customer.phone} />
          <InfoRow label="CPF" value={customer.cpf} />
          <InfoRow label="Passaporte" value={customer.passport} />
          <InfoRow label="Notas" value={customer.notes} />
        </dl>
      </Panel>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {!data && !error && <p className="text-sm text-slate-500">Carregando historico do cliente...</p>}

      {data && summary && (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Oportunidades" value={data.opportunities.length.toString()} tone="blue" />
              <Kpi label="Propostas" value={data.proposals.length.toString()} tone="teal" />
              <Kpi label="Reservas" value={data.bookings.length.toString()} tone="violet" />
              <Kpi label="A receber" value={summary.receivableTotal} tone="coral" />
            </div>

            <Panel title="Resumo">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryRow label="Próxima ação" value={summary.nextAction} />
                <SummaryRow label="Última interação" value={summary.lastInteraction} />
                <SummaryRow label="Próximo retorno" value={summary.nextReturn} />
                <SummaryRow label="Contexto atual" value={summary.currentContext} />
              </div>
            </Panel>

            <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
              <Panel title="Preferências" action="Editar">
                <div className="grid gap-3">
                  <MiniTag label="Viagens internacionais" />
                  <MiniTag label="Hotéis boutique" />
                  <MiniTag label="Roteiros em família" />
                  <MiniTag label="Atendimento por WhatsApp" />
                </div>
              </Panel>

              <div className="space-y-5">
                <Panel title="Enderecos" action="Adicionar endereco">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <AddressCard title="Endereco principal" value={addressSummary(customer.address)} />
                    <AddressCard title="Correspondencia" value="Mesmo endereco" />
                  </div>
                </Panel>

                <Panel title="Dependentes" action="Adicionar dependente">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <PersonCard name="Rafael Oliveira Silva" detail="Conjuge | documento validado" />
                    <PersonCard name="Lucas Oliveira Silva" detail="Filho | menor acompanhado" />
                  </div>
                </Panel>
              </div>
            </div>

            <Panel title="Documentos" action="Enviar documento">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DocumentCard title="Passaporte" value={customer.passport} status="Valido" />
                <DocumentCard title="CPF" value={customer.cpf} status="Valido" />
                <DocumentCard title="Comprovante" value="Residencia" status="Atualizado" />
                <DocumentCard title="Vacina" value="Carteira" status="Pendente" warning />
              </div>
            </Panel>

            <Panel title="Historico comercial">
              <div className="grid gap-3 lg:grid-cols-2">
                <CompactList title="Oportunidades" items={opportunityItems(data)} />
                <CompactList title="Propostas e vendas" items={salesItems(data)} />
                <CompactList title="Viagens" items={tripItems(data)} />
                <CompactList title="Tarefas" items={taskItems(data)} />
              </div>
            </Panel>
          </div>

          <aside className="space-y-5">
            <Panel title="Confronto OCR">
              <OcrRow label="Nome completo" value={customer.name} ok />
              <OcrRow label="CPF" value={customer.cpf ?? 'Não informado'} ok={Boolean(customer.cpf)} />
              <OcrRow label="Passaporte" value={customer.passport ?? 'Não informado'} ok={Boolean(customer.passport)} />
              <OcrRow label="Foto do documento" value="Revisão manual" />
            </Panel>

            <Panel title="Linha do tempo do cliente" action="Ver todos">
              <TimelineItem icon={<Ticket size={15} />} title="Ciclo comercial atual" meta="Status comercial" />
              <TimelineItem icon={<Clock3 size={15} />} title={summary.nextAction} meta="Ação sugerida" />
              <TimelineItem icon={<MessageCircle size={15} />} title={summary.lastInteraction} meta="Interação recente" />
              <TimelineItem icon={<CalendarDays size={15} />} title={`${data.trips.length} viagens no histórico`} meta="Relacionamento" />
            </Panel>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 rounded-xl bg-blue-600 p-2 text-white">
                  <CheckCircle2 size={18} />
                </span>
                <div>
                  <p className="font-bold text-blue-950">Cliente com potencial de recompra</p>
                  <p className="mt-1 text-sm text-blue-800">
                    Use o histórico e preferências para sugerir próxima viagem com contexto.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function buildSummary(data: Customer360Data) {
  const openTasks = data.tasks
    .filter((task) => !task.completedAt)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const lastInteraction = [...data.interactions].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  )[0];
  const currentSale = [...data.sales].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
  const currentProposal = [...data.proposals].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
  const receivableTotal = data.receivables?.reduce((sum, receivable) => sum + receivable.amount, 0) ?? 0;

  return {
    currentContext: currentSale
      ? `Venda ${currentSale.status}`
      : currentProposal
        ? `Proposta ${currentProposal.status}`
        : '—',
    nextAction: openTasks[0] ? `${openTasks[0].title} | ${formatDate(openTasks[0].dueAt)}` : '—',
    lastInteraction: lastInteraction
      ? `${lastInteraction.summary} | ${formatDate(lastInteraction.occurredAt)}`
      : '—',
    nextReturn: openTasks[0] ? formatDate(openTasks[0].dueAt) : '—',
    receivableTotal: formatCurrency(receivableTotal),
  };
}

function opportunityItems(data: Customer360Data): string[] {
  return data.opportunities.slice(0, 4).map((opportunity) => {
    const stage = data.stageNames[opportunity.stageId] ?? 'Etapa';
    return `${opportunity.destination ?? 'Destino em aberto'} | ${stage}`;
  });
}

function salesItems(data: Customer360Data): string[] {
  const proposalItems = data.proposals.slice(0, 2).map((proposal) => `Proposta | ${formatCurrency(proposal.total)}`);
  const saleItems = data.sales.slice(0, 2).map((sale) => `Venda | ${formatCurrency(sale.total)}`);
  return [...saleItems, ...proposalItems];
}

function tripItems(data: Customer360Data): string[] {
  return data.trips.slice(0, 4).map((trip) => `${trip.destination} | ${formatDate(trip.startDate)}`);
}

function taskItems(data: Customer360Data): string[] {
  return data.tasks.slice(0, 4).map((task) => `${task.title} | ${formatDate(task.dueAt)}`);
}

function ActionButton({
  icon,
  label,
  strong = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  strong?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold shadow-sm transition',
        strong
          ? 'bg-blue-600 text-white shadow-blue-600/20 hover:bg-blue-700'
          : 'border border-blue-100 bg-white text-blue-700 hover:bg-blue-50',
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  );
}

function ContactItem({ icon, label, value }: { icon: ReactNode; label: string; value?: string | undefined }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <span className="text-blue-600">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        <span className="block truncate text-sm font-semibold text-slate-800">{value || 'Nao informado'}</span>
      </span>
    </div>
  );
}

function StatusChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
      <CheckCircle2 size={13} />
      {label}
    </span>
  );
}

function MiniTag({ label }: { label: string }) {
  return <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{label}</span>;
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'teal' | 'violet' | 'coral' }) {
  const toneClasses = {
    blue: 'bg-blue-600 text-blue-700',
    teal: 'bg-teal-600 text-teal-700',
    violet: 'bg-violet-600 text-violet-700',
    coral: 'bg-orange-600 text-orange-700',
  };
  const [bg, text] = toneClasses[tone].split(' ');

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`mb-3 block h-1.5 w-10 rounded-full ${bg}`} />
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-black ${text}`}>{value}</p>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-black text-slate-950">{title}</h3>
        {action && <button className="text-sm font-bold text-blue-600">{action}</button>}
      </div>
      {children}
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | undefined }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-900">{value || '—'}</dd>
    </div>
  );
}

function AddressCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center gap-2 text-blue-700">
        <MapPin size={16} />
        <p className="font-bold text-slate-900">{title}</p>
      </div>
      <p className="text-sm text-slate-600">{value}</p>
    </div>
  );
}

function PersonCard({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-black text-blue-700">
        {initials(name)}
      </span>
      <span>
        <span className="block text-sm font-bold text-slate-900">{name}</span>
        <span className="block text-xs text-slate-500">{detail}</span>
      </span>
    </div>
  );
}

function DocumentCard({
  title,
  value,
  status,
  warning = false,
}: {
  title: string;
  value?: string | undefined;
  status: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-3 flex h-20 items-center justify-center rounded-lg bg-white text-blue-600 ring-1 ring-slate-200">
        <FileText size={28} />
      </div>
      <p className="text-sm font-bold text-slate-900">{title}</p>
      <p className="mt-0.5 truncate text-xs text-slate-500">{value || 'Sem numero'}</p>
      <span
        className={[
          'mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-bold',
          warning ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
        ].join(' ')}
      >
        {status}
      </span>
    </div>
  );
}

function CompactList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <h4 className="mb-2 text-sm font-black text-slate-900">{title}</h4>
      <div className="space-y-2">
        {items.length > 0 ? (
          items.map((item) => (
            <p key={item} className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-100">
              {item}
            </p>
          ))
        ) : (
          <p className="text-sm text-slate-500">Nada por aqui.</p>
        )}
      </div>
    </div>
  );
}

function OcrRow({ label, value, ok = false }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0">
      <span>
        <span className="block text-sm font-bold text-slate-900">{label}</span>
        <span className={ok ? 'text-xs font-semibold text-emerald-600' : 'text-xs font-semibold text-amber-600'}>
          {ok ? 'Conferencia 100%' : 'Pendente'}
        </span>
      </span>
      <span className="max-w-[12rem] truncate text-right text-sm font-semibold text-slate-700">{value}</span>
    </div>
  );
}

function TimelineItem({ icon, title, meta }: { icon: ReactNode; title: string; meta: string }) {
  return (
    <div className="flex gap-3 border-b border-slate-100 py-3 last:border-0">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-bold text-slate-900">{title}</span>
        <span className="text-xs text-slate-500">{meta}</span>
      </span>
    </div>
  );
}

function addressSummary(address?: Record<string, unknown>): string {
  if (!address || Object.keys(address).length === 0) return '—';
  const values = Object.values(address)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .slice(0, 4);
  return values.length > 0 ? values.join(', ') : 'Endereço cadastrado';
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value?: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR');
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
