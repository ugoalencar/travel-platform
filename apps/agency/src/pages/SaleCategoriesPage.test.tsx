import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SaleCategoriesPage } from './SaleCategoriesPage';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    listSaleCategories: vi.fn(),
    createSaleCategory: vi.fn(),
    updateSaleCategory: vi.fn(),
    getSaleCategoryForm: vi.fn(),
    saveSaleCategoryForm: vi.fn(),
  };
});

const aereo = { id: 'cat-1', name: 'Aéreo', active: true, sortOrder: 0, formRevision: 1 };
const form = {
  category: aereo,
  formRevision: 1,
  fields: [
    { fieldKey: 'sale_date', label: 'Data da venda', type: 'date', group: 'Venda', locked: true, enabled: true, required: false, sortOrder: 0 },
    { fieldKey: 'origin_text', label: 'Origem', type: 'text', group: 'Viagem', locked: false, enabled: true, required: true, sortOrder: 1 },
    { fieldKey: 'destination_text', label: 'Destino', type: 'text', group: 'Viagem', locked: false, enabled: false, required: false, sortOrder: 2 },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <SaleCategoriesPage />
    </MemoryRouter>,
  );
}

describe('SaleCategoriesPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function arrange() {
    vi.mocked(api.listSaleCategories).mockResolvedValue([aereo]);
    vi.mocked(api.getSaleCategoryForm).mockResolvedValue(form as never);
    vi.mocked(api.saveSaleCategoryForm).mockResolvedValue({ ...form, formRevision: 2 } as never);
  }

  it('lists categories including inactive ones', async () => {
    arrange();
    renderPage();
    expect(await screen.findByText('Aéreo')).toBeInTheDocument();
    expect(api.listSaleCategories).toHaveBeenCalledWith(true);
  });

  it('creates a category and reloads', async () => {
    arrange();
    vi.mocked(api.createSaleCategory).mockResolvedValue({ ...aereo, id: 'cat-2', name: 'Terrestre' });
    renderPage();
    await screen.findByText('Aéreo');
    fireEvent.change(screen.getByLabelText('Nome da categoria'), { target: { value: 'Terrestre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar categoria' }));
    await waitFor(() => expect(api.createSaleCategory).toHaveBeenCalledWith({ name: 'Terrestre' }));
    await waitFor(() => expect(api.listSaleCategories).toHaveBeenCalledTimes(2));
  });

  it('deactivates a category', async () => {
    arrange();
    vi.mocked(api.updateSaleCategory).mockResolvedValue({ ...aereo, active: false });
    renderPage();
    await screen.findByText('Aéreo');
    fireEvent.click(screen.getByRole('button', { name: 'Desativar Aéreo' }));
    await waitFor(() => expect(api.updateSaleCategory).toHaveBeenCalledWith('cat-1', { active: false }));
  });

  it('edits the form profile: locked fields have no switches, required needs enabled, saves the whole profile', async () => {
    arrange();
    renderPage();
    await screen.findByText('Aéreo');
    fireEvent.click(screen.getByRole('button', { name: 'Configurar formulário de Aéreo' }));

    await screen.findByText('Origem');
    const rows = screen.getAllByRole('row');
    const rowOf = (label: string) => rows.find((r) => within(r).queryByText(label))!;

    // sale_date is locked: shown, but without switches
    expect(within(rowOf('Data da venda')).queryByRole('checkbox')).not.toBeInTheDocument();
    // a disabled field cannot be required
    expect(within(rowOf('Destino')).getByLabelText('Obrigatório: Destino')).toBeDisabled();

    fireEvent.click(within(rowOf('Destino')).getByLabelText('Habilitado: Destino'));
    fireEvent.click(within(rowOf('Destino')).getByLabelText('Obrigatório: Destino'));
    // un-enabling Origem clears its required flag
    fireEvent.click(within(rowOf('Origem')).getByLabelText('Habilitado: Origem'));
    expect(within(rowOf('Origem')).getByLabelText('Obrigatório: Origem')).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulário' }));
    await waitFor(() => expect(api.saveSaleCategoryForm).toHaveBeenCalledTimes(1));
    expect(api.saveSaleCategoryForm).toHaveBeenCalledWith('cat-1', [
      { fieldKey: 'origin_text', enabled: false, required: false },
      { fieldKey: 'destination_text', enabled: true, required: true },
    ]);
    expect(await screen.findByText(/Formulário salvo/)).toBeInTheDocument();
  });

  it('shows the API error when saving fails', async () => {
    arrange();
    vi.mocked(api.saveSaleCategoryForm).mockRejectedValue(new api.ApiError('Sem permissão', 'FORBIDDEN', 403));
    renderPage();
    await screen.findByText('Aéreo');
    fireEvent.click(screen.getByRole('button', { name: 'Configurar formulário de Aéreo' }));
    await screen.findByText('Origem');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulário' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão');
  });
});
