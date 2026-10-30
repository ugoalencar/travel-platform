import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NewSalePage } from './NewSalePage';
import * as api from '../lib/api';

vi.mock('../lib/customerLookup', () => ({
  lookupCustomers: vi.fn().mockResolvedValue([
    { id: 'c1', name: 'Carla Mendes', cpf_masked: null, birth_date: null, status: 'ACTIVE' },
  ]),
}));

vi.mock('../lib/api', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    listSaleCategories: vi.fn(),
    listSuppliers: vi.fn(),
    getSaleCategoryForm: vi.fn(),
    createSale: vi.fn(),
  };
});

const categories = [{ id: 'cat-1', name: 'Aéreo', active: true, sortOrder: 0, formRevision: 1 }];
const suppliers = [
  { id: 'supplier-1', name: 'Companhia A', active: true },
  { id: 'supplier-2', name: 'Hotel B', active: true },
];
const form = {
  category: categories[0],
  formRevision: 1,
  fields: [
    { fieldKey: 'sale_date', label: 'Data da venda', type: 'date', group: 'Venda', locked: true, enabled: true, required: false, sortOrder: 0 },
    { fieldKey: 'origin_text', label: 'Origem', type: 'text', group: 'Viagem', locked: false, enabled: true, required: true, sortOrder: 1 },
    { fieldKey: 'destination_text', label: 'Destino', type: 'text', group: 'Viagem', locked: false, enabled: true, required: false, sortOrder: 2 },
    { fieldKey: 'passenger_count', label: 'Quantidade de passageiros', type: 'integer', group: 'Viagem', locked: false, enabled: true, required: false, sortOrder: 3 },
    { fieldKey: 'locator', label: 'Localizador / PNR', type: 'text', group: 'Reserva', locked: false, enabled: true, required: false, sortOrder: 4 },
    { fieldKey: 'airline', label: 'Companhia aérea', type: 'text', group: 'Reserva', locked: false, enabled: false, required: false, sortOrder: 5 },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/sales/new']}>
      <Routes>
        <Route path="/sales/new" element={<NewSalePage />} />
        <Route path="/sales/:id" element={<p>Venda criada</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function pickCustomer() {
  fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'Carla' } });
  fireEvent.mouseDown(await screen.findByRole('option', { name: /Carla Mendes/ }));
}

describe('NewSalePage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function arrange() {
    vi.mocked(api.listSaleCategories).mockResolvedValue(categories);
    vi.mocked(api.listSuppliers).mockResolvedValue(suppliers as never);
    vi.mocked(api.getSaleCategoryForm).mockResolvedValue(form as never);
    vi.mocked(api.createSale).mockResolvedValue({ id: 'sale-9' } as never);
  }

  it('without a category shows only the base fields', async () => {
    arrange();
    renderPage();
    await screen.findByRole('option', { name: 'Aéreo' });
    expect(screen.getByLabelText(/Valor/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Origem/)).not.toBeInTheDocument();
    expect(api.getSaleCategoryForm).not.toHaveBeenCalled();
  });

  it('choosing a category renders only its enabled fields and marks the required ones', async () => {
    arrange();
    renderPage();
    const select = await screen.findByLabelText('Categoria');
    await screen.findByRole('option', { name: 'Aéreo' });
    fireEvent.change(select, { target: { value: 'cat-1' } });

    expect(await screen.findByLabelText(/Origem/)).toBeRequired();
    expect(screen.getByLabelText(/Destino/)).not.toBeRequired();
    expect(screen.getByLabelText(/Localizador/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Companhia aérea/)).not.toBeInTheDocument();
    expect(api.getSaleCategoryForm).toHaveBeenCalledWith('cat-1');
  });

  it('submits the sale body with category, first-class fields and modality data', async () => {
    arrange();
    renderPage();
    await pickCustomer();
    const select = await screen.findByLabelText('Categoria');
    await screen.findByRole('option', { name: 'Aéreo' });
    fireEvent.change(select, { target: { value: 'cat-1' } });
    fireEvent.change(await screen.findByLabelText(/Origem/), { target: { value: 'POA' } });
    fireEvent.change(screen.getByLabelText(/Destino/), { target: { value: 'LIS' } });
    fireEvent.change(screen.getByLabelText(/Quantidade de passageiros/), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Localizador/), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText(/Valor/), { target: { value: '2300' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrar venda/ }));

    await waitFor(() => expect(api.createSale).toHaveBeenCalledTimes(1));
    expect(api.createSale).toHaveBeenCalledWith({
      customerId: 'c1',
      amount: 2300,
      categoryId: 'cat-1',
      originText: 'POA',
      destinationText: 'LIS',
      passengerCount: 2,
      modalityData: { locator: 'ABC123' },
    });
    expect(await screen.findByText('Venda criada')).toBeInTheDocument();
  });

  it('does not submit while a required field is empty', async () => {
    arrange();
    renderPage();
    await pickCustomer();
    const select = await screen.findByLabelText('Categoria');
    await screen.findByRole('option', { name: 'Aéreo' });
    fireEvent.change(select, { target: { value: 'cat-1' } });
    await screen.findByLabelText(/Origem/);
    fireEvent.change(screen.getByLabelText(/Valor/), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrar venda/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Origem/);
    expect(api.createSale).not.toHaveBeenCalled();
  });

  it('shows the server message when the API refuses the sale (server is the authority)', async () => {
    arrange();
    vi.mocked(api.createSale).mockRejectedValue(new api.ApiError('Destino é obrigatório', 'FIELD_REQUIRED', 422));
    renderPage();
    await pickCustomer();
    fireEvent.change(screen.getByLabelText(/Valor/), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrar venda/ }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Destino é obrigatório/)).toBeInTheDocument();
    expect(screen.queryByText('Venda criada')).not.toBeInTheDocument();
  });
  it('an invalid discount blocks the submit instead of being dropped from the body', async () => {
    arrange();
    renderPage();
    await pickCustomer();
    fireEvent.change(screen.getByLabelText(/Valor/), { target: { value: '1.000,00' } });
    fireEvent.change(screen.getByLabelText(/Desconto/), { target: { value: '1.000.00' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrar venda/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Desconto inválido/);
    expect(api.createSale).not.toHaveBeenCalled();
  });

  it('accepts pt-BR money formats in amount and discount', async () => {
    arrange();
    renderPage();
    await pickCustomer();
    fireEvent.change(screen.getByLabelText(/Valor/), { target: { value: '2.300,50' } });
    fireEvent.change(screen.getByLabelText(/Desconto/), { target: { value: '300,50' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrar venda/ }));
    await waitFor(() => expect(api.createSale).toHaveBeenCalledWith({ customerId: 'c1', amount: 2300.5, discount: 300.5 }));
  });

  it('submits multiple supplier items together in one sale request', async () => {
    arrange();
    renderPage();
    await pickCustomer();
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar item' }));
    await screen.findByRole('option', { name: 'Companhia A' });
    fireEvent.change(screen.getByLabelText('Descrição do item 1'), { target: { value: 'Passagem aérea' } });
    fireEvent.change(screen.getByLabelText('Fornecedor do item 1'), { target: { value: 'supplier-1' } });
    fireEvent.change(screen.getByLabelText(/Valor unitário do item 1/), { target: { value: '1.000,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar item' }));
    fireEvent.change(screen.getByLabelText('Descrição do item 2'), { target: { value: 'Hospedagem' } });
    fireEvent.change(screen.getByLabelText('Fornecedor do item 2'), { target: { value: 'supplier-2' } });
    fireEvent.change(screen.getByLabelText(/Valor unitário do item 2/), { target: { value: '250,00' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrar venda/ }));

    await waitFor(() => expect(api.createSale).toHaveBeenCalledTimes(1));
    expect(api.createSale).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'c1',
      amount: 1_250,
      items: [
        expect.objectContaining({ description: 'Passagem aérea', supplierId: 'supplier-1', unitPrice: 1_000 }),
        expect.objectContaining({ description: 'Hospedagem', supplierId: 'supplier-2', unitPrice: 250 }),
      ],
    }));
  });

  it('a late response for a previous category never replaces the form of the current one', async () => {
    arrange();
    const second = { id: 'cat-2', name: 'Terrestre', active: true, sortOrder: 1, formRevision: 1 };
    vi.mocked(api.listSaleCategories).mockResolvedValue([...categories, second]);
    let resolveFirst: (value: never) => void = () => undefined;
    vi.mocked(api.getSaleCategoryForm).mockImplementation((id: string) =>
      id === 'cat-1'
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve({
            category: second,
            formRevision: 1,
            fields: [{ fieldKey: 'passenger_count', label: 'Quantidade de passageiros', type: 'integer', group: 'Viagem', locked: false, enabled: true, required: false, sortOrder: 1 }],
          } as never),
    );
    renderPage();
    const select = await screen.findByLabelText('Categoria');
    await screen.findByRole('option', { name: 'Terrestre' });
    fireEvent.change(select, { target: { value: 'cat-1' } });
    fireEvent.change(select, { target: { value: 'cat-2' } });
    expect(await screen.findByLabelText(/Quantidade de passageiros/)).toBeInTheDocument();
    resolveFirst(form as never);
    await waitFor(() => expect(screen.queryByLabelText(/Origem/)).not.toBeInTheDocument());
    expect(screen.getByLabelText(/Quantidade de passageiros/)).toBeInTheDocument();
  });
});
