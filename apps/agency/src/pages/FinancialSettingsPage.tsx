import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Tabs } from '../components/ui/tabs';
import { PaymentConditionsPage } from './PaymentConditionsPage';
import { CommissionReleasePage } from './CommissionReleasePage';
import { AgencyRevenuePage } from './AgencyRevenuePage';
import { CommissionRulesPage } from './CommissionRulesPage';
import { SaleCategoriesPage } from './SaleCategoriesPage';
import { CommissionPaymentPolicyTab } from './CommissionPaymentPolicyTab';

const tabs = [
  { value: 'conditions', label: 'Condições de pagamento' },
  { value: 'methods', label: 'Formas de pagamento' },
  { value: 'revenue', label: 'Receita da agência e lotes' },
  { value: 'commissions', label: 'Regras de comissão' },
  { value: 'commission-payments', label: 'Pagamento das comissões' },
  { value: 'release', label: 'Liberação e perfil financeiro' },
  { value: 'categories', label: 'Categorias de venda' },
];

export function FinancialSettingsPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const active = tabs.some(tab => tab.value === requested) ? requested! : 'conditions';
  return <div className="space-y-6">
    <PageHeader title="Configuração financeira" />
    <Tabs items={tabs} value={active} onValueChange={tab => setParams({ tab })} className="flex flex-wrap justify-start" />
    <div role="tabpanel" aria-label={tabs.find(tab => tab.value === active)!.label}>
      {active === 'conditions' && <PaymentConditionsPage />}
      {active === 'methods' && <CommissionReleasePage section="methods" />}
      {active === 'revenue' && <AgencyRevenuePage />}
      {active === 'commissions' && <CommissionRulesPage />}
      {active === 'commission-payments' && <CommissionPaymentPolicyTab />}
      {active === 'release' && <CommissionReleasePage section="profile" />}
      {active === 'categories' && <SaleCategoriesPage />}
    </div>
  </div>;
}
