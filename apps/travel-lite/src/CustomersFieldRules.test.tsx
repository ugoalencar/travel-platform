import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ApiCall = (path: string, options?: { method?: string; body?: unknown }) => Promise<unknown>;
const apiMock = vi.fn<ApiCall>();
let rules: Array<{ field_key: string; enabled: boolean; required: boolean }> = [];

vi.mock('./api', () => ({ api: (path: string, options?: { method?: string; body?: unknown }) => apiMock(path, options) }));
vi.mock('./auth', () => ({ useCan: () => true }));

import { CustomersPage } from './pages/CustomersPage';

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((path) => {
    if (path === '/customers/field-settings') return Promise.resolve({ fields: rules });
    if (path.startsWith('/customers?') || path === '/customers') return Promise.resolve({ items: [], total: 0 });
    return Promise.resolve({ items: [], sellers: [] });
  });
});

async function openForm() {
  render(
    <MemoryRouter>
      <CustomersPage />
    </MemoryRouter>,
  );
  await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/customers/field-settings', undefined));
  fireEvent.click((await screen.findAllByRole('button', { name: 'Novo cliente' }))[0]!);
}

describe('Lite customer form follows the field configuration', () => {
  it('hides disabled fields and does not send them', async () => {
    rules = [
      { field_key: 'whatsapp', enabled: false, required: false },
      { field_key: 'notes', enabled: false, required: false },
    ];
    await openForm();
    expect(screen.queryByText('WhatsApp')).not.toBeInTheDocument();
    expect(screen.queryByText('Observações')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Telefone')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/customers', { method: 'POST', body: { name: 'Ana' } }),
    );
  });

  it('marks required fields with an asterisk and as required inputs', async () => {
    rules = [{ field_key: 'phone', enabled: true, required: true }];
    await openForm();
    expect(screen.getByText('Telefone *')).toBeInTheDocument();
    expect(screen.getByLabelText(/Telefone/)).toBeRequired();
  });

  it('hides the whole address block when address is disabled', async () => {
    rules = [{ field_key: 'address', enabled: false, required: false }];
    await openForm();
    expect(screen.queryByText('Rua')).not.toBeInTheDocument();
    expect(screen.queryByText('Cidade')).not.toBeInTheDocument();
  });

  it('keeps every field when the configuration cannot be loaded', async () => {
    rules = [];
    apiMock.mockImplementation((path) =>
      path === '/customers/field-settings' ? Promise.reject(new Error('offline')) : Promise.resolve({ items: [], total: 0, sellers: [] }),
    );
    await openForm();
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Rua')).toBeInTheDocument();
  });
  it('editing a legacy customer sends only what changed, so a now-required empty field does not block it', async () => {
    rules = [{ field_key: 'phone', enabled: true, required: true }];
    const legacy = { id: 'c1', name: 'Antiga', status: 'ACTIVE', responsible_seller_id: null, phone: null, email: 'a@a.com' };
    apiMock.mockImplementation((path) => {
      if (path === '/customers/field-settings') return Promise.resolve({ fields: rules });
      if (path.startsWith('/customers?')) return Promise.resolve({ items: [legacy], total: 1 });
      return Promise.resolve({ items: [], sellers: [] });
    });
    render(
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>,
    );
    fireEvent.click((await screen.findAllByRole('button', { name: 'Editar' }))[0]!);
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Antiga Editada' } });
    fireEvent.submit(screen.getByLabelText(/Nome/).closest('form')!);
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/customers/c1', {
        method: 'PATCH',
        body: { name: 'Antiga Editada', status: 'ACTIVE' },
      }),
    );
  });
});
