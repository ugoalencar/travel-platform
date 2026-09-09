import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import {
  ApiError,
  createCommissionPlan,
  listCommissionPlans,
  updateCommissionPlan,
  type CommissionCalculationType,
  type CommissionPlan,
} from '../lib/api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; plans: CommissionPlan[] };

const CALCULATION_TYPES: Array<{ value: CommissionCalculationType; label: string; supported: boolean }> = [
  { value: 'PERCENT_SALE', label: '% sobre a Venda', supported: true },
  { value: 'PERCENT_MARGIN', label: '% sobre a Margem', supported: true },
  { value: 'FIXED', label: 'Valor Fixo', supported: true },
  { value: 'PRODUCT', label: 'Por Produto (regras avançadas)', supported: false },
  { value: 'DESTINATION', label: 'Por Destino (regras avançadas)', supported: false },
  { value: 'TIERED_TARGET', label: 'Por Meta Escalonada (regras avançadas)', supported: false },
];

const TYPE_LABELS: Record<CommissionCalculationType, string> = Object.fromEntries(
  CALCULATION_TYPES.map((t) => [t.value, t.label]),
) as Record<CommissionCalculationType, string>;

export function CommissionPlansPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [calculationType, setCalculationType] = useState<CommissionCalculationType>('PERCENT_MARGIN');
  const [percentage, setPercentage] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [rulesText, setRulesText] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    listCommissionPlans(true)
      .then((plans) => setState({ status: 'success', plans }))
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar os planos de comissão.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isPercent = calculationType === 'PERCENT_SALE' || calculationType === 'PERCENT_MARGIN';
  const isFixed = calculationType === 'FIXED';
  const isAdvanced = !isPercent && !isFixed;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setFormError(null);

    let rules: Record<string, unknown> | undefined;
    if (isAdvanced && rulesText.trim()) {
      try {
        rules = JSON.parse(rulesText) as Record<string, unknown>;
      } catch {
        setFormError('O JSON de regras é inválido.');
        setSaving(false);
        return;
      }
    }

    createCommissionPlan({
      name: name.trim(),
      calculationType,
      percentage: isPercent && percentage ? Number(percentage) : undefined,
      fixedAmount: isFixed && fixedAmount ? Number(fixedAmount) : undefined,
      rules,
    })
      .then(() => {
        setName('');
        setPercentage('');
        setFixedAmount('');
        setRulesText('');
        setShowForm(false);
        load();
      })
      .catch((err: unknown) => {
        setFormError(err instanceof ApiError ? err.message : 'Não foi possível criar o plano de comissão.');
      })
      .finally(() => setSaving(false));
  };

  const handleToggleActive = (plan: CommissionPlan) => {
    setTogglingId(plan.id);
    void updateCommissionPlan(plan.id, { active: !plan.active })
      .then(() => load())
      .finally(() => setTogglingId(null));
  };

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Planos de Comissão" description="Configurar planos de comissão para a equipe." />
        <LoadingState label="Carregando planos de comissão…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planos de Comissão"
        description="Configurar planos de comissão para a equipe. Esta é a camada de configuração — o motor de cálculo automático (venda → comissão) chega em uma próxima etapa."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Planos de Comissão' }]}
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Planos de Comissão</CardTitle>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" />
            {showForm ? 'Cancelar' : 'Adicionar'}
          </Button>
        </CardHeader>
        {showForm ? (
          <CardContent className="border-b pb-4">
            <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="cp-name">Nome</label>
                <Input id="cp-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="cp-type">Tipo de Cálculo</label>
                <select
                  id="cp-type"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={calculationType}
                  onChange={(e) => setCalculationType(e.target.value as CommissionCalculationType)}
                >
                  {CALCULATION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}{t.supported ? '' : ' — apenas esquema, sem UI completa'}
                    </option>
                  ))}
                </select>
              </div>
              {isPercent ? (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="cp-percentage">Percentual (%)</label>
                  <Input
                    id="cp-percentage"
                    type="number"
                    step="0.01"
                    value={percentage}
                    onChange={(e) => setPercentage(e.target.value)}
                    required
                  />
                </div>
              ) : null}
              {isFixed ? (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="cp-fixed">Valor Fixo (R$)</label>
                  <Input
                    id="cp-fixed"
                    type="number"
                    step="0.01"
                    value={fixedAmount}
                    onChange={(e) => setFixedAmount(e.target.value)}
                    required
                  />
                </div>
              ) : null}
              {isAdvanced ? (
                <div className="flex w-full flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="cp-rules">
                    Regras (JSON livre — sem editor visual nesta etapa)
                  </label>
                  <textarea
                    id="cp-rules"
                    className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={rulesText}
                    onChange={(e) => setRulesText(e.target.value)}
                    placeholder='{"exemplo": "valor"}'
                  />
                </div>
              ) : null}
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </Button>
              {formError ? <p className="w-full text-sm text-destructive">{formError}</p> : null}
            </form>
          </CardContent>
        ) : null}
        <CardContent className="p-0">
          {state.plans.length === 0 ? (
            <EmptyState
              title="Nenhum plano de comissão registrado"
              description="Crie um novo plano de comissão para começar."
              action={<Button size="sm" onClick={() => setShowForm(true)}><Plus className="mr-2 h-4 w-4" />Adicionar</Button>}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell>{TYPE_LABELS[plan.calculationType]}</TableCell>
                    <TableCell>
                      {plan.percentage !== undefined ? `${plan.percentage}%` : null}
                      {plan.fixedAmount !== undefined ? `R$ ${plan.fixedAmount.toFixed(2)}` : null}
                      {plan.percentage === undefined && plan.fixedAmount === undefined ? '-' : null}
                    </TableCell>
                    <TableCell>{plan.active ? 'Ativo' : 'Inativo'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={togglingId === plan.id}
                        onClick={() => handleToggleActive(plan)}
                      >
                        {plan.active ? 'Desativar' : 'Ativar'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
