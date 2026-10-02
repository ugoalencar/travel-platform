import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const ALL_PERMISSIONS = [
  'users.manage', 'permissions.manage', 'customers.create', 'customers.read_all', 'customers.read_own',
  'customers.update_all', 'customers.update_own', 'sales.create', 'sales.read_all', 'sales.read_own',
  'sales.update_all', 'sales.update_own', 'sellers.read', 'sellers.manage', 'commissions.read_all',
  'commissions.read_own', 'commissions.approve', 'commissions.pay', 'finance.read', 'finance.manage',
  'reports.sales_all', 'reports.sales_own', 'reports.sellers_all', 'reports.finance',
  'imports.manage', 'dashboard.configure', 'settings.manage',
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
  return vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
    const url = callUrl(input);
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

function callUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
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
      'Importações',
      'Clientes',
      'Vendedores',
      'Comissões',
      'Relatórios',
      'Cadastros',
      'Configurações',
      'Ajuda',
      // Mobile quick-add shortcut (hidden by CSS on desktop), for users who can create customers.
      '+ Cliente',
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
      'Ajuda',
      // Mobile quick-add shortcut (hidden by CSS on desktop), for users who can create customers.
      '+ Cliente',
    ]);
  });

  it('keeps the session and explains denied URLs in place instead of redirecting', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SELLER_USER));
    window.history.pushState({}, '', '/configuracoes');
    vi.stubGlobal('fetch', mockFetch({ '/auth/me': { user: SELLER_USER } }));

    render(<App />);

    expect(await screen.findByText('Você não tem acesso a esta área.')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/configuracoes');
    expect(screen.getByRole('link', { name: 'Voltar ao dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver permissões na ajuda' })).toHaveAttribute(
      'href',
      '/ajuda#configuracoes',
    );
    expect(screen.queryByText('Vendas do mês')).not.toBeInTheDocument();
  });

  it('shows the import center to users with imports.manage', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
    window.history.pushState({}, '', '/importacoes');
    vi.stubGlobal('fetch', mockFetch({
      '/auth/me': { user: SESSION.user },
      '/sellers': { items: [] },
      '/categories': { items: [] },
      '/customers': { items: [] },
    }));

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Importações' })).toBeInTheDocument();
    expect(screen.getByLabelText('Arquivo CSV ou XLSX')).toBeInTheDocument();
  });

  it('opens the help page from the topbar link', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
    vi.stubGlobal(
      'fetch',
      mockFetch({ '/auth/me': { user: SESSION.user }, '/dashboard': dashboard(true, 0) }),
    );

    render(<App />);

    expect(await screen.findByText('Vendas do mês')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Ajuda' }));
    expect(await screen.findByRole('heading', { name: 'Ajuda' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/ajuda');
    expect(screen.getByText('Status das vendas')).toBeInTheDocument();
    expect(screen.getByLabelText('Buscar na ajuda')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dúvidas frequentes' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Índice da ajuda' })).toBeInTheDocument();
  });

  it('shows the first-run checklist while the agency base is empty', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/auth/me': { user: SESSION.user },
        '/dashboard': dashboard(false, 0),
        '/financial-accounts': { items: [] },
        '/categories': { items: [] },
        '/sellers': { items: [], total: 0 },
        '/customers': { items: [], total: 0 },
        '/sales': { items: [], total: 0 },
      }),
    );

    render(<App />);

    expect(await screen.findByText('Prepare sua agência')).toBeInTheDocument();
    expect(screen.getByText('Cadastre uma conta financeira para receber e pagar.')).toBeInTheDocument();
    expect(screen.getByText('Ex.: Banco do Brasil — CC 1234.')).toBeInTheDocument();
    expect(screen.getByText('Registre a primeira venda do sistema.')).toBeInTheDocument();
    expect(screen.getByText('Abra a Ajuda para conhecer as áreas e os erros comuns.')).toBeInTheDocument();
    expect(screen.getByText('0 de 6 etapas concluídas')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progresso do onboarding' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    expect(screen.getAllByRole('link', { name: 'Ir para Cadastros' })).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Ir para Vendedores' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para Clientes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para Vendas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir a ajuda' })).toHaveAttribute('href', '/ajuda');
    expect(screen.getAllByRole('link', { name: 'Ver na ajuda' })).toHaveLength(5);
  });

  it('hides the first-run checklist when the base is already populated', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
    window.localStorage.setItem('travel_lite_help_seen', '1');
    const fetchMock = mockFetch({
      '/auth/me': { user: SESSION.user },
      '/dashboard': dashboard(false, 0),
      '/financial-accounts': { items: [{ id: 'acc-1' }] },
      '/categories': { items: [{ id: 'cat-1' }] },
      '/sellers': { items: [{ id: 'sel-1' }], total: 1 },
      '/customers': { items: [{ id: 'cus-1' }], total: 1 },
      '/sales': { items: [{ id: 'sale-1' }], total: 1 },
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('Vendas do mês')).toBeInTheDocument();
    // The card starts hidden, so asserting its absence right away proves
    // nothing: wait for the five list calls, let their responses settle,
    // and only then check that it stayed hidden.
    const called = (fragment: string) =>
      fetchMock.mock.calls.some((call) => callUrl(call[0]).includes(fragment));
    await waitFor(() => {
      for (const fragment of ['/financial-accounts', '/categories', '/sellers', '/customers', '/sales']) {
        expect(called(fragment)).toBe(true);
      }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(screen.queryByText('Prepare sua agência')).toBeNull();
  });

  it('asks before cancelling a sale and shows the success note', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
    window.history.pushState({}, '', '/vendas');
    const sale = {
      id: 'sale-1',
      sale_number: 'VND-0001',
      status: 'CONFIRMED',
      sale_date: '2026-10-01',
      due_date: '2026-10-31',
      gross_amount: 1000,
      cost_amount: 200,
      margin_amount: 800,
      installment_count: 1,
      customer: { id: 'cust-1', name: 'Cliente X' },
      seller: { id: 'sel-1', name: 'Vendedor Y' },
      category: { id: 'cat-1', name: 'Passagens' },
    };
    const fetchMock = mockFetch({
      '/auth/me': { user: SESSION.user },
      '/sales': { items: [sale], page: 1, pageSize: 20, total: 1 },
      '/sales/sale-1': {
        sale: { ...sale, description: null },
        saleCosts: [],
        receivables: [],
        commission: null,
      },
      '/sales/sale-1/cancel': {},
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Detalhe' }));
    expect(await screen.findByRole('button', { name: 'Cancelar venda' })).toBeInTheDocument();

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar venda' }));
    expect(confirmSpy).toHaveBeenCalledWith(
      'Cancelar a venda VND-0001? Esta ação não pode ser desfeita.',
    );
    expect(fetchMock.mock.calls.some((call) => callUrl(call[0]).includes('/cancel'))).toBe(false);
    expect(screen.queryByText('Venda cancelada.')).not.toBeInTheDocument();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar venda' }));
    expect(await screen.findByText('Venda cancelada.')).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => callUrl(call[0]).includes('/cancel'))).toBe(true),
    );
  });

  it('does not deactivate a customer when confirmation is declined', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
    window.history.pushState({}, '', '/clientes');
    const customer = {
      id: 'cust-1',
      name: 'Maria Silva',
      status: 'ACTIVE',
      email: null,
      cpf: null,
      phone: null,
      responsible_seller_id: null,
      responsible_seller_name: null,
    };
    const fetchMock = mockFetch({
      '/auth/me': { user: SESSION.user },
      '/customers': { items: [customer], page: 1, pageSize: 20, total: 1 },
      '/customers/cust-1': {},
    });
    vi.stubGlobal('fetch', fetchMock);

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Desativar' }));
    expect(confirmSpy).toHaveBeenCalledWith(
      'Desativar o cliente "Maria Silva"? Ele não entrará em novas vendas.',
    );
    expect(fetchMock.mock.calls.some((call) => callUrl(call[0]).includes('/customers/cust-1'))).toBe(
      false,
    );
    expect(screen.queryByText('Cliente desativado.')).not.toBeInTheDocument();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }));
    expect(await screen.findByText('Cliente desativado.')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (call) =>
            callUrl(call[0]).includes('/customers/cust-1') && call[1]?.method === 'PATCH',
        ),
      ).toBe(true),
    );
  });

  it('offers a CTA in the empty state that opens the form', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
    window.history.pushState({}, '', '/clientes');
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/auth/me': { user: SESSION.user },
        '/customers': { items: [], page: 1, pageSize: 20, total: 0 },
      }),
    );

    render(<App />);

    expect(await screen.findByText('Nenhum cliente encontrado.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver na ajuda' })).toHaveAttribute(
      'href',
      '/ajuda#clientes',
    );
    const ctas = screen.getAllByRole('button', { name: 'Novo cliente' });
    fireEvent.click(ctas[ctas.length - 1]!);
    expect(await screen.findByRole('button', { name: 'Criar' })).toBeInTheDocument();
  });

  it('uses the pt-BR empty copy and the sales CTA in finance', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
    window.history.pushState({}, '', '/financeiro');
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/auth/me': { user: SESSION.user },
        '/receivables': { items: [], page: 1, pageSize: 20, total: 0 },
        '/payables': { items: [], page: 1, pageSize: 20, total: 0 },
        '/payments': { items: [], page: 1, pageSize: 20, total: 0 },
        '/financial-accounts': { items: [{ id: 'acc-1', name: 'Conta' }] },
        '/financial-categories': { items: [] },
      }),
    );

    render(<App />);

    expect(
      await screen.findByText('Nenhum recebível. Confirme uma venda para gerar parcelas.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para Vendas' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'A pagar' }));
    expect(await screen.findByText('Nenhuma despesa em aberto.')).toBeInTheDocument();
    expect(screen.queryByText(/payable/)).not.toBeInTheDocument();
  });

  it('serves the help page by direct URL and sends anonymous visitors to the login', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SELLER_USER));
    window.history.pushState({}, '', '/ajuda');
    vi.stubGlobal('fetch', mockFetch({ '/auth/me': { user: SELLER_USER } }));

    const authenticated = render(<App />);
    expect(await screen.findByRole('heading', { name: 'Ajuda' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/ajuda');
    expect(window.localStorage.getItem('travel_lite_help_seen')).toBe('1');
    authenticated.unmount();

    window.localStorage.clear();
    window.history.pushState({}, '', '/ajuda');
    render(<App />);
    expect(await screen.findByText('Entre com o acesso da agência')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it('filters the help center with the simple search', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SELLER_USER));
    window.history.pushState({}, '', '/ajuda');
    vi.stubGlobal('fetch', mockFetch({ '/auth/me': { user: SELLER_USER } }));

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Ajuda' })).toBeInTheDocument();
    const search = screen.getByLabelText('Buscar na ajuda');
    fireEvent.change(search, { target: { value: 'comissão' } });
    expect(await screen.findByRole('heading', { name: 'Comissões' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Importação de planilhas' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Clientes' })).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Quem pode aprovar e pagar comissões?' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/resultado\(s\) para/)).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'zzzzz' } });
    expect(await screen.findByText(/Nenhum resultado para/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Comissões' })).toBeNull();
  });

  it('shows the onboarding checklist on the settings page', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
    window.history.pushState({}, '', '/configuracoes');
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/auth/me': { user: SESSION.user },
        '/access/catalog': {
          roles: [
            { key: 'MASTER', name: 'MASTER', grants_all: true, assignable: false, permissions: [] },
          ],
          permissions: [],
        },
        '/users': { items: [] },
        '/sellers': { items: [{ id: 'sel-1', name: 'Ana Souza', user_id: null }], total: 1 },
        '/financial-accounts': { items: [] },
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Configurações · Usuários e permissões' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Prepare sua agência')).toBeInTheDocument();
    expect(screen.getByText('Cadastre uma conta financeira para receber e pagar.')).toBeInTheDocument();
    expect(screen.getByText('Abra a Ajuda para conhecer as áreas e os erros comuns.')).toBeInTheDocument();
    expect(screen.getByText('✓ Vendedores cadastrados')).toBeInTheDocument();
  });

  it('shows a SELLER only the checklist step they can act on', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SELLER_USER));
    const fetchMock = mockFetch({
      '/auth/me': { user: SELLER_USER },
      '/dashboard': dashboard(false, 0),
      '/customers': { items: [], total: 0 },
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('Prepare sua agência')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para Clientes' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ir para Cadastros' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Ir para Vendedores' })).toBeNull();
    for (const fragment of ['/financial-accounts', '/categories', '/sellers']) {
      expect(fetchMock.mock.calls.some((call) => callUrl(call[0]).includes(fragment))).toBe(false);
    }
  });

  it('keeps the dashboard and hides only the checklist row whose request failed', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
    // '/financial-accounts' is intentionally unmocked: the mock answers 404.
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/auth/me': { user: SESSION.user },
        '/dashboard': dashboard(false, 0),
        '/categories': { items: [] },
        '/sellers': { items: [], total: 0 },
        '/customers': { items: [], total: 0 },
      }),
    );

    const { container } = render(<App />);

    expect(await screen.findByText('Prepare sua agência')).toBeInTheDocument();
    expect(screen.getByText('Cadastre ao menos uma categoria de venda.')).toBeInTheDocument();
    expect(screen.queryByText('Cadastre uma conta financeira para receber e pagar.')).toBeNull();
    expect(screen.getByText('Vendas do mês')).toBeInTheDocument();
    expect(container.querySelector('.lite-error')).toBeNull();
  });

  it('shows the empty message without a CTA when the user cannot manage sellers', async () => {
    const viewer = { ...SELLER_USER, role: 'VIEWER', sellerId: null, permissions: ['sellers.read'] };
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(viewer));
    window.history.pushState({}, '', '/vendedores');
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/auth/me': { user: viewer },
        '/sellers': { items: [], page: 1, pageSize: 20, total: 0 },
      }),
    );

    render(<App />);

    expect(await screen.findByText('Nenhum vendedor encontrado.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Novo vendedor' })).toBeNull();
  });

  it('drops the success note when the next action fails', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
    window.history.pushState({}, '', '/clientes');
    const customer = {
      id: 'cust-1',
      name: 'Maria Silva',
      status: 'ACTIVE',
      email: null,
      cpf: null,
      phone: null,
      responsible_seller_id: null,
      responsible_seller_name: null,
    };
    const base = mockFetch({
      '/auth/me': { user: SESSION.user },
      '/customers': { items: [customer], page: 1, pageSize: 20, total: 1 },
    });
    let patchCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (callUrl(input).includes('/customers/cust-1') && init?.method === 'PATCH') {
          patchCalls += 1;
          const ok = patchCalls === 1;
          return Promise.resolve(
            new Response(JSON.stringify(ok ? {} : { error: 'Falha simulada' }), {
              status: ok ? 200 : 500,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
        return base(input, init);
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Desativar' }));
    expect(await screen.findByText('Cliente desativado.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }));
    expect(await screen.findByText('Falha simulada')).toBeInTheDocument();
    expect(screen.queryByText('Cliente desativado.')).toBeNull();
  });
});
