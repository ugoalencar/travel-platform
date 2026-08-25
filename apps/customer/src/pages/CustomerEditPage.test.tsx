import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerEditPage } from './CustomerEditPage';
import { CustomerDetailsPage } from './CustomerDetailsPage';
import { getCustomer, updateCustomer, ApiError } from '../lib/api';
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
    getCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    listWishes: vi.fn().mockResolvedValue([]),
    listProposals: vi.fn().mockResolvedValue([]),
    listSales: vi.fn().mockResolvedValue([]),
    listBookings: vi.fn().mockResolvedValue([]),
    listReceivables: vi.fn().mockResolvedValue([]),
    listTrips: vi.fn().mockResolvedValue([]),
    ApiError: MockApiError,
  };
});

vi.mock('../lib/commercialApi', () => ({
  listOpportunities: vi.fn().mockResolvedValue({ opportunities: [], total: 0 }),
  listInteractions: vi.fn().mockResolvedValue({ interactions: [], total: 0 }),
  listTasks: vi.fn().mockResolvedValue({ tasks: [], total: 0 }),
  listPipelines: vi.fn().mockResolvedValue([]),
  listStages: vi.fn().mockResolvedValue([]),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const baseCustomer: Customer = {
  id: 'c1',
  agencyId: 'a1',
  name: 'Maria Silva',
  email: 'maria@example.com',
  phone: '+55 11 90000-0000',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderRouted(initialEntries: string[] = ['/customers/c1/edit']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/customers/:id" element={<CustomerDetailsPage />} />
        <Route path="/customers/:id/edit" element={<CustomerEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CustomerEditPage', () => {
  it('renders at /customers/:id/edit', async () => {
    vi.mocked(getCustomer).mockResolvedValue(baseCustomer);
    renderRouted();

    expect(
      await screen.findByRole('heading', { name: 'Editar cliente' }),
    ).toBeInTheDocument();
  });

  it('loads and pre-fills existing customer data into the form fields', async () => {
    vi.mocked(getCustomer).mockResolvedValue(baseCustomer);
    renderRouted();

    expect(await screen.findByLabelText('Nome')).toHaveValue('Maria Silva');
    expect(screen.getByLabelText('Email')).toHaveValue('maria@example.com');
    expect(screen.getByLabelText('Telefone')).toHaveValue('+55 11 90000-0000');
  });

  it('editing a field changes its value', async () => {
    vi.mocked(getCustomer).mockResolvedValue(baseCustomer);
    renderRouted();

    const nameInput = await screen.findByLabelText('Nome');
    fireEvent.change(nameInput, { target: { value: 'Maria Souza' } });
    expect(nameInput).toHaveValue('Maria Souza');
  });

  it('valid submit calls updateCustomer(id, input) with the right payload', async () => {
    vi.mocked(getCustomer).mockResolvedValue(baseCustomer);
    vi.mocked(updateCustomer).mockResolvedValue({ ...baseCustomer, name: 'Maria Souza' });
    renderRouted();

    const nameInput = await screen.findByLabelText('Nome');
    fireEvent.change(nameInput, { target: { value: 'Maria Souza' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updateCustomer).toHaveBeenCalledTimes(1));
    expect(updateCustomer).toHaveBeenCalledWith('c1', {
      name: 'Maria Souza',
      email: 'maria@example.com',
      phone: '+55 11 90000-0000',
    });
  });

  it('payload contains only name/email/phone, no authority fields', async () => {
    vi.mocked(getCustomer).mockResolvedValue(baseCustomer);
    vi.mocked(updateCustomer).mockResolvedValue(baseCustomer);
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updateCustomer).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(updateCustomer).mock.calls[0]?.[1] as unknown as Record<
      string,
      unknown
    >;
    expect(Object.keys(payload).sort()).toEqual(['email', 'name', 'phone']);
    expect(payload).not.toHaveProperty('agencyId');
    expect(payload).not.toHaveProperty('tenantId');
    expect(payload).not.toHaveProperty('role');
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('createdAt');
    expect(payload).not.toHaveProperty('deletedAt');
  });

  it('submitting state / button text change', async () => {
    vi.mocked(getCustomer).mockResolvedValue(baseCustomer);
    let resolvePromise: (value: Customer) => void = () => {};
    vi.mocked(updateCustomer).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('button', { name: 'Salvando...' })).toBeDisabled();

    resolvePromise(baseCustomer);
    await waitFor(() => expect(updateCustomer).toHaveBeenCalledTimes(1));
  });

  it('blocks double submit — rapid clicks call updateCustomer exactly once', async () => {
    vi.mocked(getCustomer).mockResolvedValue(baseCustomer);
    let resolvePromise: (value: Customer) => void = () => {};
    vi.mocked(updateCustomer).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    renderRouted();

    await screen.findByLabelText('Nome');
    const submitButton = screen.getByRole('button', { name: 'Salvar' });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(updateCustomer).toHaveBeenCalledTimes(1);

    resolvePromise(baseCustomer);
    await waitFor(() => expect(updateCustomer).toHaveBeenCalledTimes(1));
  });

  it('cancel does not call updateCustomer, navigates back to details', async () => {
    vi.mocked(getCustomer).mockResolvedValue(baseCustomer);
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(updateCustomer).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('heading', { name: 'Detalhes do cliente' }),
    ).toBeInTheDocument();
  });

  it('success navigates to /customers/:id', async () => {
    vi.mocked(getCustomer).mockResolvedValue(baseCustomer);
    vi.mocked(updateCustomer).mockResolvedValue(baseCustomer);
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByRole('heading', { name: 'Detalhes do cliente' }),
    ).toBeInTheDocument();
  });

  it('400 error shows the backend message', async () => {
    vi.mocked(getCustomer).mockResolvedValue(baseCustomer);
    vi.mocked(updateCustomer).mockRejectedValue(
      new ApiError('Field "name" must be a non-empty string', 'VALIDATION_ERROR', 400),
    );
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Field "name" must be a non-empty string'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/VALIDATION_ERROR/)).not.toBeInTheDocument();
  });

  it('403 error shows a safe permission message', async () => {
    vi.mocked(getCustomer).mockResolvedValue(baseCustomer);
    vi.mocked(updateCustomer).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Você não tem permissão para editar clientes.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/FORBIDDEN/)).not.toBeInTheDocument();
  });

  it('404 error on submit shows a safe generic message', async () => {
    vi.mocked(getCustomer).mockResolvedValue(baseCustomer);
    vi.mocked(updateCustomer).mockRejectedValue(
      new ApiError('Customer not found', 'NOT_FOUND', 404),
    );
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Cliente não encontrado.')).toBeInTheDocument();
    expect(screen.queryByText(/NOT_FOUND/)).not.toBeInTheDocument();
  });

  it('409 error shows the backend safe conflict message', async () => {
    vi.mocked(getCustomer).mockResolvedValue(baseCustomer);
    vi.mocked(updateCustomer).mockRejectedValue(
      new ApiError('A customer with this CPF or email already exists', 'CONFLICT', 409),
    );
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('A customer with this CPF or email already exists'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/CONFLICT/)).not.toBeInTheDocument();
  });

  it('500/unknown error shows a generic safe fallback, never raw text', async () => {
    vi.mocked(getCustomer).mockResolvedValue(baseCustomer);
    vi.mocked(updateCustomer).mockRejectedValue(
      new ApiError('Internal server error', 'INTERNAL_ERROR', 500),
    );
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Não foi possível salvar o cliente. Tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/INTERNAL_ERROR/)).not.toBeInTheDocument();
    expect(screen.queryByText('Internal server error')).not.toBeInTheDocument();
  });

  it('stays on the edit form on error and re-enables submit', async () => {
    vi.mocked(getCustomer).mockResolvedValue(baseCustomer);
    vi.mocked(updateCustomer).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    renderRouted();

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await screen.findByText('Você não tem permissão para editar clientes.');
    expect(screen.getByRole('heading', { name: 'Editar cliente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).not.toBeDisabled();
  });
});
