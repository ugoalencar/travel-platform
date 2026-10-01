import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const SESSION = {
  token: 'v1.tenant.user.deadbeef',
  user: {
    id: 'user-1',
    tenantId: 'tenant-1',
    name: 'Admin Teste',
    email: 'admin@teste.dev',
    role: 'ADMIN',
  },
};

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

  it('logs in and shows the dashboard with the eight menu entries', async () => {
    const fetchMock = mockFetch({
      '/auth/login': SESSION,
      '/dashboard': {
        sales_this_month: { count: 2, gross_amount: 1500, margin_amount: 300 },
        commissions: { pending_count: 1, pending_amount: 100, pending_rule_count: 0 },
        receivables: { open_amount: 900, overdue_amount: 0, overdue_count: 0 },
        payables: { open_amount: 0, overdue_amount: 0, overdue_count: 0 },
        accounts: [{ id: 'acc-1', name: 'Banco', type: 'BANK', balance: 100 }],
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('Entre com o acesso da agência')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Agência'), { target: { value: 'gadotti' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'admin@teste.dev' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Vendas no mês')).toBeInTheDocument();
    expect(screen.getByText('Admin Teste')).toBeInTheDocument();

    const menuLinks = screen.getAllByRole('link');
    const menuLabels = menuLinks.map((link) => link.textContent);
    expect(menuLabels).toEqual([
      'Dashboard',
      'Clientes',
      'Vendedores',
      'Vendas',
      'Comissões',
      'Financeiro',
      'Relatórios',
      'Cadastros',
    ]);
  });

  it('keeps the session across reloads', async () => {
    window.localStorage.setItem('travel_lite_token', SESSION.token);
    window.localStorage.setItem('travel_lite_token_user', JSON.stringify(SESSION.user));
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/dashboard': {
          sales_this_month: { count: 0, gross_amount: 0, margin_amount: 0 },
          commissions: { pending_count: 0, pending_amount: 0, pending_rule_count: 0 },
          receivables: { open_amount: 0, overdue_amount: 0, overdue_count: 0 },
          payables: { open_amount: 0, overdue_amount: 0, overdue_count: 0 },
          accounts: [],
        },
      }),
    );

    render(<App />);

    expect(await screen.findByText('Vendas no mês')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Admin Teste')).toBeInTheDocument());
  });
});
