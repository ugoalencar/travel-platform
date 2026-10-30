import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ApiCall = (path: string, options?: { method?: string; body?: unknown }) => Promise<unknown>;
const apiMock = vi.fn<ApiCall>();

vi.mock('./api', () => ({ api: (path: string, options?: { method?: string; body?: unknown }) => apiMock(path, options) }));
vi.mock('./auth', () => ({ useCan: () => true, useAuth: () => ({ user: { role: 'ADMIN' } }) }));

import { SalesPage } from './pages/SalesPage';

function sale(id: string, number: string, missing: string[]) {
  return {
    id, sale_number: number, status: 'DRAFT', sale_date: '2026-10-22', due_date: '2026-12-15',
    gross_amount: 100, cost_amount: 0, margin_amount: 100, installment_count: 1,
    customer: { id: 'c1', name: 'Cliente' }, seller: { id: 's1', name: 'Vendedor' }, category: { id: 'k1', name: 'Cat' },
    missing_required_fields: missing,
  };
}

describe('sales list: "to complete"', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path) => {
      if (path.startsWith('/sales?')) {
        const onlyIncomplete = path.includes('incomplete=true');
        const items = [sale('a', 'V-1', ['origin_text']), sale('b', 'V-2', [])].filter(
          (s) => !onlyIncomplete || s.missing_required_fields.length > 0,
        );
        return Promise.resolve({ items, page: 1, pageSize: 20, total: items.length });
      }
      return Promise.resolve({ items: [] });
    });
  });

  it('flags incomplete sales and asks the server for the filter', async () => {
    render(
      <MemoryRouter>
        <SalesPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('A completar')).toBeInTheDocument();
    expect(screen.getByText('V-2')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Só vendas a completar'));
    await waitFor(() => expect(screen.queryByText('V-2')).not.toBeInTheDocument());
    expect(apiMock.mock.calls.some(([path]) => path.includes('incomplete=true'))).toBe(true);
  });
});
