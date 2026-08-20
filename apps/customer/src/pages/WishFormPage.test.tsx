import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { WishFormPage } from './WishFormPage';
import { WishesPage } from './WishesPage';
import { createWish, listCustomers, listWishes, ApiError } from '../lib/api';
import type { Wish } from '../types/wish';
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
    listWishes: vi.fn().mockResolvedValue([]),
    listCustomers: vi.fn().mockResolvedValue([]),
    createWish: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/wishes/new']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/wishes" element={<WishesPage />} />
        <Route path="/wishes/new" element={<WishFormPage />} />
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
  {
    id: 'c2',
    agencyId: 'a1',
    name: 'João Souza',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const createdWish: Wish = {
  id: 'w1',
  agencyId: 'a1',
  customerId: 'c1',
  destination: 'Paris',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function fillCustomer(customerId = 'c1') {
  const select = await screen.findByLabelText('Cliente');
  fireEvent.change(select, { target: { value: customerId } });
}

describe('WishFormPage', () => {
  it('renders customer selector populated from mocked listCustomers()', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    expect(screen.getByRole('heading', { name: 'Novo desejo' })).toBeInTheDocument();
    const select = await screen.findByLabelText('Cliente');
    expect(within(select).getByText('Maria Silva')).toBeInTheDocument();
    expect(within(select).getByText('João Souza')).toBeInTheDocument();
  });

  it('valid submit calls createWish with customerId and no agencyId/tenantId/status', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createWish).mockResolvedValue(createdWish);
    renderRouted();

    await fillCustomer('c1');
    fireEvent.change(screen.getByLabelText('Destino'), {
      target: { value: 'Paris' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(createWish).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createWish).mock.calls[0]?.[0] as unknown as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({ customerId: 'c1', destination: 'Paris' });
    expect(payload).toHaveProperty('customerId');
    expect(payload).not.toHaveProperty('agencyId');
    expect(payload).not.toHaveProperty('tenantId');
    expect(payload).not.toHaveProperty('status');
  });

  it('missing customer shows validation error and does not submit', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    await screen.findByLabelText('Cliente');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Cliente é obrigatório.')).toBeInTheDocument();
    expect(createWish).not.toHaveBeenCalled();
  });

  it('shows submitting state and disables the submit button while saving', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    let resolvePromise: (value: Wish) => void = () => {};
    vi.mocked(createWish).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    renderRouted();

    await fillCustomer('c1');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('button', { name: 'Salvando...' })).toBeDisabled();

    resolvePromise(createdWish);
    await waitFor(() => expect(createWish).toHaveBeenCalledTimes(1));
  });

  it('blocks double submit — rapid double-click calls createWish exactly once', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    let resolvePromise: (value: Wish) => void = () => {};
    vi.mocked(createWish).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    renderRouted();

    await fillCustomer('c1');
    const submitButton = screen.getByRole('button', { name: 'Salvar' });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(createWish).toHaveBeenCalledTimes(1);

    resolvePromise(createdWish);
    await waitFor(() => expect(createWish).toHaveBeenCalledTimes(1));
  });

  it('navigates to /wishes on success', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(listWishes).mockResolvedValue([]);
    vi.mocked(createWish).mockResolvedValue(createdWish);
    renderRouted();

    await fillCustomer('c1');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('heading', { name: 'Desejos' })).toBeInTheDocument();
  });

  it('cancel does not call createWish and navigates back to /wishes', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(listWishes).mockResolvedValue([]);
    renderRouted();

    await screen.findByLabelText('Cliente');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(createWish).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Desejos' })).toBeInTheDocument();
  });

  it('empty customer list shows a safe message, no crash', async () => {
    vi.mocked(listCustomers).mockResolvedValue([]);
    renderRouted();

    expect(
      await screen.findByText(
        /Nenhum cliente disponível\. Cadastre um cliente antes de criar um desejo\./,
      ),
    ).toBeInTheDocument();
  });

  it('400 error displays the backend message', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createWish).mockRejectedValue(
      new ApiError('Field "customerId" is required', 'VALIDATION_ERROR', 400),
    );
    renderRouted();

    await fillCustomer('c1');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Field "customerId" is required'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/VALIDATION_ERROR/)).not.toBeInTheDocument();
  });

  it('403 error shows a safe permission message', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createWish).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    renderRouted();

    await fillCustomer('c1');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Você não tem permissão para criar desejos.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/FORBIDDEN/)).not.toBeInTheDocument();
  });

  it('404 error shows a safe message', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createWish).mockRejectedValue(new ApiError('Not found', 'NOT_FOUND', 404));
    renderRouted();

    await fillCustomer('c1');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Cliente selecionado não encontrado.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/NOT_FOUND/)).not.toBeInTheDocument();
  });

  it('500/unknown error shows a generic safe message, never raw text', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createWish).mockRejectedValue(
      new ApiError('Internal server error', 'INTERNAL_ERROR', 500),
    );
    renderRouted();

    await fillCustomer('c1');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Não foi possível salvar o desejo. Tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/INTERNAL_ERROR/)).not.toBeInTheDocument();
    expect(screen.queryByText('Internal server error')).not.toBeInTheDocument();
  });

  it('401 error shows a safe dev-auth message', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createWish).mockRejectedValue(new ApiError('Unauthorized', 'UNAUTHORIZED', 401));
    renderRouted();

    await fillCustomer('c1');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText(
        'Sessão local indisponível. Verifique a autenticação de desenvolvimento.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/UNAUTHORIZED/)).not.toBeInTheDocument();
  });
});
