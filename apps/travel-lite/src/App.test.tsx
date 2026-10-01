import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const ALL_PERMISSIONS = [
  'users.manage', 'permissions.manage', 'customers.create', 'customers.read_all', 'customers.read_own',
  'customers.update_all', 'customers.update_own', 'sales.create', 'sales.read_all', 'sales.read_own',
  'sales.update_all', 'sales.update_own', 'sellers.read', 'sellers.manage', 'commissions.read_all',
  'commissions.read_own', 'commissions.approve', 'commissions.pay', 'finance.read', 'finance.manage',
  'reports.sales_all', 'reports.sales_own', 'reports.sellers_all', 'reports.finance',
  'dashboard.configure', 'settings.manage',
];

const SESSION = {
  token: 'v1.tenant.user.deadbeef',
  user: {
    id: 'user-1',
    tenantId: 'tenant-1',
    name: 'Admin Teste',
    email: 'admin@teste.dev',
    role: 'MASTER',
    sellerId: null,
    permissions: ALL_PERMISSIONS,
  },
};

const SELLER_USER = {
  id: 'user-2',
  tenantId: 'tenant-1',
  name: 'Vendedora Teste',
  email: 'vendedora@teste.dev',
  role: 'SELLER',
  sellerId: 'seller-2',
  permissions: [
    'customers.create', 'customers.read_own', 'customers.update_own', 'sales.create',
    'sales.read_own', 'sales.update_own', 'commissions.read_own', 'reports.sales_own',
  ],
};

function dashboard(canConfigure: boolean, salesCount: number) {
  return {
    can_configure: canConfigure,
    widgets: [
      { key: 'sales_month', title: 'Vendas do mês', kind: 'kpi', data: { value: salesCount, format: 'count' } },
      { key: 'sales_amount', title: 'Valor vendido no mês', kind: 'kpi', data: { value: 1500, format: 'money' } },
      {
        key: 'seller_ranking',
        title: 'Ranking de vendedores no mês',
        kind: 'table',
        data: { rows: [{ seller_name: 'Vendedora Teste', sales_count: salesCount, gross_amount: 1500, margin_amount: 300 }] },
      },
    ],
  };
}

function mockFetch(routes: Record<string, unknown>) {
  return vi.fn((input: RequestInfo | URL) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const path = url.replace(/^\/api/, '').split('?')[0] ?? '';
    const handler = routes[path];
    if (handler === undefined) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(handler), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
}

describe('App shell', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects anonymous visitors to the login page', async () => {
    render(<App />);

    expect(await screen.findByText('Entre com o acesso da agência')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it('logs in as MASTER and shows every menu entry plus the dashboard configuration', async () => {
    const fetchMock = mockFetch({
      '/auth/login': { sessionToken: 'v1.tenant.user.deadbeef', user: SESSION.user },
      '/dashboard': dashboard(true, 2),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('Entre com o acesso da agência')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Agência'), { target: { value: 'gadotti' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'admin@teste.dev' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Vendas do mês')).toBeInTheDocument();
    expect(screen.getByText('Admin Teste')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Configurar dashboard/ })).toBeInTheDocument();

    const menuLabels = screen.getAllByRole('link').map((link) => link.textContent);
    expect(menuLabels).toEqual([
      'Dashboard',
      'Vendas',
      'Financeiro',
      'Clientes',
      'Vendedores',
      'Comissões',
      'Relatórios',
      'Cadastros',
      'Configurações',
    ]);
  });

  it('shows a SELLER only the authorized menus and no dashboard configuration', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SELLER_USER));
    vi.stubGlobal(
      'fetch',
      mockFetch({ '/auth/me': { user: SELLER_USER }, '/dashboard': dashboard(false, 1) }),
    );

    render(<App />);

    expect(await screen.findByText('Vendas do mês')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Vendedora Teste', { selector: '.lite-user' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Configurar dashboard/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Dashboard',
      'Vendas',
      'Clientes',
      'Comissões',
      'Relatórios',
    ]);
  });

  it('keeps the session across reloads and redirects unauthorized URLs to the dashboard', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SELLER_USER));
    window.history.pushState({}, '', '/configuracoes');
    vi.stubGlobal('fetch', mockFetch({ '/auth/me': { user: SELLER_USER }, '/dashboard': dashboard(false, 0) }));

    render(<App />);

    expect(await screen.findByText('Vendas do mês')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });
});
