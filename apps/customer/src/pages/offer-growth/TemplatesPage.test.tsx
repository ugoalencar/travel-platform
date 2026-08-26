import { MemoryRouter } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TemplatesPage } from './TemplatesPage';
import * as store from '../../lib/localTemplateStore';
import type { CreativeTemplate } from '../../types/offerGrowth';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../../lib/localTemplateStore');

const template: CreativeTemplate = {
  id: 'tpl-1',
  agencyId: 'agency-a',
  name: 'Carrossel promoção verão',
  pages: [{ id: 'page-1', blocks: [] }],
  bindings: [],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
} as unknown as CreativeTemplate;

function renderPage() {
  render(
    <MemoryRouter>
      <TemplatesPage />
    </MemoryRouter>,
  );
}

describe('TemplatesPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(store.listTemplates).mockReturnValue([template]);
    vi.mocked(store.createBlankTemplate).mockReturnValue({ ...template, id: 'tpl-2', name: 'Novo template' });
  });

  it('lists templates without exposing raw JSON', () => {
    renderPage();
    expect(screen.getByText('Carrossel promoção verão')).toBeInTheDocument();
    expect(screen.getByText(/1 slide\(s\) · 0 vínculo\(s\)/)).toBeInTheDocument();
    expect(screen.queryByText(/"pages":/)).not.toBeInTheDocument();
    expect(screen.queryByText(/"bindings":/)).not.toBeInTheDocument();
  });

  it('creates a new template and opens it in the editor', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Nome do novo template'), {
      target: { value: 'Nova campanha' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar template' }));

    expect(store.createBlankTemplate).toHaveBeenCalledWith('Nova campanha');
    expect(navigateMock).toHaveBeenCalledWith('/offer-growth/studio?templateId=tpl-2');
  });

  it('duplicates an existing template', () => {
    vi.mocked(store.duplicateTemplate).mockReturnValue({ ...template, id: 'tpl-1-copy' });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));
    expect(store.duplicateTemplate).toHaveBeenCalledWith('tpl-1');
    expect(store.listTemplates).toHaveBeenCalledTimes(2);
  });

  it('deletes a template', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(store.deleteTemplate).toHaveBeenCalledWith('tpl-1');
    expect(store.listTemplates).toHaveBeenCalledTimes(2);
  });

  it('opens an existing template in the editor', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir editor' }));
    expect(navigateMock).toHaveBeenCalledWith('/offer-growth/studio?templateId=tpl-1');
  });
});
