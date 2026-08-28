import type { ReactNode } from 'react';
import { Bell, Building2, Plug, Sliders, Users } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { StatusBadge } from '../components/ui/status-badge';

// Visual-only settings shell for the prototype. No security/auth controls
// live here on purpose (SEC-* work owns MFA/roles/permissions elsewhere).
const team = [
  { name: 'Mariana Costa', role: 'ADMIN', email: 'mariana.costa@horizonteviagens.com.br' },
  { name: 'Beatriz Fernandes', role: 'Consultora comercial', email: 'beatriz@horizonteviagens.com.br' },
  { name: 'João Pedro Lima', role: 'Consultor comercial', email: 'joao.lima@horizonteviagens.com.br' },
];

const integrations = [
  { name: 'WhatsApp Business', status: 'Conectado' as const },
  { name: 'Gateway de pagamento', status: 'Conectado' as const },
  { name: 'E-mail marketing', status: 'Não conectado' as const },
];

function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3">
        <span className="mt-0.5 rounded-md bg-slate-100 p-2 text-slate-600">{icon}</span>
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Preferências e informações gerais da agência." />

      <SettingsSection
        icon={<Building2 className="h-4 w-4" />}
        title="Agência"
        description="Dados de identificação exibidos em propostas e no portal do cliente."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nome da agência</span>
            <Input defaultValue="Horizonte Viagens" readOnly />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">E-mail de contato</span>
            <Input defaultValue="contato@horizonteviagens.com.br" readOnly />
          </label>
        </div>
      </SettingsSection>

      <SettingsSection
        icon={<Users className="h-4 w-4" />}
        title="Equipe & Permissões"
        description="Quem tem acesso à operação da agência e seu nível de acesso."
      >
        <div className="divide-y divide-slate-100">
          {team.map((member) => (
            <div key={member.email} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-slate-900">{member.name}</p>
                <p className="text-xs text-slate-500">{member.email}</p>
              </div>
              <Badge variant={member.role === 'ADMIN' ? 'dark' : 'outline'}>{member.role}</Badge>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="mt-4">
          Convidar membro
        </Button>
      </SettingsSection>

      <SettingsSection
        icon={<Sliders className="h-4 w-4" />}
        title="Preferências comerciais"
        description="Regras padrão aplicadas a novas propostas."
      >
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox defaultChecked readOnly />
            Aplicar desconto automático para clientes VIP
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox defaultChecked readOnly />
            Exigir aprovação de gerente para descontos acima de 15%
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox readOnly />
            Enviar propostas automaticamente após aceite do orçamento
          </label>
        </div>
      </SettingsSection>

      <SettingsSection
        icon={<Bell className="h-4 w-4" />}
        title="Notificações"
        description="Alertas enviados à equipe comercial."
      >
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox defaultChecked readOnly />
            Proposta prestes a expirar
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox defaultChecked readOnly />
            Nova reserva confirmada
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox readOnly />
            Resumo semanal por e-mail
          </label>
        </div>
      </SettingsSection>

      <SettingsSection
        icon={<Plug className="h-4 w-4" />}
        title="Integrações"
        description="Conexões com outras ferramentas usadas pela agência."
      >
        <div className="divide-y divide-slate-100">
          {integrations.map((integration) => (
            <div key={integration.name} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <span className="text-sm font-medium text-slate-900">{integration.name}</span>
              <StatusBadge tone={integration.status === 'Conectado' ? 'positive' : 'inactive'}>
                {integration.status}
              </StatusBadge>
            </div>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}
