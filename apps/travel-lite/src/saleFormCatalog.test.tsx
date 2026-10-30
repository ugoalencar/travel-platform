/* eslint-disable @typescript-eslint/no-unsafe-assignment -- expect.arrayContaining matcher */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { api } from './api';
import { SaleCategoryFormFields } from './SaleCategoryFormFields';
import { SaleItemsPanel } from './SaleItemsPanel';
import { SaleFormProfileSection } from './pages/SaleFormProfileSection';
import { CatalogProductsSection } from './pages/CatalogProductsSection';
import { buildFormPayload, missingRequired, parseMoneyInput, useSaleCategoryForm, type SaleFormField } from './saleForm';

vi.mock('./api', () => ({ api: vi.fn() }));
const apiMock = vi.mocked(api);

function field(partial: Partial<SaleFormField> & Pick<SaleFormField, 'field_key' | 'label'>): SaleFormField {
  return {
    type: 'text',
    group: 'Viagem',
    storage: 'column',
    locked: false,
    enabled: true,
    required: false,
    sort_order: 0,
    ...partial,
  };
}

const FIELDS: SaleFormField[] = [
  field({ field_key: 'sale_date', label: 'Data da venda', type: 'date', locked: true }),
  field({ field_key: 'origin_text', label: 'Origem', required: true, sort_order: 1 }),
  field({ field_key: 'destination_text', label: 'Destino', sort_order: 2 }),
  field({ field_key: 'passenger_count', label: 'Quantidade de passageiros', type: 'integer', sort_order: 3 }),
  field({ field_key: 'locator', label: 'Localizador / PNR', storage: 'modality', group: 'Reserva', sort_order: 4 }),
  field({ field_key: 'airline', label: 'Companhia aérea', storage: 'modality', enabled: false, sort_order: 5 }),
];

describe('saleForm helpers', () => {
  it('buildFormPayload keeps first-class fields at the top level and modality fields inside modality_data', () => {
    expect(
      buildFormPayload(FIELDS, { origin_text: ' POA ', destination_text: '', passenger_count: '2', locator: 'ABC', airline: 'X' }),
    ).toEqual({ origin_text: 'POA', passenger_count: 2, modality_data: { locator: 'ABC' } });
  });

  it('missingRequired lists required enabled fields left empty', () => {
    expect(missingRequired(FIELDS, {})).toEqual(['Origem']);
    expect(missingRequired(FIELDS, { origin_text: 'POA' })).toEqual([]);
  });

  it.each([
    ['2300', 2300],
    ['2.300,50', 2300.5],
    ['2300.50', 2300.5],
  ])('parseMoneyInput accepts %s', (raw, expected) => {
    expect(parseMoneyInput(raw)).toBe(expected);
  });

  it.each(['', 'abc', '-1', '1.000.00', '12,345'])('parseMoneyInput rejects %j', (raw) => {
    expect(parseMoneyInput(raw)).toBeNull();
  });
});

describe('SaleCategoryFormFields', () => {
  it('renders only enabled configurable fields, marks required, and reports changes', () => {
    const onChange = vi.fn();
    render(<SaleCategoryFormFields state={{ status: 'ready', fields: FIELDS }} values={{}} onChange={onChange} />);
    expect(screen.getByLabelText(/Origem/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/Destino/)).toHaveAttribute('aria-required', 'false');
    expect(screen.getByLabelText(/Localizador/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Companhia aérea/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Data da venda/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Origem/), { target: { value: 'POA' } });
    expect(onChange).toHaveBeenCalledWith('origin_text', 'POA');
  });

  it('renders nothing without a category and an alert on error', () => {
    const { container, rerender } = render(<SaleCategoryFormFields state={{ status: 'none' }} values={{}} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SaleCategoryFormFields state={{ status: 'error', message: 'Falhou' }} values={{}} onChange={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou');
  });
});

describe('useSaleCategoryForm', () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  function Probe({ categoryId }: { categoryId: string }) {
    const state = useSaleCategoryForm(categoryId);
    return <p data-testid="state">{state.status === 'ready' ? state.fields.map((f) => f.field_key).join(',') : state.status}</p>;
  }

  it('ignores a late answer for a previous category', async () => {
    let resolveFirst: (value: never) => void = () => undefined;
    apiMock.mockImplementation((path: string) => {
      return path.includes('cat-1')
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve({ form: { fields: [field({ field_key: 'passenger_count', label: 'Pax' })] } });
    });
    const { rerender } = render(<Probe categoryId="cat-1" />);
    rerender(<Probe categoryId="cat-2" />);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('passenger_count'));
    await act(async () => {
      resolveFirst({ form: { fields: [field({ field_key: 'origin_text', label: 'Origem' })] } } as never);
      await Promise.resolve();
    });
    expect(screen.getByTestId('state')).toHaveTextContent('passenger_count');
  });
});

describe('SaleFormProfileSection', () => {
  beforeEach(() => {
    cleanup();
    apiMock.mockReset();
    apiMock.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === '/categories') return Promise.resolve({ items: [{ id: 'cat-1', name: 'Aéreo', active: true }] });
      if (path === '/categories/cat-1/form') {
        return Promise.resolve({
          form: {
            fields: options?.method === 'PUT'
              ? FIELDS.map((f) => (f.field_key === 'destination_text' ? { ...f, enabled: true, required: true } : f))
              : FIELDS,
          },
        });
      }
      return Promise.reject(new Error(`unexpected ${path}`));
    });
  });

  it('edits and saves the whole profile without the locked field', async () => {
    render(<SaleFormProfileSection />);
    await screen.findByRole('option', { name: 'Aéreo' });
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'cat-1' } });
    await screen.findByText('Origem');

    const rows = screen.getAllByRole('row');
    const rowOf = (label: string) => rows.find((r) => within(r).queryByText(label))!;
    expect(within(rowOf('Data da venda')).queryByRole('checkbox')).not.toBeInTheDocument();

    fireEvent.click(within(rowOf('Destino')).getByLabelText('Obrigatório: Destino'));
    fireEvent.click(within(rowOf('Origem')).getByLabelText('Habilitado: Origem'));
    expect(within(rowOf('Origem')).getByLabelText('Obrigatório: Origem')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulário' }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/categories/cat-1/form', {
        method: 'PUT',
        body: {
          fields: expect.arrayContaining([
            { field_key: 'origin_text', enabled: false, required: false, sort_order: 1 },
            { field_key: 'destination_text', enabled: true, required: true, sort_order: 2 },
          ]),
        },
      }),
    );
    const putCall = apiMock.mock.calls.find(([, options]) => options?.method === 'PUT');
    expect((putCall?.[1] as { body: { fields: Array<{ field_key: string }> } }).body.fields.map((f) => f.field_key)).not.toContain('sale_date');
    expect(await screen.findByText(/Formulário salvo/)).toBeInTheDocument();
  });
});

describe('CatalogProductsSection', () => {
  beforeEach(() => {
    cleanup();
    apiMock.mockReset();
    apiMock.mockImplementation((path: string) => {
      if (path.startsWith('/catalog-products?')) return Promise.resolve({ items: [{ id: 'p1', name: 'Pacote Lisboa', category_id: 'cat-1', default_supplier_id: 's1', active: true }] });
      if (path === '/categories') return Promise.resolve({ items: [{ id: 'cat-1', name: 'Aéreo' }] });
      if (path.startsWith('/financial-parties')) {
        return Promise.resolve({ items: [{ id: 's1', name: 'Operadora', type: 'SUPPLIER' }, { id: 'o1', name: 'Outro', type: 'OTHER' }] });
      }
      return Promise.resolve({ product: {} });
    });
  });

  it('lists products with category and supplier names; only suppliers are offered', async () => {
    render(<CatalogProductsSection />);
    expect(await screen.findByText('Pacote Lisboa')).toBeInTheDocument();
    expect(screen.getAllByText('Operadora').length).toBeGreaterThan(0);
    expect(screen.queryByRole('option', { name: 'Outro' })).not.toBeInTheDocument();
  });

  it('creates a product with its links and toggles active', async () => {
    render(<CatalogProductsSection />);
    await screen.findByText('Pacote Lisboa');
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Cruzeiro' } });
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'cat-1' } });
    fireEvent.change(screen.getByLabelText('Fornecedor'), { target: { value: 's1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/catalog-products', {
        method: 'POST',
        body: { name: 'Cruzeiro', category_id: 'cat-1', default_supplier_id: 's1' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/catalog-products/p1', { method: 'PATCH', body: { active: false } }),
    );
  });
});

describe('SaleItemsPanel', () => {
  const item = { id: 'i1', description: 'Tarifa aérea', product_id: null, qty: 1, unit_price: 2000, taxes: 300, fees: 0, discount: 0, line_total: 2300, status: 'ACTIVE' as const };

  beforeEach(() => {
    cleanup();
    apiMock.mockReset();
    apiMock.mockImplementation((path: string) => {
      if (path === '/sales/sale-1/items') return Promise.resolve({ items: [item] });
      if (path === '/catalog-products') return Promise.resolve({ items: [{ id: 'p1', name: 'Pacote' }] });
      return Promise.resolve({});
    });
  });

  it('shows the derived-total hint, adds an item with pt-BR money and tells the parent to reload', async () => {
    const onChanged = vi.fn();
    render(<SaleItemsPanel saleId="sale-1" editable onChanged={onChanged} />);
    expect(await screen.findByText('Tarifa aérea')).toBeInTheDocument();
    expect(screen.getByText(/soma dos itens ativos/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Descrição do item/), { target: { value: 'Seguro' } });
    fireEvent.change(screen.getByLabelText(/Valor unitário/), { target: { value: '1.200,50' } });
    fireEvent.change(screen.getByLabelText('Desconto'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar item' }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/sales/sale-1/items', {
        method: 'POST',
        body: { description: 'Seguro', qty: 1, unit_price: 1200.5, discount: 50 },
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('refuses an invalid amount instead of dropping it', async () => {
    render(<SaleItemsPanel saleId="sale-1" editable onChanged={vi.fn()} />);
    await screen.findByText('Tarifa aérea');
    fireEvent.change(screen.getByLabelText(/Descrição do item/), { target: { value: 'Seguro' } });
    fireEvent.change(screen.getByLabelText(/Valor unitário/), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Taxas'), { target: { value: '1.000.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar item' }));
    expect(await screen.findByText(/Taxas inválido/)).toBeInTheDocument();
    expect(apiMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });

  it('cancels an item after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onChanged = vi.fn();
    render(<SaleItemsPanel saleId="sale-1" editable onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar item' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/sale-items/i1/cancel', { method: 'POST' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('is read-only when the sale is not a draft', async () => {
    render(<SaleItemsPanel saleId="sale-1" editable={false} onChanged={vi.fn()} />);
    await screen.findByText('Tarifa aérea');
    expect(screen.queryByRole('button', { name: 'Adicionar item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar item' })).not.toBeInTheDocument();
  });
});
