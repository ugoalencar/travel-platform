import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SaleFormPage } from './SaleFormPage';
import { createSale, listCustomers, ApiError } from '../lib/api';
import type { Sale } from '../types/sale';
import type { Customer } from '../types/customer';

vi.mock('../lib/api', () => {
  class MockApiError extends Error {
    code: string;
    status: number;
    constructor(message: string, code: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    listCustomers: vi.fn().mockResolvedValue([]),
    createSale: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/sales/new']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/sales/new" element={<SaleFormPage />} />
        <Route path="/sales" element={<div>Vendas page</div>} />
        <Route path="/sales/:id" element={<div>Detalhes da venda page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const customers: Customer[] = [
  {
    id: 'c1',
    agencyId: 'a1',
    name: 'Maria Silva',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const createdSale: Sale = {
  id: 's1',
  agencyId: 'a1',
  customerId: 'c1',
  userId: 'u1',
  amount: 100,
  discount: 10,
  total: 90,
  status: 'PENDING',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function fillCustomer(customerId = 'c1') {
  const select = await screen.findByLabelText('Cliente');
  fireEvent.change(select, { target: { value: customerId } });
}

describe('SaleFormPage', () => {
  it('renders customer selector populated from real listCustomers()', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    expect(screen.getByRole('heading', { name: 'Nova venda' })).toBeInTheDocument();
    const select = await screen.findByLabelText('Cliente');
    expect(within(select).getByText('Maria Silva')).toBeInTheDocument();
  });

  it('computes a live client-side total preview as the user types (never sent as total)', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    await fillCustomer('c1');
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Desconto (valor absoluto)'), {
      target: { value: '10' },
    });

    expect(screen.getByText(/Total \(prévia\):/)).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
  });

  it('valid submit calls createSale with only allowed fields, never total/status/userId/paidAt', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createSale).mockResolvedValue(createdSale);
    renderRouted();

    await fillCustomer('c1');
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Desconto (valor absoluto)'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(createSale).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createSale).mock.calls[0]?.[0] as unknown as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({ customerId: 'c1', amount: 100, discount: 10 });
    expect(payload).not.toHaveProperty('total');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('userId');
    expect(payload).not.toHaveProperty('paidAt');
    expect(payload).not.toHaveProperty('agencyId');
  });

  it('missing customer shows validation error and does not submit', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    await screen.findByLabelText('Cliente');
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Cliente é obrigatório.')).toBeInTheDocument();
    expect(createSale).not.toHaveBeenCalled();
  });

  it('missing amount shows validation error and does not submit', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    await fillCustomer('c1');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Valor é obrigatório.')).toBeInTheDocument();
    expect(createSale).not.toHaveBeenCalled();
  });

  it('navigates to the new sale details page on success', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createSale).mockResolvedValue(createdSale);
    renderRouted();

    await fillCustomer('c1');
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Detalhes da venda page')).toBeInTheDocument();
  });

  it('404 error shows a safe message', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createSale).mockRejectedValue(new ApiError('Not found', 'NOT_FOUND', 404));
    renderRouted();

    await fillCustomer('c1');
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Cliente selecionado não encontrado.'),
    ).toBeInTheDocument();
  });

  it('403 error shows a safe permission message', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createSale).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    renderRouted();

    await fillCustomer('c1');
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Você não tem permissão para criar vendas.'),
    ).toBeInTheDocument();
  });

  it('409 conflict error shows a safe duplicate-proposal message', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createSale).mockRejectedValue(new ApiError('Conflict', 'CONFLICT', 409));
    renderRouted();

    await fillCustomer('c1');
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Já existe uma venda para a proposta selecionada.'),
    ).toBeInTheDocument();
  });
});
