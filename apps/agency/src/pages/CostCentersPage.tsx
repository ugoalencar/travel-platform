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
import { ApiError, createCostCenter, listCostCenters, updateCostCenter, type CostCenter } from '../lib/api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; costCenters: CostCenter[] };

export function CostCentersPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    listCostCenters(true)
      .then((costCenters) => {
        setState({ status: 'success', costCenters });
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar centros de custo.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setFormError(null);
    createCostCenter({
      name: name.trim(),
      code: code.trim() || undefined,
      description: description.trim() || undefined,
    })
      .then(() => {
        setName('');
        setCode('');
        setDescription('');
        setShowForm(false);
        load();
      })
      .catch((err: unknown) => {
        setFormError(err instanceof ApiError ? err.message : 'Não foi possível criar o centro de custo.');
      })
      .finally(() => setSaving(false));
  };

  const handleToggleActive = (cc: CostCenter) => {
    setTogglingId(cc.id);
    void updateCostCenter(cc.id, { active: !cc.active })
      .then(() => load())
      .finally(() => setTogglingId(null));
  };

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Centros de Custo" description="Gerenciar centros de custo para classificação financeira." />
        <LoadingState label="Carregando centros de custo…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Centros de Custo"
        description="Gerenciar centros de custo para classificação financeira."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Centros de Custo' }]}
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Centros de Custo</CardTitle>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" />
            {showForm ? 'Cancelar' : 'Adicionar'}
          </Button>
        </CardHeader>
        {showForm ? (
          <CardContent className="border-b pb-4">
            <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="cc-name">Nome</label>
                <Input id="cc-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="cc-code">Código (opcional)</label>
                <Input id="cc-code" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="cc-description">Descrição (opcional)</label>
                <Input id="cc-description" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </Button>
              {formError ? <p className="w-full text-sm text-destructive">{formError}</p> : null}
            </form>
          </CardContent>
        ) : null}
        <CardContent className="p-0">
          {state.costCenters.length === 0 ? (
            <EmptyState
              title="Nenhum centro de custo registrado"
              description="Crie um novo centro de custo para começar."
              action={<Button size="sm" onClick={() => setShowForm(true)}><Plus className="mr-2 h-4 w-4" />Adicionar</Button>}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.costCenters.map((cc) => (
                  <TableRow key={cc.id}>
                    <TableCell className="font-medium">{cc.name}</TableCell>
                    <TableCell>{cc.code || '-'}</TableCell>
                    <TableCell>{cc.description || '-'}</TableCell>
                    <TableCell>{cc.active ? 'Ativo' : 'Inativo'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={togglingId === cc.id}
                        onClick={() => handleToggleActive(cc)}
                      >
                        {cc.active ? 'Desativar' : 'Ativar'}
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
