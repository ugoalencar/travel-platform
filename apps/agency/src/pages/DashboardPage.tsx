import { Users, Plane, FileText, DollarSign } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { StatCard } from '../components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { StatusBadge } from '../components/ui/status-badge';

export function DashboardPage() {
  return (
    <div>
      <PageHeader title="Dashboard" description="Visão geral da agência." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Clientes ativos" value="128" delta="+4 este mês" deltaTone="positive" icon={<Users className="h-4 w-4" />} />
        <StatCard label="Viagens em andamento" value="16" delta="2 saindo hoje" deltaTone="neutral" icon={<Plane className="h-4 w-4" />} />
        <StatCard label="Propostas abertas" value="9" delta="-1 esta semana" deltaTone="negative" icon={<FileText className="h-4 w-4" />} />
        <StatCard label="Vendas do mês" value="R$ 184.200" delta="+12%" deltaTone="positive" icon={<DollarSign className="h-4 w-4" />} />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Próximas saídas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {[
              { name: 'Bariloche — Grupo Silva', status: 'Confirmada' },
              { name: 'Paris — Família Rocha', status: 'Aguardando pagamento' },
              { name: 'Fernando de Noronha — Casal Lima', status: 'Confirmada' },
            ].map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{item.name}</span>
                <StatusBadge tone={item.status === 'Confirmada' ? 'positive' : 'attention'}>
                  {item.status}
                </StatusBadge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Atividade recente</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-slate-600">
            <p>Proposta enviada para Cliente Ana Souza.</p>
            <p>Reserva confirmada para Viagem #4821.</p>
            <p>Nova oferta publicada: Caribe All Inclusive.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
