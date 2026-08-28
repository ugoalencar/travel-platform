import { StubPage } from './StubPage';
import type { StubRow } from './StubPage';

function makePage(title: string, description: string, breadcrumbLabel: string, rows: StubRow[]) {
  return function Page() {
    return (
      <StubPage title={title} description={description} breadcrumbLabel={breadcrumbLabel} rows={rows} />
    );
  };
}

export const CustomersPage = makePage('Clientes', 'Cadastro e histórico de clientes da agência.', 'Clientes', [
  { name: 'Ana Souza', status: 'Ativo', tone: 'positive', detail: '3 viagens realizadas' },
  { name: 'Carlos Lima', status: 'Prospect', tone: 'neutral', detail: 'Aguardando primeiro contato' },
  { name: 'Família Rocha', status: 'Inativo', tone: 'inactive', detail: 'Sem contato há 6 meses' },
]);

export const WishesPage = makePage('Desejos', 'Destinos e preferências registrados pelos clientes.', 'Desejos', [
  { name: 'Bariloche — inverno', status: 'Em análise', tone: 'neutral', detail: 'Ana Souza' },
  { name: 'Caribe — lua de mel', status: 'Convertido', tone: 'positive', detail: 'Casal Lima' },
]);

export const TripsPage = makePage('Viagens', 'Roteiros e viagens em andamento ou concluídas.', 'Viagens', [
  { name: 'Bariloche — Grupo Silva', status: 'Confirmada', tone: 'positive', detail: '15/09 a 22/09' },
  { name: 'Paris — Família Rocha', status: 'Pendente', tone: 'attention', detail: '02/10 a 12/10' },
]);

export const ProposalsPage = makePage('Propostas', 'Propostas comerciais enviadas aos clientes.', 'Propostas', [
  { name: 'Proposta #221 — Ana Souza', status: 'Enviada', tone: 'neutral', detail: 'R$ 12.400' },
  { name: 'Proposta #219 — Carlos Lima', status: 'Aceita', tone: 'positive', detail: 'R$ 8.900' },
  { name: 'Proposta #214 — Família Rocha', status: 'Expirada', tone: 'attention', detail: 'R$ 21.000' },
]);

export const BookingsPage = makePage('Reservas', 'Reservas confirmadas e pendentes.', 'Reservas', [
  { name: 'Reserva #4821', status: 'Confirmada', tone: 'positive', detail: 'Bariloche — Grupo Silva' },
  { name: 'Reserva #4809', status: 'Aguardando pagamento', tone: 'attention', detail: 'Paris — Família Rocha' },
]);

export const SalesPage = makePage('Vendas', 'Histórico de vendas e faturamento.', 'Vendas', [
  { name: 'Venda #3312', status: 'Paga', tone: 'positive', detail: 'R$ 12.400 — Ana Souza' },
  { name: 'Venda #3305', status: 'Pendente', tone: 'neutral', detail: 'R$ 8.900 — Carlos Lima' },
]);

export const OffersPage = makePage('Ofertas', 'Ofertas e pacotes publicados.', 'Ofertas', [
  { name: 'Caribe All Inclusive', status: 'Ativa', tone: 'positive', detail: 'Válida até 30/11' },
  { name: 'Inverno em Bariloche', status: 'Expirada', tone: 'attention', detail: 'Encerrada em 15/08' },
]);

export const FinancialPage = makePage('Financeiro', 'Contas a receber, a pagar e fluxo de caixa.', 'Financeiro', [
  { name: 'Recebível #991', status: 'Em aberto', tone: 'attention', detail: 'Vence em 05/09' },
  { name: 'Recebível #988', status: 'Pago', tone: 'positive', detail: 'Pago em 20/08' },
]);

export const ReportsPage = makePage('Relatórios', 'Relatórios gerenciais e de desempenho.', 'Relatórios', []);

export const SettingsPage = makePage('Configurações', 'Preferências e configurações da agência.', 'Configurações', []);
