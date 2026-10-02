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
    window.sessionStorage.clear();
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
      // Quiet plan hint at the end of the dashboard (Lite shows an essential dashboard).
      'Ver recursos do plano',
      // Mobile quick-add shortcut (hidden by CSS on desktop), for users who can create customers.
      '+ Cliente',
    ]);
  });

  it('requires a new password on first login before opening the app', async () => {
    // /auth/login behaves differently depending on which password was sent
    // (temporary vs. the one just created), the way the real backend does.
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = callUrl(input);
      const path = url.replace(/^\/api/, '').split('?')[0] ?? '';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as { password?: string }) : {};
      const json = (payload: unknown) =>
        Promise.resolve(
          new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }),
        );
      if (path === '/auth/login') {
        return body.password === 'temporaria-123'
          ? json({ passwordChangeRequired: true })
          : json({ sessionToken: 'v1.tenant.user.changed', user: SESSION.user });
      }
      if (path === '/auth/change-required-password') return json({ ok: true });
      if (path === '/dashboard') return json(dashboard(true, 2));
      return Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('Entre com o acesso da agência')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Agência'), { target: { value: 'gadotti' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'admin@teste.dev' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'temporaria-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Criar nova senha' })).toBeInTheDocument();
    expect(screen.queryByText('Vendas do mês')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'senha-definitiva-123' } });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'outra-senha-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));
    expect(await screen.findByText('A confirmação não confere com a nova senha.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'senha-definitiva-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));

    expect(await screen.findByText('Vendas do mês')).toBeInTheDocument();
    const changeCall = fetchMock.mock.calls.find((call) => callUrl(call[0]).includes('/auth/change-required-password'));
    expect(changeCall?.[1]?.body).toBe(
      JSON.stringify({
        slug: 'gadotti',
        email: 'admin@teste.dev',
        currentPassword: 'temporaria-123',
        newPassword: 'senha-definitiva-123',
      }),
    );
    // Re-authenticates with the new password to obtain a real session,
    // instead of trusting any token echoed back by the change endpoint.
    const loginCalls = fetchMock.mock.calls.filter((call) => callUrl(call[0]).includes('/auth/login'));
    expect(loginCalls).toHaveLength(2);
    expect(JSON.parse(loginCalls[1]?.[1]?.body as string)).toMatchObject({ password: 'senha-definitiva-123' });
  });

  it('shows a SELLER only the authorized menus and no dashboard configuration', async () => {
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(SELLER_USER));
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
      // Quiet plan hint at the end of the dashboard (Lite shows an essential dashboard).
      'Ver recursos do plano',
      // Mobile quick-add shortcut (hidden by CSS on desktop), for users who can create customers.
      '+ Cliente',
    ]);
  });

  it('keeps the session and explains denied URLs in place instead of redirecting', async () => {
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(SELLER_USER));
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
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
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
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
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
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
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
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
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
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
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
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
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
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
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
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
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
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(SELLER_USER));
    window.history.pushState({}, '', '/ajuda');
    vi.stubGlobal('fetch', mockFetch({ '/auth/me': { user: SELLER_USER } }));

    const authenticated = render(<App />);
    expect(await screen.findByRole('heading', { name: 'Ajuda' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/ajuda');
    expect(window.localStorage.getItem('travel_lite_help_seen')).toBe('1');
    authenticated.unmount();

    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.pushState({}, '', '/ajuda');
    render(<App />);
    expect(await screen.findByText('Entre com o acesso da agência')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it('filters the help center with the simple search', async () => {
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(SELLER_USER));
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
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
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

  it('lets an admin reset a user password and copy the temporary password once', async () => {
    const otherUser = {
      id: 'user-2',
      name: 'Ana Souza',
      email: 'ana@teste.dev',
      role: 'SELLER',
      status: 'ACTIVE',
      seller_id: 'sel-1',
      seller_name: 'Ana Souza',
      is_self: false,
      overrides: [],
    };
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
    window.history.pushState({}, '', '/configuracoes');
    const fetchMock = mockFetch({
      '/auth/me': { user: SESSION.user },
      '/access/catalog': {
        roles: [
          { key: 'MASTER', name: 'MASTER', grants_all: true, assignable: false, permissions: [] },
          { key: 'SELLER', name: 'Vendedor', grants_all: false, assignable: true, permissions: [] },
        ],
        permissions: [],
      },
      '/users': { items: [otherUser] },
      '/users/user-2/reset-password': { temporaryPassword: 'Temp-123456' },
      '/sellers': { items: [{ id: 'sel-1', name: 'Ana Souza', user_id: 'user-2' }], total: 1 },
      '/financial-accounts': { items: [{ id: 'acc-1' }] },
      '/categories': { items: [{ id: 'cat-1' }] },
      '/customers': { items: [{ id: 'cust-1' }] },
      '/sales': { items: [{ id: 'sale-1' }] },
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    vi.stubGlobal('fetch', fetchMock);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Configurações · Usuários e permissões' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Redefinir a senha de "Ana Souza"? A senha atual deixará de funcionar e uma senha temporária será exibida uma única vez.',
    );
    expect(await screen.findByRole('heading', { name: 'Senha temporária gerada' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Temp-123456')).toBeInTheDocument();
    expect(screen.getByText(/deve alterar no primeiro acesso/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copiar senha' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Temp-123456'));
    expect(await screen.findByText('Senha temporária copiada.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByDisplayValue('Temp-123456')).toBeNull();
  });

  it('shows a SELLER only the checklist step they can act on', async () => {
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(SELLER_USER));
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
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
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
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(viewer));
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
    window.sessionStorage.setItem('travel_lite_token', SESSION.token);
    window.sessionStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
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

describe('forgot/reset password (public flow)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers "Esqueci minha senha" from the login screen, carrying the agência along', async () => {
    window.history.pushState({}, '', '/login?agencia=gadotti');
    vi.stubGlobal('fetch', mockFetch({ '/branding/public': { branding: {} } }));

    render(<App />);

    const link = await screen.findByRole('link', { name: 'Esqueci minha senha' });
    expect(link).toHaveAttribute('href', '/forgot-password?agencia=gadotti');
    fireEvent.click(link);

    expect(await screen.findByRole('heading', { name: 'Esqueci minha senha' })).toBeInTheDocument();
    expect(screen.getByLabelText('Agência')).toHaveValue('gadotti');
  });

  it('always shows the same generic message, whether or not the request "succeeds"', async () => {
    window.history.pushState({}, '', '/forgot-password');
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(JSON.parse((init?.body as string | undefined) ?? '{}') as Record<string, unknown>);
        return Promise.resolve(
          new Response(JSON.stringify({ message: 'Se os dados estiverem corretos, enviaremos instruções para o e-mail cadastrado.' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }),
    );

    render(<App />);

    fireEvent.change(screen.getByLabelText('Agência'), { target: { value: 'gadotti' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'alguem@teste.dev' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instruções' }));

    expect(
      await screen.findByText('Se os dados estiverem corretos, enviaremos instruções para o e-mail cadastrado.'),
    ).toBeInTheDocument();
    expect(calls).toEqual([{ slug: 'gadotti', email: 'alguem@teste.dev' }]);
    expect(screen.getByRole('link', { name: 'Voltar ao login' })).toHaveAttribute('href', '/login');
  });

  it('shows the generic message even when the backend answers with an error, never a different one', async () => {
    window.history.pushState({}, '', '/forgot-password');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: 'boom' }), { status: 500 }))),
    );

    render(<App />);

    fireEvent.change(screen.getByLabelText('Agência'), { target: { value: 'gadotti' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'alguem@teste.dev' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instruções' }));

    expect(
      await screen.findByText('Se os dados estiverem corretos, enviaremos instruções para o e-mail cadastrado.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('boom')).toBeNull();
  });

  it('shows a distinct message only for rate limiting, which carries no account-existence signal', async () => {
    window.history.pushState({}, '', '/forgot-password');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'Muitas tentativas. Tente novamente mais tarde.', code: 'RATE_LIMITED' }), {
            status: 429,
          }),
        ),
      ),
    );

    render(<App />);

    fireEvent.change(screen.getByLabelText('Agência'), { target: { value: 'gadotti' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'alguem@teste.dev' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instruções' }));

    expect(await screen.findByText('Muitas tentativas. Aguarde alguns minutos e tente novamente.')).toBeInTheDocument();
    expect(
      screen.queryByText('Se os dados estiverem corretos, enviaremos instruções para o e-mail cadastrado.'),
    ).toBeNull();
  });

  it('asks for a new link when /reset-password is opened without a token', async () => {
    window.history.pushState({}, '', '/reset-password');
    vi.stubGlobal('fetch', mockFetch({}));

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Link inválido' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Esqueci minha senha' })).toHaveAttribute('href', '/forgot-password');
  });

  it('validates the new password client-side before calling the API', async () => {
    window.history.pushState({}, '', '/reset-password?token=abc123');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'curta' } });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'curta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Definir nova senha' }));
    expect(await screen.findByText('A nova senha deve ter no mínimo 8 caracteres.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'senha-longa-123' } });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'outra-coisa-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Definir nova senha' }));
    expect(await screen.findByText('A confirmação não confere com a nova senha.')).toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits the token from the URL and shows success without ever displaying it', async () => {
    window.history.pushState({}, '', '/reset-password?token=raw-token-xyz');
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(JSON.parse((init?.body as string | undefined) ?? '{}') as Record<string, unknown>);
        return Promise.resolve(
          new Response(
            JSON.stringify({ message: 'Senha redefinida com sucesso. Todas as sessões anteriores foram encerradas.' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      }),
    );

    render(<App />);

    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'senha-definitiva-999' } });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'senha-definitiva-999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Definir nova senha' }));

    expect(await screen.findByText(/Senha redefinida com sucesso/)).toBeInTheDocument();
    expect(calls).toEqual([{ token: 'raw-token-xyz', newPassword: 'senha-definitiva-999' }]);
    expect(screen.queryByText('raw-token-xyz')).toBeNull();
  });

  it('shows the backend error for an invalid or expired token', async () => {
    window.history.pushState({}, '', '/reset-password?token=expired-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'Link de redefinição inválido ou expirado', code: 'NOT_FOUND' }), {
            status: 404,
          }),
        ),
      ),
    );

    render(<App />);

    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'senha-definitiva-999' } });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'senha-definitiva-999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Definir nova senha' }));

    expect(await screen.findByText('Link de redefinição inválido ou expirado')).toBeInTheDocument();
  });
});
