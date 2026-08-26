import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProposalFormPage } from './ProposalFormPage';
import {
  createProposal,
  listCustomers,
  listOffers,
  ApiError,
} from '../lib/api';
import type { Proposal } from '../types/proposal';
import type { Customer } from '../types/customer';
import type { Offer } from '../types/offer';

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
    listOffers: vi.fn().mockResolvedValue([]),
    listWishes: vi.fn().mockResolvedValue([]),
    createProposal: vi.fn(),
    ApiError: MockApiError,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouted(initialEntries: string[] = ['/proposals/new']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/proposals/new" element={<ProposalFormPage />} />
        <Route path="/proposals" element={<div>Propostas page</div>} />
        <Route path="/proposals/:id" element={<div>Detalhes da proposta page</div>} />
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

const offers: Offer[] = [
  {
    id: 'o1',
    agencyId: 'a1',
    name: 'Pacote Paris',
    price: 500,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const createdProposal: Proposal = {
  id: 'p1',
  agencyId: 'a1',
  customerId: 'c1',
  proposedPrice: 100,
  discount: 10,
  total: 90,
  status: 'DRAFT',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function fillCustomer(customerId = 'c1') {
  const select = await screen.findByLabelText(/Cliente/);
  fireEvent.change(select, { target: { value: customerId } });
}

describe('ProposalFormPage', () => {
  it('renders customer selector populated from real listCustomers()', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    expect(screen.getByRole('heading', { name: 'Nova proposta' })).toBeInTheDocument();
    const select = await screen.findByLabelText(/Cliente/);
    expect(within(select).getByText('Maria Silva')).toBeInTheDocument();
  });

  it('computes a live client-side total preview as the user types (never sent as total)', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    await fillCustomer('c1');
    fireEvent.change(screen.getByLabelText(/Preço proposto/), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Desconto (valor absoluto)'), {
      target: { value: '10' },
    });

    expect(screen.getByText(/Total \(prévia\):/)).toBeInTheDocument();
    expect(screen.getByText('R$ 90,00')).toBeInTheDocument();
  });

  it('valid submit calls createProposal with only allowed fields, never total/status', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createProposal).mockResolvedValue(createdProposal);
    renderRouted();

    await fillCustomer('c1');
    fireEvent.change(screen.getByLabelText(/Preço proposto/), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Desconto (valor absoluto)'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(createProposal).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createProposal).mock.calls[0]?.[0] as unknown as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({ customerId: 'c1', proposedPrice: 100, discount: 10 });
    expect(payload).not.toHaveProperty('total');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('agencyId');
  });

  it('missing customer shows validation error and does not submit', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    await screen.findByLabelText(/Cliente/);
    fireEvent.change(screen.getByLabelText(/Preço proposto/), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Cliente é obrigatório.')).toBeInTheDocument();
    expect(createProposal).not.toHaveBeenCalled();
  });

  it('missing proposedPrice shows validation error and does not submit', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    await fillCustomer('c1');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Preço proposto é obrigatório.')).toBeInTheDocument();
    expect(createProposal).not.toHaveBeenCalled();
  });

  it('navigates to the new proposal details page on success', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createProposal).mockResolvedValue(createdProposal);
    renderRouted();

    await fillCustomer('c1');
    fireEvent.change(screen.getByLabelText(/Preço proposto/), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Detalhes da proposta page')).toBeInTheDocument();
  });

  it('pre-fills proposedPrice as a UX convenience when an Offer is selected, without sending offer sync to the server', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(listOffers).mockResolvedValue(offers);
    renderRouted();

    const offerSelect = await screen.findByLabelText('Oferta (opcional)');
    fireEvent.change(offerSelect, { target: { value: 'o1' } });

    const priceInput = screen.getByLabelText(/Preço proposto/);
    expect(priceInput).toHaveValue(500);
  });

  it('404 error shows a safe message', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createProposal).mockRejectedValue(new ApiError('Not found', 'NOT_FOUND', 404));
    renderRouted();

    await fillCustomer('c1');
    fireEvent.change(screen.getByLabelText(/Preço proposto/), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Cliente, oferta ou desejo selecionado não encontrado.'),
    ).toBeInTheDocument();
  });

  it('403 error shows a safe permission message', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    vi.mocked(createProposal).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    renderRouted();

    await fillCustomer('c1');
    fireEvent.change(screen.getByLabelText(/Preço proposto/), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Você não tem permissão para criar propostas.'),
    ).toBeInTheDocument();
  });

  it('marks required fields with * and optional fields with (opcional)', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    await screen.findByLabelText(/Cliente/);

    const customerLabel = screen.getByText((_, element) => {
      return (
        element?.tagName === 'LABEL' &&
        element.textContent?.includes('Cliente') &&
        element.textContent?.includes('*')
      );
    });
    expect(customerLabel).toBeInTheDocument();

    const optionalLabel = screen.getByText('Oferta (opcional)');
    expect(optionalLabel).toBeInTheDocument();

    const wishLabel = screen.getByText('Desejo (opcional)');
    expect(wishLabel).toBeInTheDocument();
  });

  it('error div has role="alert" for screen readers', async () => {
    vi.mocked(listCustomers).mockResolvedValue(customers);
    renderRouted();

    await screen.findByLabelText(/Cliente/);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cliente é obrigatório.');
  });
});
