import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ApiCall = (path: string, options?: { method?: string; body?: unknown }) => Promise<unknown>;
const apiMock = vi.fn<ApiCall>();

vi.mock('./api', () => ({ api: (path: string, options?: { method?: string; body?: unknown }) => apiMock(path, options) }));
vi.mock('./auth', () => ({ useCan: () => true }));

import { CatalogPage } from './pages/CatalogPage';
import { CommissionsPage } from './pages/CommissionsPage';

const methods = [
  { id: 'm1', name: 'Cartão parcelado', active: true, sort_order: 1, requires_receipt: true },
  { id: 'm2', name: 'Pix à vista', active: true, sort_order: 2, requires_receipt: false },
];

const commission = (id: string, overrides: Record<string, unknown>) => ({
  id,
  sale_id: `sale-${id}`,
  seller_id: 's1',
  status: 'APPROVED',
  calculation_type: 'PERCENTAGE_ON_GROSS',
  commission_amount: 5000,
  seller_name: 'Ana',
  sale_number: `V-${id}`,
  payable_id: `p-${id}`,
  payable_status: 'OPEN',
  ...overrides,
});

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((path) => {
    if (path === '/payment-methods') return Promise.resolve({ items: methods });
    if (path.startsWith('/commissions')) {
      return Promise.resolve({
        items: [
          commission('1', { release_mode: 'ON_RECEIPT', released_amount: 500 }),
          commission('2', { release_mode: 'ON_SALE', released_amount: 5000 }),
        ],
        page: 1,
        pageSize: 20,
        total: 2,
      });
    }
    if (path.startsWith('/sellers')) return Promise.resolve({ items: [] });
    return Promise.resolve({ items: [] });
  });
});

function paymentMethodsSection(): HTMLElement {
  return screen.getByRole('heading', { name: 'Formas de pagamento', level: 2 }).closest('section')!;
}

describe('payment method receipt rule', () => {
  it('shows whether each payment method releases the commission on receipt', async () => {
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Formas de pagamento' }));
    await screen.findByText('Cartão parcelado');
    const section = paymentMethodsSection();
    expect(within(within(section).getByText('Cartão parcelado').closest('tr')!).getByText('Libera ao receber')).toBeInTheDocument();
    expect(within(within(section).getByText('Pix à vista').closest('tr')!).getByText('Direta na venda')).toBeInTheDocument();
  });

  it('sends requires_receipt when creating and editing a payment method', async () => {
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Formas de pagamento' }));
    await screen.findByText('Cartão parcelado');
    const section = paymentMethodsSection();

    fireEvent.change(within(section).getByLabelText('Nome *'), { target: { value: 'Boleto parcelado' } });
    fireEvent.click(within(section).getByLabelText(/Comissão só é liberada conforme o recebimento/));
    fireEvent.click(within(section).getByRole('button', { name: 'Adicionar' }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/payment-methods', {
        method: 'POST',
        body: { name: 'Boleto parcelado', sort_order: 0, requires_receipt: true },
      }),
    );

    fireEvent.click(within(within(section).getByText('Cartão parcelado').closest('tr')!).getByRole('button', { name: 'Editar' }));
    const checkbox = within(section).getByLabelText(/Comissão só é liberada conforme o recebimento/);
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.click(within(section).getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/payment-methods/m1', {
        method: 'PATCH',
        body: { name: 'Cartão parcelado', sort_order: 1, requires_receipt: false },
      }),
    );
  });
});

describe('commission list release column', () => {
  it('shows what is released by receipt and what is paid directly on the sale', async () => {
    render(
      <MemoryRouter>
        <CommissionsPage />
      </MemoryRouter>,
    );
    const byReceipt = (await screen.findByText('V-1')).closest('tr')!;
    expect(within(byReceipt).getByText(/Por recebimento: .*500,00 liberado/)).toBeInTheDocument();
    expect(within(screen.getByText('V-2').closest('tr')!).getByText('Direta na venda')).toBeInTheDocument();
  });
});
