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
  approveCommission,
  approvePayrollEntry,
  createEmployeeDeduction,
  createPayableFromCommission,
  generateCommission,
  generatePayrollEntry,
  listCommissionPlans,
  listCommissions,
  listEmployeeDeductions,
  listEmployees,
  listPayrollEntries,
  listSales,
  payPayrollEntry,
  type CommissionEntry,
  type CommissionPlan,
  type Employee,
  type EmployeeDeduction,
  type EmployeeDeductionType,
  type PayrollEntry,
  type Sale,
} from '../lib/api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      employees: Employee[];
      commissionPlans: CommissionPlan[];
      commissions: CommissionEntry[];
      payrollEntries: PayrollEntry[];
      deductions: EmployeeDeduction[];
      sales: Sale[];
    };

const CURRENCY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const MONTH_FORMAT = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' });

const COMMISSION_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovada',
  PAYABLE: 'Em Contas a Pagar',
  PAID: 'Paga',
  CANCELLED: 'Cancelada',
};

const PAYROLL_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberta',
  APPROVED: 'Aprovada',
  PAID: 'Paga',
  CANCELLED: 'Cancelada',
};

const DEDUCTION_TYPES: Array<{ value: EmployeeDeductionType; label: string }> = [
  { value: 'ADVANCE', label: 'Adiantamento' },
  { value: 'ABSENCE', label: 'Falta' },
  { value: 'BENEFIT', label: 'Benefício' },
  { value: 'LOAN', label: 'Empréstimo' },
  { value: 'ADJUSTMENT', label: 'Ajuste' },
  { value: 'OTHER', label: 'Outro' },
];

function monthLabel(dateStr: string): string {
  return MONTH_FORMAT.format(new Date(dateStr));
}

export function PayrollPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showCommissionForm, setShowCommissionForm] = useState(false);
  const [commissionForm, setCommissionForm] = useState({ employeeId: '', saleId: '', commissionPlanId: '' });

  const [showPayrollForm, setShowPayrollForm] = useState(false);
  const [payrollForm, setPayrollForm] = useState({ employeeId: '', competence: '' });

  const [showDeductionForm, setShowDeductionForm] = useState(false);
  const [deductionForm, setDeductionForm] = useState({
    employeeId: '',
    competence: '',
    type: 'ADVANCE' as EmployeeDeductionType,
    description: '',
    amount: '',
  });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    Promise.all([
      listEmployees(),
      listCommissionPlans(true),
      listCommissions(),
      listPayrollEntries(),
      listEmployeeDeductions(),
      listSales(),
    ])
      .then(([employees, commissionPlans, commissions, payrollEntries, deductions, sales]) => {
        setState({ status: 'success', employees, commissionPlans, commissions, payrollEntries, deductions, sales });
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar a folha de pagamento.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Comissões e Folha de Pagamento" description="Comissões geradas, descontos e pagamentos de pessoal." />
        <LoadingState label="Carregando dados de folha…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  const employeeName = (id: string) => state.employees.find((e) => e.id === id)?.name ?? id;
  const saleLabel = (id: string) => {
    const sale = state.sales.find((s) => s.id === id);
    return sale ? `${CURRENCY.format(sale.total)} — ${sale.id.slice(0, 8)}` : id.slice(0, 8);
  };

  const handleGenerateCommission = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commissionForm.employeeId || !commissionForm.saleId) return;
    setActionError(null);
    setBusyId('generate-commission');
    generateCommission({
      employeeId: commissionForm.employeeId,
      saleId: commissionForm.saleId,
      commissionPlanId: commissionForm.commissionPlanId || undefined,
    })
      .then(() => {
        setShowCommissionForm(false);
        setCommissionForm({ employeeId: '', saleId: '', commissionPlanId: '' });
        load();
      })
      .catch((err: unknown) => {
        setActionError(err instanceof ApiError ? err.message : 'Não foi possível gerar a comissão.');
      })
      .finally(() => setBusyId(null));
  };

  const handleApproveCommission = (id: string) => {
    setActionError(null);
    setBusyId(id);
    approveCommission(id)
      .then(() => load())
      .catch((err: unknown) => setActionError(err instanceof ApiError ? err.message : 'Não foi possível aprovar a comissão.'))
      .finally(() => setBusyId(null));
  };

  const handleCreatePayableFromCommission = (id: string) => {
    setActionError(null);
    setBusyId(id);
    createPayableFromCommission(id)
      .then(() => load())
      .catch((err: unknown) => setActionError(err instanceof ApiError ? err.message : 'Não foi possível criar a conta a pagar.'))
      .finally(() => setBusyId(null));
  };

  const handleGeneratePayroll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payrollForm.employeeId || !payrollForm.competence) return;
    setActionError(null);
    setBusyId('generate-payroll');
    generatePayrollEntry({ employeeId: payrollForm.employeeId, competence: payrollForm.competence })
      .then(() => {
        setShowPayrollForm(false);
        setPayrollForm({ employeeId: '', competence: '' });
        load();
      })
      .catch((err: unknown) => setActionError(err instanceof ApiError ? err.message : 'Não foi possível gerar a folha.'))
      .finally(() => setBusyId(null));
  };

  const handleApprovePayroll = (id: string) => {
    setActionError(null);
    setBusyId(id);
    approvePayrollEntry(id)
      .then(() => load())
      .catch((err: unknown) => setActionError(err instanceof ApiError ? err.message : 'Não foi possível aprovar a folha.'))
      .finally(() => setBusyId(null));
  };

  const handlePayPayroll = (id: string) => {
    setActionError(null);
    setBusyId(id);
    payPayrollEntry(id)
      .then(() => load())
      .catch((err: unknown) => setActionError(err instanceof ApiError ? err.message : 'Não foi possível pagar a folha.'))
      .finally(() => setBusyId(null));
  };

  const handleCreateDeduction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deductionForm.employeeId || !deductionForm.competence || !deductionForm.amount) return;
    setActionError(null);
    setBusyId('create-deduction');
    createEmployeeDeduction({
      employeeId: deductionForm.employeeId,
      competence: deductionForm.competence,
      type: deductionForm.type,
      description: deductionForm.description.trim() || undefined,
      amount: Number(deductionForm.amount),
    })
      .then(() => {
        setShowDeductionForm(false);
        setDeductionForm({ employeeId: '', competence: '', type: 'ADVANCE', description: '', amount: '' });
        load();
      })
      .catch((err: unknown) => setActionError(err instanceof ApiError ? err.message : 'Não foi possível criar o desconto.'))
      .finally(() => setBusyId(null));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comissões e Folha de Pagamento"
        description="Comissões geradas a partir de vendas, descontos e pagamentos de pessoal, convergindo para Contas a Pagar."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Comissões e Folha' }]}
      />

      {actionError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Comissões Geradas</CardTitle>
          <Button size="sm" onClick={() => setShowCommissionForm((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" />
            {showCommissionForm ? 'Cancelar' : 'Gerar Comissão'}
          </Button>
        </CardHeader>
        {showCommissionForm ? (
          <CardContent className="space-y-3 border-b pb-6">
            <form onSubmit={handleGenerateCommission} className="flex flex-wrap items-end gap-3">
              <LabeledSelect
                id="comm-employee"
                label="Funcionário"
                value={commissionForm.employeeId}
                onChange={(e) => setCommissionForm((f) => ({ ...f, employeeId: e.target.value }))}
              >
                <option value="">Selecione</option>
                {state.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </LabeledSelect>
              <LabeledSelect
                id="comm-sale"
                label="Venda"
                value={commissionForm.saleId}
                onChange={(e) => setCommissionForm((f) => ({ ...f, saleId: e.target.value }))}
              >
                <option value="">Selecione</option>
                {state.sales.map((sale) => (
                  <option key={sale.id} value={sale.id}>{CURRENCY.format(sale.total)} — {sale.id.slice(0, 8)}</option>
                ))}
              </LabeledSelect>
              <LabeledSelect
                id="comm-plan"
                label="Plano de Comissão (opcional)"
                value={commissionForm.commissionPlanId}
                onChange={(e) => setCommissionForm((f) => ({ ...f, commissionPlanId: e.target.value }))}
              >
                <option value="">Usar plano padrão do funcionário</option>
                {state.commissionPlans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </LabeledSelect>
              <Button type="submit" size="sm" disabled={busyId === 'generate-commission'}>
                {busyId === 'generate-commission' ? 'Gerando…' : 'Gerar'}
              </Button>
            </form>
          </CardContent>
        ) : null}
        <CardContent className="p-0">
          {state.commissions.length === 0 ? (
            <EmptyState title="Nenhuma comissão gerada" description="Gere uma comissão a partir de uma venda." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Venda</TableHead>
                  <TableHead>Base de Cálculo</TableHead>
                  <TableHead>Taxa</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.commissions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{employeeName(c.employeeId)}</TableCell>
                    <TableCell>{saleLabel(c.saleId)}</TableCell>
                    <TableCell>{CURRENCY.format(c.calculationBase)}</TableCell>
                    <TableCell>{c.rate !== undefined ? `${c.rate}%` : '-'}</TableCell>
                    <TableCell className="font-semibold">{CURRENCY.format(c.amount)}</TableCell>
                    <TableCell>{COMMISSION_STATUS_LABEL[c.status] ?? c.status}</TableCell>
                    <TableCell className="text-right space-x-2">
                      {c.status === 'PENDING' ? (
                        <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => handleApproveCommission(c.id)}>
                          Aprovar
                        </Button>
                      ) : null}
                      {c.status === 'APPROVED' ? (
                        <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => handleCreatePayableFromCommission(c.id)}>
                          Gerar Conta a Pagar
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Folha de Pagamento</CardTitle>
          <Button size="sm" onClick={() => setShowPayrollForm((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" />
            {showPayrollForm ? 'Cancelar' : 'Gerar Folha'}
          </Button>
        </CardHeader>
        {showPayrollForm ? (
          <CardContent className="space-y-3 border-b pb-6">
            <form onSubmit={handleGeneratePayroll} className="flex flex-wrap items-end gap-3">
              <LabeledSelect
                id="payroll-employee"
                label="Funcionário"
                value={payrollForm.employeeId}
                onChange={(e) => setPayrollForm((f) => ({ ...f, employeeId: e.target.value }))}
              >
                <option value="">Selecione</option>
                {state.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </LabeledSelect>
              <LabeledInput
                id="payroll-competence"
                label="Competência (mês)"
                type="month"
                value={payrollForm.competence.slice(0, 7)}
                onChange={(e) => setPayrollForm((f) => ({ ...f, competence: `${e.target.value}-01` }))}
              />
              <Button type="submit" size="sm" disabled={busyId === 'generate-payroll'}>
                {busyId === 'generate-payroll' ? 'Gerando…' : 'Gerar'}
              </Button>
            </form>
          </CardContent>
        ) : null}
        <CardContent className="p-0">
          {state.payrollEntries.length === 0 ? (
            <EmptyState title="Nenhuma folha gerada" description="Gere a folha de um funcionário para um mês." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Competência</TableHead>
                  <TableHead>Salário Base</TableHead>
                  <TableHead>Comissões</TableHead>
                  <TableHead>Descontos</TableHead>
                  <TableHead>Líquido</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.payrollEntries.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{employeeName(p.employeeId)}</TableCell>
                    <TableCell>{monthLabel(p.competence)}</TableCell>
                    <TableCell>{CURRENCY.format(p.baseSalary)}</TableCell>
                    <TableCell>{CURRENCY.format(p.commissionsTotal)}</TableCell>
                    <TableCell>{CURRENCY.format(p.discountsTotal)}</TableCell>
                    <TableCell className="font-semibold">{CURRENCY.format(p.netAmount)}</TableCell>
                    <TableCell>{PAYROLL_STATUS_LABEL[p.status] ?? p.status}</TableCell>
                    <TableCell className="text-right space-x-2">
                      {p.status === 'OPEN' ? (
                        <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => handleApprovePayroll(p.id)}>
                          Aprovar
                        </Button>
                      ) : null}
                      {p.status === 'APPROVED' ? (
                        <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => handlePayPayroll(p.id)}>
                          Pagar
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Descontos de Funcionários</CardTitle>
          <Button size="sm" onClick={() => setShowDeductionForm((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" />
            {showDeductionForm ? 'Cancelar' : 'Adicionar Desconto'}
          </Button>
        </CardHeader>
        {showDeductionForm ? (
          <CardContent className="space-y-3 border-b pb-6">
            <form onSubmit={handleCreateDeduction} className="flex flex-wrap items-end gap-3">
              <LabeledSelect
                id="ded-employee"
                label="Funcionário"
                value={deductionForm.employeeId}
                onChange={(e) => setDeductionForm((f) => ({ ...f, employeeId: e.target.value }))}
              >
                <option value="">Selecione</option>
                {state.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </LabeledSelect>
              <LabeledInput
                id="ded-competence"
                label="Competência (mês)"
                type="month"
                value={deductionForm.competence.slice(0, 7)}
                onChange={(e) => setDeductionForm((f) => ({ ...f, competence: `${e.target.value}-01` }))}
              />
              <LabeledSelect
                id="ded-type"
                label="Tipo"
                value={deductionForm.type}
                onChange={(e) => setDeductionForm((f) => ({ ...f, type: e.target.value as EmployeeDeductionType }))}
              >
                {DEDUCTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </LabeledSelect>
              <LabeledInput
                id="ded-description"
                label="Descrição"
                value={deductionForm.description}
                onChange={(e) => setDeductionForm((f) => ({ ...f, description: e.target.value }))}
              />
              <LabeledInput
                id="ded-amount"
                label="Valor (R$)"
                type="number"
                step="0.01"
                value={deductionForm.amount}
                onChange={(e) => setDeductionForm((f) => ({ ...f, amount: e.target.value }))}
              />
              <Button type="submit" size="sm" disabled={busyId === 'create-deduction'}>
                {busyId === 'create-deduction' ? 'Salvando…' : 'Salvar'}
              </Button>
            </form>
          </CardContent>
        ) : null}
        <CardContent className="p-0">
          {state.deductions.length === 0 ? (
            <EmptyState title="Nenhum desconto registrado" description="Adicione um desconto para um funcionário." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Competência</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.deductions.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{employeeName(d.employeeId)}</TableCell>
                    <TableCell>{monthLabel(d.competence)}</TableCell>
                    <TableCell>{DEDUCTION_TYPES.find((t) => t.value === d.type)?.label ?? d.type}</TableCell>
                    <TableCell>{d.description || '-'}</TableCell>
                    <TableCell className="text-right font-semibold">{CURRENCY.format(d.amount)}</TableCell>
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

function LabeledInput({
  id,
  label,
  ...rest
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={id}>{label}</label>
      <Input id={id} {...rest} />
    </div>
  );
}

function LabeledSelect({
  id,
  label,
  children,
  ...rest
}: { id: string; label: string; children: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={id}>{label}</label>
      <select id={id} className="h-9 rounded-md border border-input bg-background px-3 text-sm" {...rest}>
        {children}
      </select>
    </div>
  );
}
