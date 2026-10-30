import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderRouted } from '../test/render';
import * as api from '../lib/api';
import type { Customer } from '../types/customer';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return { ...actual, listCustomers: vi.fn(), createCustomer: vi.fn(), getCustomerFieldSettings: vi.fn() };
});

const existing: Customer = {
  id: 'cust-001',
  agencyId: 'agency-demo-001',
  protocolNumber: 'CLI-2026-000001',
  name: 'Lucas Martins',
  status: 'ACTIVE',
  createdAt: '2024-03-15T10:00:00.000Z',
  updatedAt: '2026-08-10T14:30:00.000Z',
};

const required = (fieldKey: string, apiField: string, label: string): api.CustomerFieldSetting => ({
  fieldKey,
  apiField,
  label,
  group: 'x',
  locked: false,
  enabled: true,
  required: true,
});

beforeEach(() => {
  vi.mocked(api.listCustomers).mockResolvedValue([existing]);
  vi.mocked(api.createCustomer).mockReset().mockResolvedValue({ ...existing, id: 'cust-996' });
});

describe('CustomersPage - required fields the quick form has no input for', () => {
  it('renders an input for a required field such as CPF and sends it under its API name', async () => {
    vi.mocked(api.getCustomerFieldSettings).mockResolvedValue([required('cpf', 'cpf', 'CPF')]);
    renderRouted('/customers');
    await screen.findByText('Lucas Martins');
    fireEvent.click(screen.getByRole('button', { name: /Novo cliente/ }));
    const label = await screen.findByText('CPF *');
    fireEvent.change(screen.getByPlaceholderText(/Nome completo/), { target: { value: 'Rita' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CPF');
    expect(api.createCustomer).not.toHaveBeenCalled();
    fireEvent.change(label.nextElementSibling as HTMLElement, { target: { value: '52998224725' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(api.createCustomer).toHaveBeenCalledWith(expect.objectContaining({ name: 'Rita', cpf: '52998224725' })),
    );
  });

  it('lets the user satisfy a required address with the city', async () => {
    vi.mocked(api.getCustomerFieldSettings).mockResolvedValue([required('address', 'address', 'Endereço')]);
    renderRouted('/customers');
    await screen.findByText('Lucas Martins');
    fireEvent.click(screen.getByRole('button', { name: /Novo cliente/ }));
    fireEvent.change(screen.getByPlaceholderText(/Nome completo/), { target: { value: 'Sara' } });
    const label = await screen.findByText('Endereço (cidade) *');
    fireEvent.change(label.nextElementSibling as HTMLElement, { target: { value: 'Curitiba' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(api.createCustomer).toHaveBeenCalledWith(expect.objectContaining({ address: { city: 'Curitiba' } })),
    );
  });
});
