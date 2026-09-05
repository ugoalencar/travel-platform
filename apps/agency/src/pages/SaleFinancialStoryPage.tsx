import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ErrorState } from '../components/ui/error-state';
import { LoadingState } from '../components/ui/loading-state';
import { formatBRL } from '../lib/formatCurrency';
import { formatDateBR } from '../lib/formatDateBR';
import { ApiError, getSaleFinancialStory, type SaleFinancialStory } from '../lib/api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; story: SaleFinancialStory };

export function SaleFinancialStoryPage() {
  const { saleId } = useParams<{ saleId: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!saleId) return;

    let cancelled = false;
    setState({ status: 'loading' });

    getSaleFinancialStory(saleId)
      .then((story) => {
        if (!cancelled) setState({ status: 'success', story });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof ApiError ? error.message : 'Nao foi possivel carregar a historia financeira.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [saleId]);

  if (!saleId) return <ErrorState description="Venda nao informada." />;
  if (state.status === 'loading') return <LoadingState label="Carregando historia financeira..." />;
  if (state.status === 'error') return <ErrorState description={state.message} />;

  const { story } = state;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Historia financeira - ${story.customerName}`}
        description={story.tripName ?? 'Venda com recebiveis, fornecedores, caixa e margem.'}
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Financeiro', to: '/financial' }]}
        actions={
          <Link to="/financial">
            <Button size="sm" variant="outline">Voltar</Button>
          </Link>
        }
      />

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Venda bruta" value={formatBRL(story.grossSale)} />
        <Metric label="Recebido" value={formatBRL(story.received)} />
        <Metric label="A receber" value={formatBRL(story.remainingReceivable)} />
        <Metric label="Margem liquida" value={formatBRL(story.margin.netMargin)} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Parcelas do cliente</CardTitle>
        </CardHeader>
        <CardContent>
          {story.installmentSchedule.map((item) => (
            <Row
              key={`${item.description}-${item.dueDate}`}
              left={item.description}
              middle={formatDateBR(item.dueDate, { assumeDateOnly: true })}
              right={formatBRL(item.amount)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compromissos com fornecedores</CardTitle>
        </CardHeader>
        <CardContent>
          {story.supplierPayables.map((item) => (
            <Row
              key={`${item.description}-${item.dueAt}`}
              left={item.description}
              middle={formatDateBR(item.dueAt, { assumeDateOnly: true })}
              right={formatBRL(item.amount)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Margem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Row left="Venda" middle="Receita total" right={formatBRL(story.margin.grossSale)} />
          <Row
            left="Custos de fornecedores"
            middle="Hotel, aereo, transfer e seguro"
            right={`-${formatBRL(story.margin.supplierCosts)}`}
          />
          <Row
            left="Taxas e comissao"
            middle="Custos comerciais"
            right={`-${formatBRL(story.margin.commissionAndFees)}`}
          />
          <Row left="Margem liquida" middle="Resultado esperado" right={formatBRL(story.margin.netMargin)} strong />
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Row({ left, middle, right, strong = false }: { left: string; middle: string; right: string; strong?: boolean }) {
  return (
    <div
      className={`grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-b border-slate-100 py-3 text-sm last:border-0 md:grid-cols-[1fr_220px_auto] md:items-center ${strong ? 'font-semibold' : ''}`}
    >
      <span className="min-w-0 text-slate-900">{left}</span>
      <span className="text-slate-500 md:text-center">{middle}</span>
      <span className="col-span-2 text-slate-900 md:col-span-1 md:text-right">{right}</span>
    </div>
  );
}
