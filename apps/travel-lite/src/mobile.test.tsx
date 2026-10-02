import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const MASTER = {
  id: 'user-1',
  tenantId: 'tenant-1',
  name: 'Admin Teste',
  email: 'admin@teste.dev',
  role: 'MASTER',
  sellerId: null,
  permissions: [
    'customers.create', 'customers.read_all', 'customers.update_all', 'sales.read_all', 'sales.create',
    'sellers.read', 'finance.read', 'settings.manage', 'dashboard.configure',
  ],
};

const SELLER = {
  id: 'user-2',
  tenantId: 'tenant-1',
  name: 'Vendedora Teste',
  email: 'vend@teste.dev',
  role: 'SELLER',
  sellerId: 'seller-2',
  permissions: ['customers.create', 'customers.read_own', 'customers.update_own', 'sales.read_own'],
};

const VIEWER = {
  id: 'user-3',
  tenantId: 'tenant-1',
  name: 'Leitora Teste',
  email: 'leitora@teste.dev',
  role: 'VIEWER',
  sellerId: null,
  permissions: ['customers.read_all', 'sales.read_all'],
};

type User = typeof MASTER | typeof SELLER | typeof VIEWER;

const CUSTOMER = {
  id: 'cust-1',
  name: 'Maria Silva',
  status: 'ACTIVE',
  email: 'maria@exemplo.test',
  cpf: null,
  phone: '(11) 99999-0000',
  responsible_seller_id: 'seller-2',
  responsible_seller_name: 'Vendedora Teste',
};

const SALE = {
  id: 'sale-1',
  sale_number: 'VND-0001',
  status: 'CONFIRMED',
  sale_date: '2026-10-01',
  due_date: '2026-10-31',
  gross_amount: 1000,
  cost_amount: 200,
  margin_amount: 800,
  installment_count: 1,
  customer: { id: 'cust-1', name: 'Maria Silva' },
  seller: { id: 'seller-2', name: 'Vendedora Teste' },
  category: { id: 'cat-1', name: 'Passagens' },
};

function dashboard() {
  return {
    can_configure: false,
    widgets: [
      { key: 'sales_month', title: 'Vendas do mês', kind: 'kpi', data: { value: 2, format: 'count' } },
      {
        key: 'seller_ranking',
        title: 'Ranking de vendedores no mês',
        kind: 'table',
        data: { rows: [{ seller_name: 'Vendedora Teste', sales_count: 2, gross_amount: 1500, margin_amount: 300 }] },
      },
    ],
  };
}

function mockApi(routes: Record<string, unknown>) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      urls.push(raw);
      const body = routes[raw.replace(/^\/api/, '').split('?')[0] ?? ''];
      if (body === undefined) return Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }));
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    }),
  );
  return urls;
}

function signIn(user: User, path: string) {
  window.localStorage.setItem('travel_lite_token', 'v1.token');
  window.localStorage.setItem('travel_lite_token_user', JSON.stringify(user));
  window.history.pushState({}, '', path);
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mobile navigation drawer', () => {
  async function openApp() {
    signIn(MASTER, '/ajuda');
    mockApi({ '/auth/me': { user: MASTER }, '/branding': { branding: {} } });
    render(<App />);
    return screen.findByRole('button', { name: 'Abrir menu' });
  }

  it('starts closed and opens from the topbar button', async () => {
    const toggle = await openApp();
    const sidebar = document.getElementById('lite-sidebar')!;

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'lite-sidebar');
    expect(sidebar).not.toHaveClass('open');
    expect(screen.queryByTestId('menu-scrim')).toBeNull();

    fireEvent.click(toggle);

    const opened = screen.getByRole('button', { name: 'Fechar menu' });
    expect(opened).toHaveAttribute('aria-expanded', 'true');
    expect(sidebar).toHaveClass('open');
    expect(screen.getByTestId('menu-scrim')).toBeInTheDocument();
  });

  it('closes when a menu entry is chosen', async () => {
    fireEvent.click(await openApp());
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Menu principal' })).getByRole('link', { name: 'Vendas' }));

    await waitFor(() => expect(window.location.pathname).toBe('/vendas'));
    await waitFor(() => expect(document.getElementById('lite-sidebar')).not.toHaveClass('open'));
    expect(screen.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes with Escape and by tapping the scrim', async () => {
    fireEvent.click(await openApp());
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.getElementById('lite-sidebar')).not.toHaveClass('open'));

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    fireEvent.click(screen.getByTestId('menu-scrim'));
    await waitFor(() => expect(document.getElementById('lite-sidebar')).not.toHaveClass('open'));
  });

  it('keeps the help link reachable in the topbar', async () => {
    await openApp();
    expect(screen.getByRole('link', { name: 'Ajuda' })).toHaveAttribute('href', '/ajuda');
    expect(screen.getByRole('heading', { name: 'Ajuda' })).toBeInTheDocument();
  });

  it('only lists menus the user is allowed to see, also inside the drawer', async () => {
    signIn(SELLER, '/ajuda');
    mockApi({ '/auth/me': { user: SELLER }, '/branding': { branding: {} } });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir menu' }));

    const labels = within(screen.getByRole('navigation', { name: 'Menu principal' }))
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels).toEqual(['Dashboard', 'Vendas', 'Clientes']);
  });
});

describe('quick customer add', () => {
  it('shows the "+ Cliente" shortcut only to users who can create customers', async () => {
    signIn(VIEWER, '/ajuda');
    mockApi({ '/auth/me': { user: VIEWER }, '/branding': { branding: {} } });
    render(<App />);
    await screen.findByRole('heading', { name: 'Ajuda' });
    expect(screen.queryByRole('link', { name: 'Novo cliente' })).toBeNull();
  });

  it('opens the quick form from the shortcut and drops the query parameter', async () => {
    signIn(SELLER, '/ajuda');
    mockApi({
      '/auth/me': { user: SELLER },
      '/branding': { branding: {} },
      '/customers': { items: [], page: 1, pageSize: 20, total: 0 },
    });
    render(<App />);

    const shortcut = await screen.findByRole('link', { name: 'Novo cliente' });
    expect(shortcut).toHaveAttribute('href', '/clientes?novo=1');
    fireEvent.click(shortcut);

    const form = (await screen.findByLabelText('Nome *')).closest('form')!;
    expect(form).toHaveAttribute('data-quick', 'true');
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(window.location.pathname).toBe('/clientes');
  });

  it('keeps only name, phone and e-mail in the quick form and reveals the rest on demand', async () => {
    signIn(SELLER, '/clientes?novo=1');
    mockApi({
      '/auth/me': { user: SELLER },
      '/branding': { branding: {} },
      '/customers': { items: [], page: 1, pageSize: 20, total: 0 },
    });
    render(<App />);

    const form = (await screen.findByLabelText('Nome *')).closest('form')!;
    const essential = ['Nome *', 'Telefone', 'E-mail'];
    for (const label of essential) {
      expect(within(form).getByText(label).closest('label')).not.toHaveClass('lite-more');
    }
    for (const label of ['CPF', 'WhatsApp', 'CEP', 'Cidade', 'Observações']) {
      expect(within(form).getByText(label).closest('label')).toHaveClass('lite-more');
    }
    // Only the name is required, so the quick form can be submitted with three fields.
    expect(within(form).getByLabelText('Nome *')).toBeRequired();
    expect(form.querySelectorAll('[required]')).toHaveLength(1);

    const toggle = within(form).getByRole('button', { name: 'Mais campos' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(form).toHaveAttribute('data-quick', 'false');
    expect(within(form).getByRole('button', { name: 'Menos campos' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens the full form when editing an existing customer', async () => {
    signIn(SELLER, '/clientes');
    mockApi({
      '/auth/me': { user: SELLER },
      '/branding': { branding: {} },
      '/customers': { items: [CUSTOMER], page: 1, pageSize: 20, total: 1 },
    });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));

    const form = (await screen.findByLabelText('Nome *')).closest('form')!;
    expect(form).toHaveAttribute('data-quick', 'false');
    expect(within(form).queryByRole('button', { name: /campos/ })).toBeNull();
  });

  it('ignores ?novo=1 for a user who cannot create customers', async () => {
    signIn(VIEWER, '/clientes?novo=1');
    mockApi({
      '/auth/me': { user: VIEWER },
      '/branding': { branding: {} },
      '/customers': { items: [CUSTOMER], page: 1, pageSize: 20, total: 1 },
    });
    render(<App />);

    await screen.findByText('Maria Silva');
    expect(screen.queryByLabelText('Nome *')).toBeNull();
    await waitFor(() => expect(window.location.search).toBe(''));
  });
});

describe('own customers and sales as cards', () => {
  it('labels every customer cell so the list can stack into cards, without widening the request scope', async () => {
    signIn(SELLER, '/clientes');
    const urls = mockApi({
      '/auth/me': { user: SELLER },
      '/branding': { branding: {} },
      '/customers': { items: [CUSTOMER], page: 1, pageSize: 20, total: 1 },
    });
    render(<App />);

    const row = (await screen.findByText('Maria Silva')).closest('tr')!;
    expect(row.closest('table')).toHaveClass('lite-stack');
    const labels = [...row.querySelectorAll('td')].map((cell) => cell.getAttribute('data-label'));
    expect(labels).toEqual(['Nome', 'E-mail', 'CPF', 'Telefone', 'Responsável', 'Status', 'Ações']);
    expect(row.querySelector('td.lite-card-title')).toHaveTextContent('Maria Silva');
    // The mobile layout never adds seller or tenant filters: scope stays with the API.
    for (const url of urls.filter((entry) => entry.includes('/customers'))) {
      expect(url).not.toMatch(/seller|tenant/i);
    }
  });

  it('labels every sale cell and keeps the detail button reachable', async () => {
    signIn(SELLER, '/vendas');
    const urls = mockApi({
      '/auth/me': { user: SELLER },
      '/branding': { branding: {} },
      '/sales': { items: [SALE], page: 1, pageSize: 20, total: 1 },
    });
    render(<App />);

    const row = (await screen.findByText('VND-0001')).closest('tr')!;
    expect(row.closest('table')).toHaveClass('lite-stack');
    expect([...row.querySelectorAll('td')].map((cell) => cell.getAttribute('data-label'))).toEqual([
      'Número', 'Data', 'Cliente', 'Vendedor', 'Bruto', 'Margem', 'Status', 'Ações',
    ]);
    expect(within(row).getByRole('button', { name: 'Detalhe' })).toBeInTheDocument();
    for (const url of urls.filter((entry) => entry.includes('/sales'))) {
      expect(url).not.toMatch(/seller|tenant/i);
    }
  });
});

describe('dashboard summary on small screens', () => {
  it('starts with the KPIs and opens the charts and rankings on demand', async () => {
    signIn(MASTER, '/');
    mockApi({ '/auth/me': { user: MASTER }, '/branding': { branding: {} }, '/dashboard': dashboard() });
    render(<App />);

    expect(await screen.findByText('Vendas do mês')).toBeInTheDocument();
    const panels = document.querySelector('.lite-dash-detail')!;
    expect(panels).toHaveAttribute('data-expanded', 'false');

    const toggle = screen.getByRole('button', { name: 'Ver gráficos e rankings' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);

    expect(panels).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Ocultar gráficos e rankings' })).toHaveAttribute('aria-expanded', 'true');
  });
});
