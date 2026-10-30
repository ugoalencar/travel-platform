import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ApiCall = (path: string, options?: { method?: string; body?: unknown }) => Promise<unknown>;
const apiMock = vi.fn<ApiCall>();

vi.mock('./api', () => ({ api: (path: string, options?: { method?: string; body?: unknown }) => apiMock(path, options) }));
vi.mock('./auth', () => ({ useCan: () => true, useAuth: () => ({ user: { role: 'ADMIN' } }) }));

import { SalesPage } from './pages/SalesPage';

/**
 * Regression for the Codex review: after creating a sale the screen opens GET /sales/:id and reads
 * sale.customer / seller / category. The fixtures below follow the API contract (same shape as the list).
 */
const customers = [{ id: 'c1', name: 'Cliente Revisão', cpf_masked: null, birth_date: null, status: 'ACTIVE' }];
const sellers = [{ id: 's1', name: 'Vendedora Detalhe' }];
const categories = [{ id: 'k1', name: 'REVISAO' }];
const methods = [{ id: 'm1', name: 'Cartão' }];

let status = 'DRAFT';

function saleShape() {
  return {
    id: 'sale-1',
    sale_number: 'V-0001',
    customer_id: 'c1',
    seller_id: 's1',
    category_id: 'k1',
    payment_method_id: 'm1',
    description: null,
    gross_amount: 1000,
    cost_amount: 0,
    margin_amount: 1000,
    sale_date: '2026-10-22',
    due_date: '2026-12-15',
    installment_count: 2,
    status,
    notes: null,
    customer: customers[0],
    seller: sellers[0],
    category: categories[0],
    payment_method: methods[0],
  };
}

beforeEach(() => {
  status = 'DRAFT';
  apiMock.mockReset();
  apiMock.mockImplementation((path, options) => {
    if (path.startsWith('/sales?')) return Promise.resolve({ items: [saleShape()], page: 1, pageSize: 20, total: 1 });
    if (path === '/sales' && options?.method === 'POST') return Promise.resolve({ sale: { id: 'sale-1' } });
    if (path === '/sales/sale-1/confirm') {
      status = 'CONFIRMED';
      return Promise.resolve({ sale: { id: 'sale-1' } });
    }
    if (path === '/sales/sale-1') {
      return Promise.resolve({ sale: saleShape(), saleCosts: [], receivables: [], commission: null });
    }
    if (path === '/categories/k1/form') {
      return Promise.resolve({ form: { fields: [{ field_key: 'sale_date', label: 'Data da venda', type: 'date', group: 'Venda', storage: 'column', locked: true, enabled: true, required: false, sort_order: 0 }] } });
    }
    if (path.startsWith('/sales/sale-1/items')) return Promise.resolve({ items: [] });
    if (path.startsWith('/customers')) return Promise.resolve({ items: customers });
    if (path.startsWith('/sellers')) return Promise.resolve({ items: sellers });
    if (path === '/categories') return Promise.resolve({ items: categories });
    if (path === '/payment-methods') return Promise.resolve({ items: methods });
    return Promise.resolve({ items: [] });
  });
});

describe('sales screen: create, open and confirm', () => {
  it('creates a draft, opens its detail without crashing and confirms it', async () => {
    render(
      <MemoryRouter>
        <SalesPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Nova venda/ }));
    const customerInput = await screen.findByRole('combobox', { name: /Cliente/ });
    fireEvent.change(customerInput, { target: { value: 'Cliente' } });
    await screen.findByRole('option', { name: /Cliente Revisão/ });
    fireEvent.keyDown(customerInput, { key: 'Enter' });
    fireEvent.change(screen.getByLabelText(/Vendedor/), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText(/Categoria/), { target: { value: 'k1' } });
    fireEvent.change(screen.getByLabelText(/Forma de pagamento/), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText(/Valor bruto/), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(/Vencimento da 1ª parcela/), { target: { value: '2026-12-15' } });
    fireEvent.change(screen.getByLabelText(/Parcelas/), { target: { value: '2' } });
    // the category form profile loads asynchronously; the submit is enabled once it is ready
    await waitFor(() => expect(screen.getByRole('button', { name: 'Criar rascunho' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }));

    // The detail card reads sale.customer.name / seller.name / category.name.
    const heading = await screen.findByRole('heading', { name: /V-0001 — Cliente Revisão/ });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText(/Vendedora Detalhe/, { selector: '.lite-muted' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/sales/sale-1/confirm', { method: 'POST' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: /V-0001 — Cliente Revisão/ })).toBeInTheDocument();
  });
});
