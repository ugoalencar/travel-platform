import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs } from '../components/ui/tabs';
import { LoadingState } from '../components/ui/loading-state';
import { ErrorState } from '../components/ui/error-state';
import { EmptyState } from '../components/ui/empty-state';
import {
  ApiError,
  createEmployeeCommissionRule,
  getEmployeeById,
  getEmployeeCommissionsReport,
  listEmployeeCommissionRules,
  updateEmployeeCommissionRuleStatus,
  type Employee,
  type EmployeeCommissionBasis,
  type EmployeeCommissionCalculationType,
  type EmployeeCommissionProductType,
  type EmployeeCommissionReportRow,
  type EmployeeCommissionRule,
} from '../lib/api';

const TABS = [
  { value: 'perfil', label: 'Perfil' },
  { value: 'comissoes', label: 'Comissões' },
  { value: 'historico', label: 'Histórico' },
];

const PRODUCT_TYPES: Array<{ value: EmployeeCommissionProductType; label: string }> = [
  { value: 'AIR', label: 'Aéreo' },
  { value: 'EXCURSION', label: 'Excursão' },
  { value: 'LAND', label: 'Terrestre' },
  { value: 'INSURANCE', label: 'Seguro' },
  { value: 'PACKAGE', label: 'Pacote' },
  { value: 'HOTEL', label: 'Hotel' },
  { value: 'TRANSFER', label: 'Transfer' },
];

const BASES: Array<{ value: EmployeeCommissionBasis; label: string }> = [
  { value: 'PRODUCT_TOTAL', label: 'Valor do produto' },
  { value: 'PACKAGE_TOTAL', label: 'Valor total do pacote' },
  { value: 'PER_PASSENGER', label: '% por passageiro' },
  { value: 'PER_TICKET', label: '% por ticket' },
  { value: 'FIXED_PER_PASSENGER', label: 'Fixo por passageiro' },
  { value: 'FIXED_PER_TICKET', label: 'Fixo por ticket' },
  { value: 'FIXED_PER_SALE', label: 'Fixo por venda' },
];

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovada',
  PAYABLE: 'A pagar',
  PAID: 'Paga',
  CANCELLED: 'Cancelada',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  PAYABLE: 'bg-amber-100 text-amber-700',
  PAID: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; employee: Employee };

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [tab, setTab] = useState('perfil');

  const load = useCallback(() => {
    if (!id) return;
    setState({ status: 'loading' });
    getEmployeeById(id)
      .then((employee) => setState({ status: 'success', employee }))
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar o funcionário.';
        setState({ status: 'error', message });
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!id) return <ErrorState description="Funcionário não informado." />;
  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Funcionário" breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Funcionários', to: '/employees' }]} />
        <LoadingState label="Carregando funcionário…" />
      </div>
    );
  }
  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  const { employee } = state;

  return (
    <div className="space-y-6">
      <PageHeader
        title={employee.name}
        description={employee.roleTitle || 'Funcionário da agência'}
        breadcrumbs={[
          { label: 'Painel', to: '/' },
          { label: 'Funcionários', to: '/employees' },
          { label: employee.name },
        ]}
      />
      <Link to="/employees" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Voltar para Funcionários
      </Link>

      <Tabs items={TABS} value={tab} onValueChange={setTab} />

      {tab === 'perfil' && <PerfilTab employee={employee} />}
      {tab === 'comissoes' && <ComissoesTab employeeId={employee.id} />}
      {tab === 'historico' && <HistoricoTab employeeId={employee.id} />}
    </div>
  );
}

function PerfilTab({ employee }: { employee: Employee }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados do funcionário</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Nome" value={employee.name} />
        <Field label="Cargo" value={employee.roleTitle} />
        <Field label="Departamento" value={employee.department} />
        <Field label="E-mail" value={employee.email} />
        <Field label="Telefone" value={employee.phone} />
        <Field label="Status" value={employee.status} />
        <Field label="Tipo de vínculo" value={employee.employmentType} />
        <Field label="Data de admissão" value={employee.hireDate} />
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value?: string | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-slate-900">{value || '-'}</p>
    </div>
  );
}

interface RuleFormState {
  productType: EmployeeCommissionProductType;
  calculationType: EmployeeCommissionCalculationType;
  calculationBasis: EmployeeCommissionBasis;
  percentageRate: string;
  fixedAmount: string;
  validFrom: string;
  validUntil: string;
}

const EMPTY_RULE_FORM: RuleFormState = {
  productType: 'AIR',
  calculationType: 'PERCENTAGE',
  calculationBasis: 'PRODUCT_TOTAL',
  percentageRate: '',
  fixedAmount: '',
  validFrom: '',
  validUntil: '',
};

function ComissoesTab({ employeeId }: { employeeId: string }) {
  const [rules, setRules] = useState<EmployeeCommissionRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<RuleFormState>(EMPTY_RULE_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    listEmployeeCommissionRules({ employeeId })
      .then(setRules)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as regras de comissão.'));
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    createEmployeeCommissionRule({
      employeeId,
      productType: form.productType,
      calculationType: form.calculationType,
      calculationBasis: form.calculationBasis,
      percentageRate: form.calculationType === 'PERCENTAGE' ? Number(form.percentageRate) : undefined,
      fixedAmount: form.calculationType === 'FIXED' ? Number(form.fixedAmount) : undefined,
      validFrom: form.validFrom || undefined,
      validUntil: form.validUntil || undefined,
    })
      .then(() => {
        setShowForm(false);
        setForm(EMPTY_RULE_FORM);
        load();
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Não foi possível criar a regra.'))
      .finally(() => setSaving(false));
  }

  function toggleStatus(rule: EmployeeCommissionRule) {
    const next = rule.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    updateEmployeeCommissionRuleStatus(rule.id, next).then(load).catch(() => {
      setError('Não foi possível atualizar o status da regra.');
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Regras de comissão</CardTitle>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-4 w-4" />
          {showForm ? 'Cancelar' : 'Adicionar comissão'}
        </Button>
      </CardHeader>

      {error && <p className="px-6 pb-2 text-sm text-destructive">{error}</p>}

      {showForm && (
        <CardContent className="border-b pb-6">
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
            <LabeledSelect
              label="Produto"
              value={form.productType}
              onChange={(e) => setForm({ ...form, productType: e.target.value as EmployeeCommissionProductType })}
            >
              {PRODUCT_TYPES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </LabeledSelect>
            <LabeledSelect
              label="Tipo"
              value={form.calculationType}
              onChange={(e) => setForm({ ...form, calculationType: e.target.value as EmployeeCommissionCalculationType })}
            >
              <option value="PERCENTAGE">Percentual</option>
              <option value="FIXED">Valor fixo</option>
            </LabeledSelect>
            <LabeledSelect
              label="Base de cálculo"
              value={form.calculationBasis}
              onChange={(e) => setForm({ ...form, calculationBasis: e.target.value as EmployeeCommissionBasis })}
            >
              {BASES.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </LabeledSelect>
            {form.calculationType === 'PERCENTAGE' ? (
              <LabeledInput
                label="Percentual (%)"
                type="number"
                step="0.01"
                value={form.percentageRate}
                onChange={(e) => setForm({ ...form, percentageRate: e.target.value })}
                required
              />
            ) : (
              <LabeledInput
                label="Valor fixo (R$)"
                type="number"
                step="0.01"
                value={form.fixedAmount}
                onChange={(e) => setForm({ ...form, fixedAmount: e.target.value })}
                required
              />
            )}
            <LabeledInput
              label="Vigência início"
              type="date"
              value={form.validFrom}
              onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
            />
            <LabeledInput
              label="Vigência fim"
              type="date"
              value={form.validUntil}
              onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
            />
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </form>
        </CardContent>
      )}

      <CardContent className="p-0">
        {!rules ? (
          <LoadingState label="Carregando regras…" />
        ) : rules.length === 0 ? (
          <EmptyState title="Nenhuma regra de comissão" description="Adicione a primeira regra para este funcionário." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-600">
                <th className="px-6 py-2">Produto</th>
                <th className="px-6 py-2">Tipo</th>
                <th className="px-6 py-2">Base</th>
                <th className="px-6 py-2">Percentual/Valor</th>
                <th className="px-6 py-2">Vigência</th>
                <th className="px-6 py-2">Status</th>
                <th className="px-6 py-2" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b">
                  <td className="px-6 py-2 font-medium">
                    {PRODUCT_TYPES.find((p) => p.value === rule.productType)?.label ?? rule.productType}
                  </td>
                  <td className="px-6 py-2">{rule.calculationType === 'PERCENTAGE' ? 'Percentual' : 'Fixo'}</td>
                  <td className="px-6 py-2">{BASES.find((b) => b.value === rule.calculationBasis)?.label ?? rule.calculationBasis}</td>
                  <td className="px-6 py-2">
                    {rule.calculationType === 'PERCENTAGE' ? `${rule.percentageRate}%` : formatCurrency(rule.fixedAmount ?? 0)}
                  </td>
                  <td className="px-6 py-2 text-xs text-slate-600">
                    {rule.validFrom ?? '—'} até {rule.validUntil ?? 'em aberto'}
                  </td>
                  <td className="px-6 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        rule.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {rule.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-6 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => toggleStatus(rule)}>
                      {rule.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function HistoricoTab({ employeeId }: { employeeId: string }) {
  const [rows, setRows] = useState<EmployeeCommissionReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEmployeeCommissionsReport({ employeeId })
      .then(setRows)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o histórico.'));
  }, [employeeId]);

  const totalsByProduct = new Map<string, number>();
  let grandTotal = 0;
  for (const row of rows ?? []) {
    if (row.status === 'CANCELLED') continue;
    const key = row.productType ?? 'Outro';
    totalsByProduct.set(key, (totalsByProduct.get(key) ?? 0) + row.amount);
    grandTotal += row.amount;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de comissões</CardTitle>
      </CardHeader>
      {error && <p className="px-6 pb-2 text-sm text-destructive">{error}</p>}
      <CardContent className="p-0">
        {!rows ? (
          <LoadingState label="Carregando histórico…" />
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhuma comissão gerada" description="As comissões geradas para este funcionário aparecerão aqui." />
        ) : (
          <>
            <div className="flex flex-wrap gap-4 border-b px-6 py-4">
              {Array.from(totalsByProduct.entries()).map(([product, total]) => (
                <div key={product} className="rounded-lg bg-slate-50 px-4 py-2">
                  <p className="text-xs text-slate-500">{PRODUCT_TYPES.find((p) => p.value === product)?.label ?? product}</p>
                  <p className="text-sm font-semibold">{formatCurrency(total)}</p>
                </div>
              ))}
              <div className="rounded-lg bg-slate-900 px-4 py-2 text-white">
                <p className="text-xs text-slate-300">Total</p>
                <p className="text-sm font-semibold">{formatCurrency(grandTotal)}</p>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-600">
                  <th className="px-6 py-2">Produto</th>
                  <th className="px-6 py-2">Cliente</th>
                  <th className="px-6 py-2">Base</th>
                  <th className="px-6 py-2">Comissão</th>
                  <th className="px-6 py-2">Status</th>
                  <th className="px-6 py-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="px-6 py-2 font-medium">
                      {PRODUCT_TYPES.find((p) => p.value === row.productType)?.label ?? row.productType ?? '-'}
                    </td>
                    <td className="px-6 py-2">{row.customerName ?? '-'}</td>
                    <td className="px-6 py-2">{formatCurrency(row.calculationBase)}</td>
                    <td className="px-6 py-2 font-semibold">{formatCurrency(row.amount)}</td>
                    <td className="px-6 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[row.status] ?? ''}`}>
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </td>
                    <td className="px-6 py-2 text-xs text-slate-600">
                      {new Date(row.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function LabeledInput({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input {...rest} />
    </div>
  );
}

function LabeledSelect({
  label,
  children,
  ...rest
}: { label: string; children: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" {...rest}>
        {children}
      </select>
    </div>
  );
}
