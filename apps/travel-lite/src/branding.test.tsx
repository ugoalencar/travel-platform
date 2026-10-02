import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { brandingVars, darken, DEFAULT_BRANDING, normalizeBranding } from './branding';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHhV0NQAAAABJRU5ErkJggg==';

const GADOTTI = {
  displayName: 'Gadotti Viagens',
  welcomeText: 'Bem-vinda de volta',
  primaryColor: '#1f4e8c',
  secondaryColor: '#0b2545',
  loginBackground: '#eef3fa',
  logoDataUrl: PNG_DATA_URL,
};

const MASTER = {
  id: 'user-1',
  tenantId: 'tenant-1',
  name: 'Admin Teste',
  email: 'admin@teste.dev',
  role: 'MASTER',
  sellerId: null,
  permissions: ['dashboard.configure', 'users.manage', 'permissions.manage', 'settings.manage'],
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

interface Call {
  method: string;
  path: string;
  body: unknown;
}

/** Routes are keyed "METHOD /path"; an unlisted route answers 404. */
function mockApi(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = raw.replace(/^\/api/, '');
    const pathOnly = path.split('?')[0] ?? '';
    const method = init?.method ?? 'GET';
    calls.push({ method, path, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    const handler = routes[`${method} ${pathOnly}`];
    if (handler === undefined) {
      return Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }));
    }
    if (typeof handler === 'function') return Promise.resolve((handler as () => Response)());
    return Promise.resolve(
      new Response(JSON.stringify(handler), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

function signIn(user: typeof MASTER | typeof SELLER) {
  window.localStorage.setItem('travel_lite_token', 'v1.token');
  window.localStorage.setItem('travel_lite_token_user', JSON.stringify(user));
}

const SETTINGS_ROUTES = {
  'GET /access/catalog': { roles: [], permissions: [], groups: [] },
  'GET /users': { items: [] },
  'GET /sellers': { items: [], total: 0 },
};

describe('branding helpers', () => {
  it('drops unsafe or malformed values from an API payload', () => {
    const branding = normalizeBranding({
      displayName: 'x'.repeat(81),
      welcomeText: '  ',
      primaryColor: 'url(//evil.example)',
      secondaryColor: 'red',
      loginBackground: '#12345',
      logoDataUrl: 'https://evil.example/logo.png',
    });
    expect(branding).toEqual(DEFAULT_BRANDING);
    expect(normalizeBranding(null)).toEqual(DEFAULT_BRANDING);
    expect(normalizeBranding({ logoDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }).logoDataUrl).toBeNull();
  });

  it('keeps valid values and normalizes color case', () => {
    expect(normalizeBranding({ ...GADOTTI, primaryColor: '#1F4E8C' })).toEqual(GADOTTI);
  });

  it('only emits CSS variables for colors that are set', () => {
    expect(brandingVars(DEFAULT_BRANDING)).toEqual({});
    expect(brandingVars({ ...DEFAULT_BRANDING, primaryColor: '#1f4e8c' })).toEqual({
      '--lite-primary': '#1f4e8c',
      '--lite-primary-dark': darken('#1f4e8c'),
    });
    expect(brandingVars(GADOTTI)).toMatchObject({ '--lite-sidebar': '#0b2545', '--lite-login-bg': '#eef3fa' });
  });

  it('darkens a color without leaving the #rrggbb format', () => {
    expect(darken('#ffffff', 0.5)).toBe('#808080');
    expect(darken('#000000')).toBe('#000000');
  });
});

describe('login branding', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, '', '/login');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('style');
  });

  it('shows the agency identity chosen by the slug in the link', async () => {
    window.history.pushState({}, '', '/login?agencia=Gadotti');
    const { calls } = mockApi({ 'GET /branding/public': { branding: GADOTTI } });

    const { container } = render(<App />);

    expect(await screen.findByRole('heading', { name: 'Gadotti Viagens' })).toBeInTheDocument();
    expect(screen.getByText('Bem-vinda de volta')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Logo Gadotti Viagens' })).toHaveAttribute('src', PNG_DATA_URL);
    const wrapper = container.querySelector<HTMLElement>('.lite-center')!;
    expect(wrapper.style.getPropertyValue('--lite-primary')).toBe('#1f4e8c');
    expect(wrapper.style.getPropertyValue('--lite-login-bg')).toBe('#eef3fa');
    // Only the slug is sent; the public call carries no session and no tenant id.
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/branding/public?slug=gadotti' });
  });

  it('previews the branding as the slug is typed', async () => {
    mockApi({ 'GET /branding/public': { branding: GADOTTI } });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Travel Lite' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Agência'), { target: { value: 'gadotti' } });

    expect(await screen.findByRole('heading', { name: 'Gadotti Viagens' })).toBeInTheDocument();
  });

  it('falls back to the default theme when the request fails', async () => {
    window.history.pushState({}, '', '/login?agencia=gadotti');
    const { fetchMock } = mockApi({
      'GET /branding/public': () => new Response('boom', { status: 500 }),
    });

    render(<App />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Travel Lite' })).toBeInTheDocument();
    expect(screen.getByText('Entre com o acesso da agência')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('ignores unsafe values even if the API returned them', async () => {
    window.history.pushState({}, '', '/login?agencia=gadotti');
    mockApi({
      'GET /branding/public': {
        branding: {
          ...GADOTTI,
          primaryColor: 'url(//evil.example/x)',
          loginBackground: 'red; background:url(//evil.example)',
          logoDataUrl: 'https://evil.example/logo.png',
        },
      },
    });

    const { container } = render(<App />);

    expect(await screen.findByRole('heading', { name: 'Gadotti Viagens' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    const wrapper = container.querySelector<HTMLElement>('.lite-center')!;
    expect(wrapper.style.getPropertyValue('--lite-primary')).toBe('');
    expect(wrapper.style.getPropertyValue('--lite-login-bg')).toBe('');
  });

  it('does not call the API for a slug that cannot be valid', async () => {
    window.history.pushState({}, '', '/login?agencia=' + encodeURIComponent("x'; DROP TABLE tenants;--"));
    const { fetchMock } = mockApi({});

    render(<App />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Travel Lite' })).toBeInTheDocument();
  });
});

describe('authenticated shell branding', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, '', '/ajuda');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('style');
  });

  it('applies the tenant name, logo and colors after sign-in', async () => {
    signIn(MASTER);
    mockApi({ 'GET /auth/me': { user: MASTER }, 'GET /branding': { branding: GADOTTI } });

    render(<App />);

    expect(await screen.findByText('Gadotti Viagens')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Logo Gadotti Viagens' })).toBeInTheDocument();
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--lite-primary')).toBe('#1f4e8c'),
    );
    expect(document.documentElement.style.getPropertyValue('--lite-sidebar')).toBe('#0b2545');
  });

  it('keeps the default shell when the tenant has no branding or the read fails', async () => {
    signIn(SELLER);
    mockApi({ 'GET /auth/me': { user: SELLER }, 'GET /branding': () => new Response('{}', { status: 500 }) });

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Ajuda' })).toBeInTheDocument();
    expect(screen.getByText('Travel Lite')).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--lite-primary')).toBe('');
  });
});

describe('branding editor in Settings', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, '', '/configuracoes');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('style');
  });

  it('is not shown to users without dashboard.configure', async () => {
    const manager = { ...MASTER, role: 'ADMIN', permissions: ['users.manage'] };
    signIn(manager);
    mockApi({ ...SETTINGS_ROUTES, 'GET /auth/me': { user: manager }, 'GET /branding': { branding: GADOTTI } });

    render(<App />);

    expect(await screen.findByRole('heading', { name: /Configurações/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Identidade visual' })).toBeNull();
  });

  it('loads the current identity and saves the edits without sending a tenant id or an untouched logo', async () => {
    signIn(MASTER);
    const saved = { ...GADOTTI, displayName: 'Gadotti Turismo' };
    const { calls } = mockApi({
      ...SETTINGS_ROUTES,
      'GET /auth/me': { user: MASTER },
      'GET /branding': { branding: GADOTTI },
      'PUT /branding': { branding: saved },
    });

    render(<App />);

    const nameInput = await screen.findByLabelText('Nome fantasia');
    expect(nameInput).toHaveValue('Gadotti Viagens');
    expect(screen.getByLabelText('Cor primária')).toHaveValue('#1f4e8c');

    fireEvent.change(nameInput, { target: { value: 'Gadotti Turismo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar identidade visual' }));

    expect(await screen.findByText('Identidade visual salva.')).toBeInTheDocument();
    const put = calls.find((call) => call.method === 'PUT' && call.path === '/branding')!;
    expect(put.body).toEqual({
      displayName: 'Gadotti Turismo',
      welcomeText: 'Bem-vinda de volta',
      primaryColor: '#1f4e8c',
      secondaryColor: '#0b2545',
      loginBackground: '#eef3fa',
    });
    // The shell picks up the saved identity immediately.
    expect(await screen.findAllByText('Gadotti Turismo')).not.toHaveLength(0);
  });

  it('shows the API validation error and keeps the form', async () => {
    signIn(MASTER);
    mockApi({
      ...SETTINGS_ROUTES,
      'GET /auth/me': { user: MASTER },
      'GET /branding': { branding: DEFAULT_BRANDING },
      'PUT /branding': () =>
        new Response(JSON.stringify({ error: 'Cor primária é clara demais', code: 'VALIDATION_ERROR' }), { status: 400 }),
    });

    render(<App />);

    fireEvent.change(await screen.findByLabelText('Cor primária'), { target: { value: '#f5f5f5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar identidade visual' }));

    expect(await screen.findByText('Cor primária é clara demais')).toBeInTheDocument();
    expect(screen.getByLabelText('Cor primária')).toHaveValue('#f5f5f5');
  });

  it('refuses a logo that is too large or not an image before calling the API', async () => {
    signIn(MASTER);
    const { calls } = mockApi({
      ...SETTINGS_ROUTES,
      'GET /auth/me': { user: MASTER },
      'GET /branding': { branding: DEFAULT_BRANDING },
    });

    render(<App />);
    const input = await screen.findByLabelText('Logo');

    const big = new File([new Uint8Array(150 * 1024 + 1)], 'logo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText('O logo deve ter até 150 KB.')).toBeInTheDocument();

    const svg = new File(['<svg></svg>'], 'logo.svg', { type: 'image/svg+xml' });
    fireEvent.change(screen.getByLabelText('Logo'), { target: { files: [svg] } });
    expect(await screen.findByText('O logo deve ser uma imagem PNG, JPEG ou WebP.')).toBeInTheDocument();

    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  it('sends a new logo as a data URL and a removal as null', async () => {
    signIn(MASTER);
    const { calls } = mockApi({
      ...SETTINGS_ROUTES,
      'GET /auth/me': { user: MASTER },
      // No stored logo yet: the preview only appears once the chosen file was read.
      'GET /branding': { branding: { ...GADOTTI, logoDataUrl: null } },
      'PUT /branding': { branding: GADOTTI },
    });

    render(<App />);
    await screen.findByLabelText('Nome fantasia');

    const png = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2])], 'logo.png', {
      type: 'image/png',
    });
    fireEvent.change(screen.getByLabelText('Logo'), { target: { files: [png] } });
    await screen.findByRole('img', { name: 'Pré-visualização do logo' });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar identidade visual' }));
    await screen.findByText('Identidade visual salva.');
    const withLogo = calls.filter((call) => call.method === 'PUT')[0]!.body as Record<string, unknown>;
    expect(String(withLogo['logoDataUrl'])).toMatch(/^data:image\/png;base64,/);

    fireEvent.click(screen.getByRole('button', { name: 'Remover logo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar identidade visual' }));
    await waitFor(() => expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(2));
    const removal = calls.filter((call) => call.method === 'PUT')[1]!.body as Record<string, unknown>;
    expect(removal['logoDataUrl']).toBeNull();
  });

  it('restores the default identity only after confirmation', async () => {
    signIn(MASTER);
    const { calls } = mockApi({
      ...SETTINGS_ROUTES,
      'GET /auth/me': { user: MASTER },
      'GET /branding': { branding: GADOTTI },
      'PUT /branding': { branding: DEFAULT_BRANDING },
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<App />);
    await screen.findByLabelText('Nome fantasia');

    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrão' }));
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrão' }));
    expect(await screen.findByText('Identidade visual restaurada para o padrão.')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PUT')!.body).toEqual({
      displayName: '',
      welcomeText: '',
      primaryColor: '',
      secondaryColor: '',
      loginBackground: '',
      logoDataUrl: null,
    });
  });

  it('does not open the editor when the current identity could not be read', async () => {
    signIn(MASTER);
    const { calls } = mockApi({
      ...SETTINGS_ROUTES,
      'GET /auth/me': { user: MASTER },
      'GET /branding': () => new Response('{}', { status: 500 }),
    });

    render(<App />);

    expect(await screen.findByText(/Não foi possível carregar a identidade visual atual/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar identidade visual' })).toBeNull();
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });
});
