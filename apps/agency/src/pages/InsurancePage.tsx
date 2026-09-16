import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import {
  ApiError,
  createInsuranceProduct,
  createInsurancePolicy,
  listCustomers,
  listInsuranceProducts,
  listInsurancePolicies,
  updateInsurancePolicyStatus,
  type InsurancePolicy,
  type InsurancePolicyStatus,
  type InsuranceProduct,
} from '../lib/api';
import type { Customer } from '../types/customer';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; products: InsuranceProduct[]; policies: InsurancePolicy[]; customers: Customer[] };

const POLICY_STATUS_LABEL: Record<InsurancePolicyStatus, string> = {
  QUOTED: 'Orçado',
  ISSUED: 'Emitido',
  ACTIVE: 'Ativo',
  EXPIRED: 'Expirado',
  CANCELLED: 'Cancelado',
};

const emptyNewProduct = { insurerName: '', planName: '', coverageDescription: '', costAmount: '', priceAmount: '' };
const emptyNewPolicy = {
  insuranceProductId: '',
  customerId: '',
  coverageStart: '',
  coverageEnd: '',
  costAmount: '',
  saleAmount: '',
};

export function InsurancePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showProductForm, setShowProductForm] = useState(false);
  const [newProduct, setNewProduct] = useState(emptyNewProduct);

  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [newPolicy, setNewPolicy] = useState(emptyNewPolicy);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    Promise.all([listInsuranceProducts(), listInsurancePolicies(), listCustomers()])
      .then(([products, policies, customers]) => setState({ status: 'success', products, policies, customers }))
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar os seguros.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Seguros" description="Produtos de seguro-viagem e apólices vendidas." />
        <LoadingState label="Carregando seguros…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  const { products, policies, customers } = state;
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  const productLabel = (id: string) => {
    const p = products.find((prod) => prod.id === id);
    return p ? `${p.insurerName} — ${p.planName}` : id.slice(0, 8);
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.insurerName.trim() || !newProduct.planName.trim()) return;
    setBusyId('create-product');
    setActionError(null);
    createInsuranceProduct({
      insurerName: newProduct.insurerName.trim(),
      planName: newProduct.planName.trim(),
      ...(newProduct.coverageDescription.trim() ? { coverageDescription: newProduct.coverageDescription.trim() } : {}),
      costAmount: Number(newProduct.costAmount || 0),
      priceAmount: Number(newProduct.priceAmount || 0),
    })
      .then(() => {
        setShowProductForm(false);
        setNewProduct(emptyNewProduct);
        load();
      })
      .catch((err: unknown) => setActionError(err instanceof ApiError ? err.message : 'Não foi possível criar o produto.'))
      .finally(() => setBusyId(null));
  };

  const handleCreatePolicy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPolicy.insuranceProductId || !newPolicy.customerId || !newPolicy.coverageStart || !newPolicy.coverageEnd) return;
    setBusyId('create-policy');
    setActionError(null);
    createInsurancePolicy({
      insuranceProductId: newPolicy.insuranceProductId,
      customerId: newPolicy.customerId,
      coverageStart: newPolicy.coverageStart,
      coverageEnd: newPolicy.coverageEnd,
      costAmount: Number(newPolicy.costAmount || 0),
      saleAmount: Number(newPolicy.saleAmount || 0),
    })
      .then(() => {
        setShowPolicyForm(false);
        setNewPolicy(emptyNewPolicy);
        load();
      })
      .catch((err: unknown) => setActionError(err instanceof ApiError ? err.message : 'Não foi possível criar a apólice.'))
      .finally(() => setBusyId(null));
  };

  const handleStatusChange = (policyId: string, status: InsurancePolicyStatus) => {
    setBusyId(policyId);
    setActionError(null);
    updateInsurancePolicyStatus(policyId, status)
      .then(() => load())
      .catch((err: unknown) => setActionError(err instanceof ApiError ? err.message : 'Não foi possível atualizar a apólice.'))
      .finally(() => setBusyId(null));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Seguros"
        description="Produtos de seguro-viagem e apólices vendidas — inclui passageiros e dependentes."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Seguros' }]}
      />

      {actionError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Produtos de Seguro</CardTitle>
          <Button size="sm" onClick={() => setShowProductForm((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" />
            {showProductForm ? 'Cancelar' : 'Novo Produto'}
          </Button>
        </CardHeader>
        {showProductForm ? (
          <CardContent className="space-y-3 border-b pb-6">
            <form onSubmit={handleCreateProduct} className="flex flex-wrap items-end gap-3">
              <LabeledInput
                id="ins-insurer"
                label="Seguradora"
                value={newProduct.insurerName}
                onChange={(e) => setNewProduct((f) => ({ ...f, insurerName: e.target.value }))}
                required
              />
              <LabeledInput
                id="ins-plan"
                label="Plano"
                value={newProduct.planName}
                onChange={(e) => setNewProduct((f) => ({ ...f, planName: e.target.value }))}
                required
              />
              <LabeledInput
                id="ins-coverage"
                label="Cobertura (opcional)"
                value={newProduct.coverageDescription}
                onChange={(e) => setNewProduct((f) => ({ ...f, coverageDescription: e.target.value }))}
              />
              <LabeledInput
                id="ins-cost"
                label="Custo (R$)"
                type="number"
                step="0.01"
                value={newProduct.costAmount}
                onChange={(e) => setNewProduct((f) => ({ ...f, costAmount: e.target.value }))}
              />
              <LabeledInput
                id="ins-price"
                label="Preço de venda (R$)"
                type="number"
                step="0.01"
                value={newProduct.priceAmount}
                onChange={(e) => setNewProduct((f) => ({ ...f, priceAmount: e.target.value }))}
              />
              <Button type="submit" size="sm" disabled={busyId === 'create-product'}>
                {busyId === 'create-product' ? 'Salvando…' : 'Salvar'}
              </Button>
            </form>
          </CardContent>
        ) : null}
        <CardContent className="p-0">
          {products.length === 0 ? (
            <EmptyState title="Nenhum produto de seguro" description="Cadastre um produto para começar a vender apólices." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seguradora</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Custo</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.insurerName}</TableCell>
                    <TableCell>{p.planName}</TableCell>
                    <TableCell>{formatBRL(p.costAmount)}</TableCell>
                    <TableCell className="font-semibold">{formatBRL(p.priceAmount)}</TableCell>
                    <TableCell>{p.active ? 'Ativo' : 'Inativo'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Apólices Vendidas</CardTitle>
          <Button size="sm" onClick={() => setShowPolicyForm((v) => !v)} disabled={products.length === 0}>
            <Plus className="mr-2 h-4 w-4" />
            {showPolicyForm ? 'Cancelar' : 'Vender Apólice'}
          </Button>
        </CardHeader>
        {products.length === 0 ? (
          <CardContent>
            <p className="text-sm text-slate-500">Cadastre um produto de seguro antes de vender uma apólice.</p>
          </CardContent>
        ) : null}
        {showPolicyForm ? (
          <CardContent className="space-y-3 border-b pb-6">
            <form onSubmit={handleCreatePolicy} className="flex flex-wrap items-end gap-3">
              <LabeledSelect
                id="pol-product"
                label="Produto"
                value={newPolicy.insuranceProductId}
                onChange={(e) => setNewPolicy((f) => ({ ...f, insuranceProductId: e.target.value }))}
              >
                <option value="">Selecione</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.insurerName} — {p.planName}</option>
                ))}
              </LabeledSelect>
              <LabeledSelect
                id="pol-customer"
                label="Cliente"
                value={newPolicy.customerId}
                onChange={(e) => setNewPolicy((f) => ({ ...f, customerId: e.target.value }))}
              >
                <option value="">Selecione</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </LabeledSelect>
              <LabeledInput
                id="pol-start"
                label="Início da cobertura"
                type="date"
                value={newPolicy.coverageStart}
                onChange={(e) => setNewPolicy((f) => ({ ...f, coverageStart: e.target.value }))}
              />
              <LabeledInput
                id="pol-end"
                label="Fim da cobertura"
                type="date"
                value={newPolicy.coverageEnd}
                onChange={(e) => setNewPolicy((f) => ({ ...f, coverageEnd: e.target.value }))}
              />
              <LabeledInput
                id="pol-cost"
                label="Custo (R$)"
                type="number"
                step="0.01"
                value={newPolicy.costAmount}
                onChange={(e) => setNewPolicy((f) => ({ ...f, costAmount: e.target.value }))}
              />
              <LabeledInput
                id="pol-sale"
                label="Valor de venda (R$)"
                type="number"
                step="0.01"
                value={newPolicy.saleAmount}
                onChange={(e) => setNewPolicy((f) => ({ ...f, saleAmount: e.target.value }))}
              />
              <Button type="submit" size="sm" disabled={busyId === 'create-policy'}>
                {busyId === 'create-policy' ? 'Salvando…' : 'Salvar'}
              </Button>
            </form>
          </CardContent>
        ) : null}
        <CardContent className="p-0">
          {policies.length === 0 ? (
            <EmptyState title="Nenhuma apólice vendida" description="Venda uma apólice a partir de um produto cadastrado." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Cobertura</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((pol) => (
                  <TableRow key={pol.id}>
                    <TableCell className="font-medium">{customerName(pol.customerId)}</TableCell>
                    <TableCell>{productLabel(pol.insuranceProductId)}</TableCell>
                    <TableCell>
                      {formatDateBR(pol.coverageStart, { assumeDateOnly: true })} – {formatDateBR(pol.coverageEnd, { assumeDateOnly: true })}
                    </TableCell>
                    <TableCell className="font-semibold">{formatBRL(pol.saleAmount)}</TableCell>
                    <TableCell>
                      <Select
                        className="h-8 text-xs"
                        value={pol.status}
                        disabled={busyId === pol.id}
                        onChange={(e) => handleStatusChange(pol.id, e.target.value as InsurancePolicyStatus)}
                      >
                        {Object.entries(POLICY_STATUS_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </Select>
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
      <Select id={id} {...rest}>
        {children}
      </Select>
    </div>
  );
}
