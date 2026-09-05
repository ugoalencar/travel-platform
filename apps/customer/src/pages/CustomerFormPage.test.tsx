import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerFormPage } from './CustomerFormPage';
import { CustomersPage } from './CustomersPage';
import { createCustomer, ApiError } from '../lib/api';
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
    createCustomer: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/customers/new']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/new" element={<CustomerFormPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillRequiredName(name = 'Maria Silva') {
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: name } });
}

describe('CustomerFormPage', () => {
  it('renders the form with correct labels/fields', () => {
    renderRouted();

    expect(screen.getByRole('heading', { name: 'Novo cliente' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toBeRequired();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Telefone')).toHaveAttribute('type', 'tel');
    expect(screen.getByLabelText('CPF')).toBeInTheDocument();
    expect(screen.getByLabelText('Passaporte')).toBeInTheDocument();
    expect(screen.getByLabelText('Notas').tagName).toBe('TEXTAREA');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('calls createCustomer with the right payload on valid submit', async () => {
    vi.mocked(createCustomer).mockResolvedValue({
      id: 'c1',
      agencyId: 'a1',
      name: 'Maria Silva',
      email: 'maria@example.com',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderRouted();

    fillRequiredName();
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'maria@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
    expect(createCustomer).toHaveBeenCalledWith({
      name: 'Maria Silva',
      email: 'maria@example.com',
    });
  });

  it('payload contains only allowed fields, never agencyId/tenantId/role', async () => {
    vi.mocked(createCustomer).mockResolvedValue({
      id: 'c1',
      agencyId: 'a1',
      name: 'Maria Silva',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderRouted();

    fillRequiredName();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createCustomer).mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty('agencyId');
    expect(payload).not.toHaveProperty('tenantId');
    expect(payload).not.toHaveProperty('role');
    expect(payload).not.toHaveProperty('ownerId');
    expect(payload).not.toHaveProperty('createdBy');
    expect(payload).not.toHaveProperty('deletedAt');
  });

  it('shows submitting state and disables the submit button while saving', async () => {
    let resolvePromise: (value: Customer) => void = () => {};
    vi.mocked(createCustomer).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    renderRouted();

    fillRequiredName();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('button', { name: 'Salvando...' })).toBeDisabled();

    resolvePromise({
      id: 'c1',
      agencyId: 'a1',
      name: 'Maria Silva',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
  });

  it('blocks double submit — rapid double-click calls createCustomer exactly once', async () => {
    let resolvePromise: (value: Customer) => void = () => {};
    vi.mocked(createCustomer).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    renderRouted();

    fillRequiredName();
    const submitButton = screen.getByRole('button', { name: 'Salvar' });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(createCustomer).toHaveBeenCalledTimes(1);

    resolvePromise({
      id: 'c1',
      agencyId: 'a1',
      name: 'Maria Silva',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
  });

  it('navigates back to /customers on success', async () => {
    vi.mocked(createCustomer).mockResolvedValue({
      id: 'c1',
      agencyId: 'a1',
      name: 'Maria Silva',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderRouted();

    fillRequiredName();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
  });

  it('cancel does not call createCustomer and navigates back to /customers', async () => {
    renderRouted();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(createCustomer).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
  });

  it('400 error displays the backend message and keeps the form visible', async () => {
    vi.mocked(createCustomer).mockRejectedValue(
      new ApiError('Field "name" is required and must be a non-empty string', 'VALIDATION_ERROR', 400),
    );
    renderRouted();

    fillRequiredName();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Field "name" is required and must be a non-empty string'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Novo cliente' })).toBeInTheDocument();
    expect(screen.queryByText(/VALIDATION_ERROR/)).not.toBeInTheDocument();
  });

  it('403 error shows a safe permission message', async () => {
    vi.mocked(createCustomer).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    renderRouted();

    fillRequiredName();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Você não tem permissão para criar clientes.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/FORBIDDEN/)).not.toBeInTheDocument();
  });

  it('409 error shows a friendly conflict message', async () => {
    vi.mocked(createCustomer).mockRejectedValue(
      new ApiError('A customer with this CPF or email already exists', 'CONFLICT', 409),
    );
    renderRouted();

    fillRequiredName();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('A customer with this CPF or email already exists'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/CONFLICT/)).not.toBeInTheDocument();
  });

  it('500/unknown error shows a generic safe message, never raw text', async () => {
    vi.mocked(createCustomer).mockRejectedValue(
      new ApiError('Internal server error', 'INTERNAL_ERROR', 500),
    );
    renderRouted();

    fillRequiredName();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Não foi possível salvar o cliente. Tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/INTERNAL_ERROR/)).not.toBeInTheDocument();
    expect(screen.queryByText('Internal server error')).not.toBeInTheDocument();
    expect(screen.queryByText(/TypeError/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SQL/)).not.toBeInTheDocument();
  });

  it('401 error shows a safe dev-auth message', async () => {
    vi.mocked(createCustomer).mockRejectedValue(new ApiError('Unauthorized', 'UNAUTHORIZED', 401));
    renderRouted();

    fillRequiredName();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText(
        'Sessão local indisponível. Verifique a autenticação de desenvolvimento.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/UNAUTHORIZED/)).not.toBeInTheDocument();
  });
});
