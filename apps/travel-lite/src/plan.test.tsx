import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { HELP_ARTICLES, HELP_FAQ, helpMatch } from './helpContent';
import {
  CAPABILITIES,
  CURRENT_PLAN,
  PLAN_ORDER,
  buildUpgradeSummary,
  capabilityByKey,
  limitedInCurrentPlan,
  upgradeSummary,
} from './planCapabilities';

const MASTER = {
  id: 'user-1',
  tenantId: 'tenant-1',
  name: 'Admin Teste',
  email: 'admin@teste.dev',
  role: 'MASTER',
  sellerId: null,
  permissions: [
    'users.manage', 'permissions.manage', 'dashboard.configure', 'settings.manage', 'imports.manage',
    'customers.create', 'customers.read_all', 'sales.read_all', 'finance.read',
  ],
};

// Manages the catalogs (settings.manage) but does not manage users or permissions.
const MANAGER = {
  ...MASTER,
  id: 'user-4',
  name: 'Gerente Teste',
  role: 'MANAGER',
  permissions: ['settings.manage', 'imports.manage', 'customers.read_all', 'sales.read_all'],
};

const SELLER = {
  id: 'user-2',
  tenantId: 'tenant-1',
  name: 'Vendedora Teste',
  email: 'vend@teste.dev',
  role: 'SELLER',
  sellerId: 'seller-2',
  permissions: ['customers.create', 'customers.read_own', 'sales.read_own'],
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

type User = typeof MASTER | typeof SELLER | typeof VIEWER | typeof MANAGER;

const BRANDING = {
  displayName: 'Gadotti Viagens',
  welcomeText: null,
  primaryColor: null,
  secondaryColor: null,
  loginBackground: null,
  logoDataUrl: null,
};

const DASHBOARD = {
  can_configure: false,
  widgets: [{ key: 'sales_month', title: 'Vendas do mês', kind: 'kpi', data: { value: 1, format: 'count' } }],
};

const PLAN_CAPABILITIES = {
  plan: CURRENT_PLAN,
  capabilities: CAPABILITIES,
};

interface Call {
  method: string;
  url: string;
}

function mockApi(user: User, extra: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const routes: Record<string, unknown> = {
    '/auth/me': { user },
    '/branding': { branding: BRANDING },
    '/dashboard': DASHBOARD,
    '/plan/capabilities': PLAN_CAPABILITIES,
    '/access/catalog': { roles: [], permissions: [], groups: [] },
    '/users': { items: [] },
    ...extra,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push({ method: init?.method ?? 'GET', url: raw });
      const body = routes[raw.replace(/^\/api/, '').split('?')[0] ?? ''];
      if (body === undefined) return Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }));
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    }),
  );
  return calls;
}

function signIn(user: User, path: string) {
  window.localStorage.setItem('travel_lite_token', 'v1.token');
  window.localStorage.setItem('travel_lite_token_user', JSON.stringify(user));
  window.history.pushState({}, '', path);
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('capability catalog', () => {
  it('follows the documented Lite / Pro / Full matrix', () => {
    const row = (key: string) => PLAN_ORDER.map((plan) => capabilityByKey(key)?.plans[plan].label);
    expect(CAPABILITIES.map((capability) => capability.key)).toEqual([
      'clientes', 'vendas', 'financeiro', 'importacao', 'dashboard', 'mobile', 'branding', 'integracoes', 'migracao',
    ]);
    expect(row('clientes')).toEqual(['Sim', 'Sim', 'Sim']);
    expect(row('importacao')).toEqual(['Sim, limitada', 'Sim', 'Sim']);
    expect(row('dashboard')).toEqual(['Essencial', 'Avançado', 'Completo']);
    expect(row('mobile')).toEqual(['Consulta + cliente rápido', 'Operação ampliada', 'Completo']);
    expect(row('branding')).toEqual(['Básico', 'Avançado', 'Completo']);
    expect(row('integracoes')).toEqual(['Preparado', 'Parcial', 'Completo']);
    expect(row('migracao')).toEqual(['Readiness', 'Assistida', 'Nativo']);
  });

  it('keeps the Lite fully operational for the daily work', () => {
    expect(CURRENT_PLAN).toBe('LITE');
    for (const key of ['clientes', 'vendas', 'financeiro']) {
      expect(capabilityByKey(key)?.plans.LITE.level).toBe('full');
    }
    expect(limitedInCurrentPlan().map((capability) => capability.key)).toEqual([
      'importacao', 'dashboard', 'mobile', 'branding', 'integracoes', 'migracao',
    ]);
    for (const capability of CAPABILITIES) expect(capability.plans.FULL.level).toBe('full');
  });

  it('describes where a reduced capability grows, without inventing numbers', () => {
    expect(upgradeSummary(capabilityByKey('dashboard')!)).toBe('no Pro: Avançado · no Full: Completo');
    const summary = buildUpgradeSummary('Gadotti Viagens');
    expect(summary).toContain('Gadotti Viagens');
    expect(summary).toContain('Plano atual: Lite');
    expect(summary).toContain('Dashboard: Essencial');
    expect(summary).toContain('a combinar');
    expect(summary).not.toMatch(/R\$|\d+\s*(clientes|vendas|usuários)/i);
    expect(buildUpgradeSummary(null)).not.toContain('—');
  });
});

describe('Recursos do plano page', () => {
  it('shows the matrix to every signed-in profile, read-only and without admin actions', async () => {
    for (const user of [SELLER, VIEWER]) {
      window.localStorage.clear();
      signIn(user, '/plano');
      mockApi(user);
      const { unmount } = render(<App />);

      expect(await screen.findByRole('heading', { name: 'Recursos do plano' })).toBeInTheDocument();
      const table = screen.getByRole('table');
      expect(within(table).getAllByRole('row')).toHaveLength(CAPABILITIES.length + 1);
      expect(within(table).getByText('Dashboard')).toBeInTheDocument();
      expect(within(table).getByText('Essencial')).toBeInTheDocument();
      expect(screen.getByText(/seu plano/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Copiar resumo/ })).toBeNull();
      expect(screen.getByText(/Fale com o administrador da agência/)).toBeInTheDocument();
      unmount();
    }
  });

  it('offers the copy action only to who manages users or permissions', async () => {
    signIn(MANAGER, '/plano');
    mockApi(MANAGER);
    render(<App />);

    await screen.findByRole('heading', { name: 'Recursos do plano' });
    expect(screen.queryByRole('button', { name: /Copiar resumo/ })).toBeNull();
    expect(screen.getByText(/Fale com o administrador da agência/)).toBeInTheDocument();
  });

  it('copies a text summary for a MASTER and sends nothing anywhere', async () => {
    signIn(MASTER, '/plano');
    const calls = mockApi(MASTER);
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    render(<App />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Copiar resumo/ })).toBeInTheDocument());
    // Let the branding load, so the summary carries the agency name.
    await waitFor(() => expect(calls.some((call) => call.url.includes('/branding'))).toBe(true));
    await screen.findByText('Gadotti Viagens');
    fireEvent.click(screen.getByRole('button', { name: /Copiar resumo/ }));

    expect(await screen.findByText(/Resumo copiado/)).toBeInTheDocument();
    const copied = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(copied).toContain('Plano atual: Lite');
    expect(copied).toContain('Gadotti Viagens');
    // Only session, branding and plan-contract reads: no write or contact endpoint.
    expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
    expect(calls.every((call) => /\/(auth\/me|branding|plan\/capabilities)/.test(call.url))).toBe(true);
  });

  it('falls back to a text box when the clipboard is not available', async () => {
    signIn(MASTER, '/plano');
    mockApi(MASTER);
    stubClipboard(() => Promise.reject(new Error('denied')));
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Copiar resumo/ }));

    const box = await screen.findByLabelText(/Copie o texto abaixo/);
    expect(box).toHaveAttribute('readonly');
    expect((box as HTMLTextAreaElement).value).toContain('Plano atual: Lite');
  });

  it('stays informational: no prices, checkout or unlock controls', async () => {
    signIn(MASTER, '/plano');
    mockApi(MASTER);
    render(<App />);

    const heading = await screen.findByRole('heading', { name: 'Recursos do plano' });
    const page = heading.closest('.lite-plan') as HTMLElement;
    // "pagamentos" is a domain word (the finance capability); billing words are what must be absent.
    expect(page.textContent).not.toMatch(/R\$|comprar|contratar|checkout|assinar|cartão|boleto|desbloquear/i);
    expect(page.textContent).toContain('Esta tela só informa');
    expect(within(page).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Copiar resumo para o responsável',
    ]);
  });

  it('turns the matrix into labelled cards on small screens', async () => {
    signIn(SELLER, '/plano');
    mockApi(SELLER);
    render(<App />);

    const table = await screen.findByRole('table');
    expect(table).toHaveClass('lite-stack');
    const row = table.querySelector('tbody tr')!;
    expect([...row.querySelectorAll('td')].map((cell) => cell.getAttribute('data-label'))).toEqual([
      'Recurso', 'Lite', 'Pro', 'Full',
    ]);
    expect(row.querySelector('td.lite-card-title')).toBeInTheDocument();
  });

  it('requires a session', async () => {
    window.history.pushState({}, '', '/plano');
    mockApi(SELLER);
    render(<App />);
    expect(await screen.findByText('Entre com o acesso da agência')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });
});

describe('quiet plan hints in the daily screens', () => {
  it('shows the dashboard hint to everyone and links to the matching row', async () => {
    signIn(SELLER, '/');
    mockApi(SELLER);
    render(<App />);

    await screen.findByText('Vendas do mês');
    const hint = document.querySelector('.lite-plan-hint[data-capability="dashboard"]') as HTMLElement;
    expect(hint).toBeInTheDocument();
    expect(hint.textContent).toContain('Essencial');
    expect(within(hint).getByRole('link', { name: 'Ver recursos do plano' })).toHaveAttribute('href', '/plano#dashboard');
    expect(within(hint).queryByRole('button')).toBeNull();
  });

  it('adds the import hint without taking anything away from the import screen', async () => {
    signIn(MASTER, '/importacoes');
    mockApi(MASTER);
    render(<App />);

    await screen.findByText(/Arquivo CSV ou XLSX/);
    const hint = document.querySelector('.lite-plan-hint[data-capability="importacao"]') as HTMLElement;
    expect(hint.textContent).toContain('Sim, limitada');
    expect(hint.textContent).not.toMatch(/\d/);
    expect(screen.getByText(/Arquivo CSV ou XLSX/)).toBeInTheDocument();
  });

  it('adds the branding hint and a plan link to Settings, keeping the editor usable', async () => {
    signIn(MASTER, '/configuracoes');
    mockApi(MASTER);
    render(<App />);

    expect(await screen.findByLabelText('Nome fantasia')).toBeEnabled();
    const hint = document.querySelector('.lite-plan-hint[data-capability="branding"]') as HTMLElement;
    expect(hint.textContent).toContain('Básico');
    expect(screen.getByRole('button', { name: 'Salvar identidade visual' })).toBeEnabled();
    expect(screen.getByRole('heading', { name: 'Plano e recursos' })).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Ver recursos do plano' });
    expect(links.some((link) => link.getAttribute('href') === '/plano')).toBe(true);
  });

  it('never renders a hint for a capability that is complete in the plan', () => {
    // Guard on the data: hints are only built from reduced capabilities.
    expect(capabilityByKey('clientes')?.plans[CURRENT_PLAN].level).toBe('full');
    expect(limitedInCurrentPlan().some((capability) => capability.key === 'clientes')).toBe(false);
  });
});

describe('help integration', () => {
  it('adds a plans article with a link to the matrix and keeps it searchable', async () => {
    const article = HELP_ARTICLES.find((entry) => entry.id === 'planos');
    expect(article).toBeDefined();
    expect(article?.link).toEqual({ to: '/plano', label: 'Abrir Recursos do plano' });
    expect(helpMatch(article!, 'plano')).toBe(true);
    expect(helpMatch(article!, 'upgrade')).toBe(true);
    expect(helpMatch(article!, 'planos e recursos')).toBe(true);

    signIn(SELLER, '/ajuda');
    mockApi(SELLER);
    render(<App />);
    const section = (await screen.findByRole('heading', { name: 'Planos e recursos' })).closest('section') as HTMLElement;
    expect(within(section).getByRole('link', { name: 'Abrir Recursos do plano' })).toHaveAttribute('href', '/plano');
    expect(section.textContent).toContain('só informa');
    expect(section.textContent).not.toMatch(/R\$|checkout/i);
  });

  it('no longer calls the visual identity a future step', () => {
    const everything = [
      ...HELP_ARTICLES.map((entry) => JSON.stringify(entry)),
      ...HELP_FAQ.map((entry) => JSON.stringify(entry)),
    ].join(' ');
    expect(everything).not.toMatch(/etapa planejada|planejada como etapa|está planejada/);
    const logo = HELP_FAQ.find((entry) => entry.question.includes('logo'));
    expect(logo?.answer).toContain('Configurações › Identidade visual');
  });
});
