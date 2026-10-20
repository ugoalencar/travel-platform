// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as PublicApi from '../lib/publicCommercialApi';
import type { PublicLanding } from '../lib/publicCommercialApi';

const api = vi.hoisted(() => ({
  getPublicLanding: vi.fn(),
  getPublicPartners: vi.fn(),
  getPublicBanners: vi.fn(),
}));

vi.mock('../lib/publicCommercialApi', async (importOriginal) => ({
  ...(await importOriginal<typeof PublicApi>()),
  ...api,
}));

import { LandingPage } from './LandingPage';

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function mockApi(landing: PublicLanding | null) {
  api.getPublicLanding.mockResolvedValue(landing);
  api.getPublicPartners.mockResolvedValue([]);
  api.getPublicBanners.mockResolvedValue([]);
}

describe('LandingPage', () => {
  it('renders the static content when the Landing CMS has nothing published', () => {
    mockApi(null);
    renderLanding();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Transforme sua agência em uma operação mais inteligente.' }),
    ).toBeInTheDocument();
    for (const area of [
      'CRM / Cliente 360',
      'Pipeline comercial',
      'Viagens e operação',
      'Financeiro',
      'Equipe',
      'Portal do cliente',
    ]) {
      expect(screen.getByRole('heading', { name: area })).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: 'Segurança por padrão' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Comece pelo Travel Lite.' })).toBeInTheDocument();
    expect(screen.getByText('Telas ilustrativas, com dados fictícios.')).toBeInTheDocument();
  });

  it('keeps the product screens out of the accessibility tree', () => {
    mockApi(null);
    renderLanding();
    for (const node of screen.getAllByText('Família Souza · Cancún')) {
      expect(node.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('uses the hero copy and a safe CTA from the Landing CMS', async () => {
    mockApi({
      page: {
        heroTitle: 'Título do CMS',
        heroSubtitle: 'Subtítulo do CMS',
        ctaPrimaryLabel: 'Começar agora',
        ctaPrimaryUrl: 'javascript:alert(1)',
      },
      sections: [],
    } as unknown as PublicLanding);
    renderLanding();

    expect(await screen.findByRole('heading', { level: 1, name: 'Título do CMS' })).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /Começar agora/ });
    expect(cta.getAttribute('href')).not.toMatch(/^javascript:/);
  });

  it('renders published FAQ entries in order', async () => {
    mockApi({
      page: {},
      sections: [
        { id: 'b', type: 'FAQ', enabled: true, sortOrder: 2, title: 'Segunda pergunta', content: 'Resposta B' },
        { id: 'a', type: 'FAQ', enabled: true, sortOrder: 1, title: 'Primeira pergunta', content: 'Resposta A' },
      ],
    } as unknown as PublicLanding);
    renderLanding();

    const first = await screen.findByText('Primeira pergunta');
    const second = screen.getByText('Segunda pergunta');
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
