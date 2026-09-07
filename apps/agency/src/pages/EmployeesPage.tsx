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
  createEmployee,
  listCommissionPlans,
  listCostCenters,
  listEmployees,
  updateEmployee,
  type CommissionPlan,
  type CostCenter,
  type Employee,
  type EmployeeStatus,
  type EmploymentType,
} from '../lib/api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; employees: Employee[]; costCenters: CostCenter[]; commissionPlans: CommissionPlan[] };

const EMPLOYMENT_TYPES: Array<{ value: EmploymentType; label: string }> = [
  { value: 'EMPLOYEE', label: 'Funcionário(a) CLT' },
  { value: 'CONTRACTOR', label: 'Prestador(a) de Serviço' },
  { value: 'PARTNER', label: 'Sócio(a)' },
  { value: 'FREELANCER', label: 'Freelancer' },
  { value: 'OTHER', label: 'Outro' },
];

const STATUSES: Array<{ value: EmployeeStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'INACTIVE', label: 'Inativo' },
  { value: 'ON_LEAVE', label: 'Afastado' },
  { value: 'TERMINATED', label: 'Desligado' },
];

interface FormState {
  name: string;
  cpf: string;
  rg: string;
  birthDate: string;
  addressLine: string;
  addressCity: string;
  addressState: string;
  addressZipCode: string;
  phone: string;
  email: string;
  hireDate: string;
  terminationDate: string;
  employmentType: EmploymentType;
  roleTitle: string;
  department: string;
  costCenterId: string;
  status: EmployeeStatus;
  baseSalary: string;
  bankName: string;
  bankBranch: string;
  bankAccount: string;
  bankPixKey: string;
  notes: string;
  defaultCommissionPlanId: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  cpf: '',
  rg: '',
  birthDate: '',
  addressLine: '',
  addressCity: '',
  addressState: '',
  addressZipCode: '',
  phone: '',
  email: '',
  hireDate: '',
  terminationDate: '',
  employmentType: 'EMPLOYEE',
  roleTitle: '',
  department: '',
  costCenterId: '',
  status: 'ACTIVE',
  baseSalary: '',
  bankName: '',
  bankBranch: '',
  bankAccount: '',
  bankPixKey: '',
  notes: '',
  defaultCommissionPlanId: '',
};

function toFormState(employee: Employee): FormState {
  return {
    name: employee.name,
    cpf: employee.cpf ?? '',
    rg: employee.rg ?? '',
    birthDate: employee.birthDate ?? '',
    addressLine: employee.addressLine ?? '',
    addressCity: employee.addressCity ?? '',
    addressState: employee.addressState ?? '',
    addressZipCode: employee.addressZipCode ?? '',
    phone: employee.phone ?? '',
    email: employee.email ?? '',
    hireDate: employee.hireDate ?? '',
    terminationDate: employee.terminationDate ?? '',
    employmentType: employee.employmentType,
    roleTitle: employee.roleTitle ?? '',
    department: employee.department ?? '',
    costCenterId: employee.costCenterId ?? '',
    status: employee.status,
    baseSalary: employee.baseSalary !== undefined ? String(employee.baseSalary) : '',
    bankName: employee.bankName ?? '',
    bankBranch: employee.bankBranch ?? '',
    bankAccount: employee.bankAccount ?? '',
    bankPixKey: employee.bankPixKey ?? '',
    notes: employee.notes ?? '',
    defaultCommissionPlanId: employee.defaultCommissionPlanId ?? '',
  };
}

function formToInput(form: FormState) {
  return {
    name: form.name.trim(),
    cpf: form.cpf.trim() || undefined,
    rg: form.rg.trim() || undefined,
    birthDate: form.birthDate || undefined,
    addressLine: form.addressLine.trim() || undefined,
    addressCity: form.addressCity.trim() || undefined,
    addressState: form.addressState.trim() || undefined,
    addressZipCode: form.addressZipCode.trim() || undefined,
    phone: form.phone.trim() || undefined,
    email: form.email.trim() || undefined,
    hireDate: form.hireDate || undefined,
    terminationDate: form.terminationDate || undefined,
    employmentType: form.employmentType,
    roleTitle: form.roleTitle.trim() || undefined,
    department: form.department.trim() || undefined,
    costCenterId: form.costCenterId || undefined,
    status: form.status,
    baseSalary: form.baseSalary ? Number(form.baseSalary) : undefined,
    bankName: form.bankName.trim() || undefined,
    bankBranch: form.bankBranch.trim() || undefined,
    bankAccount: form.bankAccount.trim() || undefined,
    bankPixKey: form.bankPixKey.trim() || undefined,
    notes: form.notes.trim() || undefined,
    defaultCommissionPlanId: form.defaultCommissionPlanId || undefined,
  };
}

export function EmployeesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    Promise.all([listEmployees(), listCostCenters(true), listCommissionPlans(true)])
      .then(([employees, costCenters, commissionPlans]) => {
        setState({ status: 'success', employees, costCenters, commissionPlans });
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar os funcionários.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const field = <K extends keyof FormState>(key: K) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  };

  const startEdit = (employee: Employee) => {
    setEditingId(employee.id);
    setForm(toFormState(employee));
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setFormError(null);

    const input = formToInput(form);
    const promise = editingId ? updateEmployee(editingId, input) : createEmployee(input);

    promise
      .then(() => {
        setShowForm(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
        load();
      })
      .catch((err: unknown) => {
        setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o funcionário.');
      })
      .finally(() => setSaving(false));
  };

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Funcionários" description="Gerenciar a equipe da agência." />
        <LoadingState label="Carregando funcionários…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  const costCenterName = (id?: string) => state.costCenters.find((cc) => cc.id === id)?.name ?? '-';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Funcionários"
        description="Gerenciar a equipe da agência — dados pessoais, cargo, remuneração e vínculo bancário."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Funcionários' }]}
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Funcionários</CardTitle>
          <Button size="sm" onClick={() => (showForm ? setShowForm(false) : startCreate())}>
            <Plus className="mr-2 h-4 w-4" />
            {showForm ? 'Cancelar' : 'Adicionar'}
          </Button>
        </CardHeader>
        {showForm ? (
          <CardContent className="space-y-6 border-b pb-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700">Dados Pessoais</h3>
                <div className="flex flex-wrap gap-3">
                  <LabeledInput id="emp-name" label="Nome" required {...field('name')} />
                  <LabeledInput id="emp-cpf" label="CPF" {...field('cpf')} />
                  <LabeledInput id="emp-rg" label="RG" {...field('rg')} />
                  <LabeledInput id="emp-birth" label="Data de Nascimento" type="date" {...field('birthDate')} />
                  <LabeledInput id="emp-phone" label="Telefone" {...field('phone')} />
                  <LabeledInput id="emp-email" label="E-mail" type="email" {...field('email')} />
                  <LabeledInput id="emp-address" label="Endereço" {...field('addressLine')} />
                  <LabeledInput id="emp-city" label="Cidade" {...field('addressCity')} />
                  <LabeledInput id="emp-state" label="Estado" {...field('addressState')} />
                  <LabeledInput id="emp-zip" label="CEP" {...field('addressZipCode')} />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700">Vínculo</h3>
                <div className="flex flex-wrap gap-3">
                  <LabeledSelect id="emp-type" label="Tipo de Vínculo" {...field('employmentType')}>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </LabeledSelect>
                  <LabeledInput id="emp-role" label="Cargo" {...field('roleTitle')} />
                  <LabeledInput id="emp-department" label="Departamento" {...field('department')} />
                  <LabeledSelect id="emp-cc" label="Centro de Custo" {...field('costCenterId')}>
                    <option value="">-</option>
                    {state.costCenters.map((cc) => (
                      <option key={cc.id} value={cc.id}>{cc.name}</option>
                    ))}
                  </LabeledSelect>
                  <LabeledInput id="emp-hire" label="Data de Admissão" type="date" {...field('hireDate')} />
                  <LabeledInput id="emp-term" label="Data de Desligamento" type="date" {...field('terminationDate')} />
                  <LabeledSelect id="emp-status" label="Status" {...field('status')}>
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </LabeledSelect>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700">Remuneração e Dados Bancários</h3>
                <div className="flex flex-wrap gap-3">
                  <LabeledInput id="emp-salary" label="Salário Base (R$)" type="number" step="0.01" {...field('baseSalary')} />
                  <LabeledInput id="emp-bank" label="Banco" {...field('bankName')} />
                  <LabeledInput id="emp-branch" label="Agência" {...field('bankBranch')} />
                  <LabeledInput id="emp-account" label="Conta" {...field('bankAccount')} />
                  <LabeledInput id="emp-pix" label="Chave Pix" {...field('bankPixKey')} />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700">Plano de Comissão</h3>
                <div className="flex flex-wrap gap-3">
                  <LabeledSelect id="emp-plan" label="Plano de Comissão Padrão" {...field('defaultCommissionPlanId')}>
                    <option value="">-</option>
                    {state.commissionPlans.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </LabeledSelect>
                </div>
              </section>

              <div className="flex items-center gap-3">
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </Button>
                {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
              </div>
            </form>
          </CardContent>
        ) : null}
        <CardContent className="p-0">
          {state.employees.length === 0 ? (
            <EmptyState
              title="Nenhum funcionário registrado"
              description="Crie um novo funcionário para começar."
              action={<Button size="sm" onClick={startCreate}><Plus className="mr-2 h-4 w-4" />Adicionar</Button>}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Centro de Custo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.employees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">{employee.name}</TableCell>
                    <TableCell>{employee.roleTitle || '-'}</TableCell>
                    <TableCell>{employee.department || '-'}</TableCell>
                    <TableCell>{costCenterName(employee.costCenterId)}</TableCell>
                    <TableCell>{STATUSES.find((s) => s.value === employee.status)?.label ?? employee.status}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => startEdit(employee)}>
                        Editar
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

function LabeledInput({
  id,
  label,
  required,
  ...rest
}: { id: string; label: string; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={id}>{label}</label>
      <Input id={id} required={required} {...rest} />
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
