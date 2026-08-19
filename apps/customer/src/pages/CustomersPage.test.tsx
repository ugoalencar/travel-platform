import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CustomersPage } from './CustomersPage';
import { listCustomers, ApiError } from '../lib/api';
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
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CustomersPage', () => {
  it('renders the exact empty-state text when there are no customers', async () => {
    render(<CustomersPage />);

    expect(
      await screen.findByText('Nenhum cliente cadastrado ainda.'),
    ).toBeInTheDocument();
  });

  it('shows the loading text before the request resolves', () => {
    let resolvePromise: (value: Customer[]) => void = () => {};
    vi.mocked(listCustomers).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    render(<CustomersPage />);

    expect(screen.getByText('Carregando clientes...')).toBeInTheDocument();
    // avoid an unresolved-promise leak into the next test
    resolvePromise([]);
  });

  it('renders a table with real customer data, falling back to em-dash for missing optional fields', async () => {
    vi.mocked(listCustomers).mockResolvedValue([
      {
        id: 'c1',
        agencyId: 'a1',
        name: 'Maria Silva',
        email: 'maria@example.com',
        phone: '+55 11 90000-0000',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'c2',
        agencyId: 'a1',
        name: 'João Souza',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    render(<CustomersPage />);

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('maria@example.com')).toBeInTheDocument();
    expect(screen.getByText('+55 11 90000-0000')).toBeInTheDocument();

    expect(screen.getByText('João Souza')).toBeInTheDocument();
    const dashCells = screen.getAllByText('—');
    // João has no email and no phone -> two dashes
    expect(dashCells).toHaveLength(2);
  });

  it('shows the ApiError safe message on failure, never a raw/technical string', async () => {
    vi.mocked(listCustomers).mockRejectedValue(
      new ApiError('Não foi possível carregar os clientes.', 'INTERNAL_ERROR', 500),
    );

    render(<CustomersPage />);

    expect(
      await screen.findByText('Não foi possível carregar os clientes.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/INTERNAL_ERROR/)).not.toBeInTheDocument();
    expect(screen.queryByText(/TypeError/)).not.toBeInTheDocument();
  });
});
