import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rulesForSeller } from './commissionRules';

type ApiCall = (path: string, options?: { method?: string; body?: unknown }) => Promise<unknown>;
const apiMock = vi.fn<ApiCall>();
let granted: string[] = [];

vi.mock('./api', () => ({ api: (path: string, options?: { method?: string; body?: unknown }) => apiMock(path, options) }));
vi.mock('./auth', () => ({ useCan: (...anyOf: string[]) => anyOf.some((permission) => granted.includes(permission)) }));

import { SellersPage } from './pages/SellersPage';
import { CommissionRulesPage } from './pages/CommissionRulesPage';

const seller = (id: string, name: string) => ({
  id,
  name,
  email: null,
  phone: null,
  cpf: null,
  status: 'ACTIVE',
  commission_rule_type: 'UNDEFINED',
  commission_rate: null,
  commission_fixed_amount: null,
});
const sellers = [seller('s1', 'Ana'), seller('s2', 'Beto'), seller('s3', 'Carla')];
const percentage = {
  mode: 'PERCENTAGE',
  calculation_base: 'GROSS',
  value: 10,
  apply_on: 'TOTAL',
  excess_threshold: null,
  version_number: 1,
  effective_from: '2026-01-01',
};
const rules = [
  { id: 'r1', seller_id: 's1', category_id: null, name: 'Regra da Ana', status: 'ACTIVE', ...percentage },
  { id: 'r2', seller_id: null, category_id: null, name: 'Padrão', status: 'ACTIVE', ...percentage, value: 5 },
  {
    id: 'r3',
    seller_id: 's3',
    category_id: null,
    name: 'Metas da Carla',
    status: 'ACTIVE',
    ...percentage,
    progressive: true,
    tiers: [
      { tier_number: 1, from_amount: 0, to_amount: 20000, rate: 3 },
      { tier_number: 2, from_amount: 20000, to_amount: null, rate: 4 },
    ],
  },
  { id: 'r4', seller_id: 's2', category_id: null, name: 'Antiga', status: 'ARCHIVED', ...percentage, value: 99 },
];

function routeApi() {
  apiMock.mockImplementation((path, options) => {
    if (path.startsWith('/sellers?')) return Promise.resolve({ items: sellers, page: 1, pageSize: 20, total: 3 });
    if (path === '/commission-rules') return Promise.resolve({ items: rules });
    if (path.startsWith('/sellers') && options?.method === 'PATCH') return Promise.resolve({ seller: sellers[0] });
    if (path.startsWith('/sellers')) return Promise.resolve({ items: sellers });
    if (path === '/categories') return Promise.resolve({ items: [] });
    return Promise.resolve({});
  });
}

function renderSellers() {
  return render(
    <MemoryRouter>
      <SellersPage />
    </MemoryRouter>,
  );
}

function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('tr')!;
}

beforeEach(() => {
  apiMock.mockReset();
  granted = ['sellers.manage', 'commissions.rules_manage'];
  routeApi();
});

describe('rulesForSeller', () => {
  it('prefers the seller rules, falls back to the agency default and ignores archived rules', () => {
    const all = rules as never;
    expect(rulesForSeller(all, 's1').map((r) => r.id)).toEqual(['r1']);
    expect(rulesForSeller(all, 's2').map((r) => r.id)).toEqual(['r2']);
    expect(rulesForSeller(all, 's9').map((r) => r.id)).toEqual(['r2']);
    expect(rulesForSeller(rules.filter((r) => r.id !== 'r2') as never, 's2')).toEqual([]);
  });
});

describe('SellersPage commission integration', () => {
  it('shows the commission coming from the rules, not from the legacy fields', async () => {
    renderSellers();
    await screen.findByText('Ana');
    await waitFor(() => expect(within(rowOf('Ana')).getByText('10% da venda bruta')).toBeInTheDocument());
    expect(within(rowOf('Beto')).getByText(/Padrão da agência: 5% da venda bruta/)).toBeInTheDocument();
    expect(within(rowOf('Carla')).getByText(/Progressiva mensal da venda bruta: 3% até/)).toBeInTheDocument();
  });

  it('has no duplicated commission inputs in the seller form and points to the rules', async () => {
    renderSellers();
    await screen.findByText('Ana');
    await waitFor(() => expect(within(rowOf('Ana')).getByText('10% da venda bruta')).toBeInTheDocument());
    fireEvent.click(within(rowOf('Ana')).getByRole('button', { name: 'Editar' }));
    expect(screen.queryByLabelText('Regra de comissão')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Percentual/)).not.toBeInTheDocument();
    expect(screen.getByText(/Regra da Ana: 10% da venda bruta/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Definir ou revisar a regra deste vendedor/ });
    expect(link).toHaveAttribute('href', '/regras-comissao?vendedor=s1');
  });

  it('saves seller data without touching the commission rule', async () => {
    renderSellers();
    await screen.findByText('Ana');
    fireEvent.click(within(rowOf('Ana')).getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Ana Maria' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/sellers/s1', { method: 'PATCH', body: { name: 'Ana Maria' } }));
  });

  it('explains where to set the commission when creating a seller', async () => {
    renderSellers();
    fireEvent.click(await screen.findByRole('button', { name: 'Novo vendedor' }));
    expect(screen.getByText(/definida em Regras de comissão, depois de salvar/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Definir ou revisar/ })).not.toBeInTheDocument();
  });

  it('hides the link without rule management', async () => {
    granted = ['sellers.manage', 'commissions.read_own'];
    renderSellers();
    await screen.findByText('Ana');
    await waitFor(() => expect(within(rowOf('Ana')).getByText('10% da venda bruta')).toBeInTheDocument());
    fireEvent.click(within(rowOf('Ana')).getByRole('button', { name: 'Editar' }));
    expect(screen.getByText(/Regra da Ana/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Definir ou revisar/ })).not.toBeInTheDocument();
  });

  it('does not request the rules without any commission permission', async () => {
    granted = ['sellers.manage'];
    renderSellers();
    await screen.findByText('Ana');
    expect(within(rowOf('Ana')).getByText('Sem regra')).toBeInTheDocument();
    expect(apiMock.mock.calls.some(([path]) => path === '/commission-rules')).toBe(false);
  });
});

describe('CommissionRulesPage', () => {
  it('opens the create form with the seller of the link already selected', async () => {
    render(
      <MemoryRouter initialEntries={['/regras-comissao?vendedor=s2']}>
        <CommissionRulesPage />
      </MemoryRouter>,
    );
    const form = await screen.findByRole('form', { name: 'Nova regra' });
    await waitFor(() => expect(within(form).getByLabelText('Vendedor')).toHaveValue('s2'));
  });

  it('renders the tier editor with the dedicated layout classes', async () => {
    render(
      <MemoryRouter>
        <CommissionRulesPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Nova regra' }));
    fireEvent.click(screen.getByLabelText(/Comissão progressiva por meta mensal/));
    const editor = document.querySelector('fieldset.tier-editor')!;
    expect(editor).not.toBeNull();
    expect(editor.querySelectorAll('.tier-row')).toHaveLength(2);
    expect(editor.querySelector('.field')).toBeNull();
  });
});
