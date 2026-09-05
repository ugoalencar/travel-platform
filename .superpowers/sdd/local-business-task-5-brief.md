### Task 5: Add Presenter-Safe Sale Financial Story Page

**Files:**
- Modify: `apps/agency/src/lib/api.ts`
- Create: `apps/agency/src/pages/SaleFinancialStoryPage.tsx`
- Create: `apps/agency/src/pages/SaleFinancialStoryPage.test.tsx`
- Modify: `apps/agency/src/App.tsx`
- Modify: `apps/agency/src/pages/FinancialPage.tsx`

**Interfaces:**
- Consumes: `GET /financial/sales/:id/story`.
- Produces: `/financial/sales/:saleId/story`.

- [ ] **Step 1: Add client type and function**

Add to `apps/agency/src/lib/api.ts`:

```typescript
export interface SaleFinancialStory {
  saleId: string;
  customerName: string;
  tripName: string | null;
  grossSale: number;
  received: number;
  remainingReceivable: number;
  supplierPayables: Array<{ description: string; amount: number; dueAt: string; status: FinancialObligationStatus }>;
  totalSupplierPayable: number;
  installmentSchedule: Array<{ description: string; amount: number; dueDate: string; status: string }>;
  margin: {
    grossSale: number;
    supplierCosts: number;
    commissionAndFees: number;
    grossMargin: number;
    netMargin: number;
  };
}

export async function getSaleFinancialStory(saleId: string): Promise<SaleFinancialStory> {
  const data = await request<{ story: SaleFinancialStory }>(
    `/api/financial/sales/${encodeURIComponent(saleId)}/story`,
  );
  return data.story;
}
```

- [ ] **Step 2: Create page**

Create `apps/agency/src/pages/SaleFinancialStoryPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { LoadingState } from '../components/ui/loading-state';
import { ErrorState } from '../components/ui/error-state';
import { Button } from '../components/ui/button';
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
        actions={<Link to="/financial"><Button size="sm" variant="outline">Voltar</Button></Link>}
      />

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Venda bruta" value={formatBRL(story.grossSale)} />
        <Metric label="Recebido" value={formatBRL(story.received)} />
        <Metric label="A receber" value={formatBRL(story.remainingReceivable)} />
        <Metric label="Margem liquida" value={formatBRL(story.margin.netMargin)} />
      </section>

      <Card>
        <CardHeader><CardTitle>Parcelas do cliente</CardTitle></CardHeader>
        <CardContent>
          {story.installmentSchedule.map((item) => (
            <Row key={item.description} left={item.description} middle={formatDateBR(item.dueDate, { assumeDateOnly: true })} right={formatBRL(item.amount)} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Compromissos com fornecedores</CardTitle></CardHeader>
        <CardContent>
          {story.supplierPayables.map((item) => (
            <Row key={item.description} left={item.description} middle={formatDateBR(item.dueAt, { assumeDateOnly: true })} right={formatBRL(item.amount)} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Margem</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Row left="Venda" middle="Receita total" right={formatBRL(story.margin.grossSale)} />
          <Row left="Custos de fornecedores" middle="Hotel, aereo, transfer e seguro" right={`-${formatBRL(story.margin.supplierCosts)}`} />
          <Row left="Taxas e comissao" middle="Custos comerciais" right={`-${formatBRL(story.margin.commissionAndFees)}`} />
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
    <div className={`flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0 ${strong ? 'font-semibold' : ''}`}>
      <span className="text-slate-900">{left}</span>
      <span className="text-slate-500">{middle}</span>
      <span className="text-slate-900">{right}</span>
    </div>
  );
}
```

- [ ] **Step 3: Add route**

In `apps/agency/src/App.tsx`, import the page and add:

```tsx
<Route path="financial/sales/:saleId/story" element={<SaleFinancialStoryPage />} />
```

- [ ] **Step 4: Add UI test**

Create `apps/agency/src/pages/SaleFinancialStoryPage.test.tsx` and mock `getSaleFinancialStory` to return:

```typescript
{
  saleId: 'd0d50001-0000-4000-8000-000000000009',
  customerName: 'Mariana Alves Silva',
  tripName: 'Mariana / Cancun',
  grossSale: 18000,
  received: 6000,
  remainingReceivable: 12000,
  totalSupplierPayable: 14000,
  installmentSchedule: [
    { description: 'Entrada Mariana / Cancun', amount: 6000, dueDate: '2026-09-03', status: 'PAID' },
    { description: 'Parcela 2 Mariana / Cancun', amount: 6000, dueDate: '2026-10-03', status: 'OPEN' },
    { description: 'Parcela 3 Mariana / Cancun', amount: 6000, dueDate: '2026-11-03', status: 'OPEN' },
  ],
  supplierPayables: [
    { description: 'Hotel - Grand Palladium Cancun', amount: 7000, dueAt: '2026-09-20', status: 'OPEN' },
  ],
  margin: { grossSale: 18000, supplierCosts: 13300, commissionAndFees: 700, grossMargin: 4700, netMargin: 4000 },
}
```

Assert the page contains `Mariana Alves Silva`, `Venda bruta`, `R$ 18.000,00`, `Recebido`, `R$ 6.000,00`, `A receber`, `R$ 12.000,00`, `Hotel - Grand Palladium Cancun`, and `Margem liquida`.

- [ ] **Step 5: Run agency tests**

```powershell
npm run test -- --run apps/agency/src/pages/SaleFinancialStoryPage.test.tsx apps/agency/src/App.test.tsx
```

Expected: pass.

---

