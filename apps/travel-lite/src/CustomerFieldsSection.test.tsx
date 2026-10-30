import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ApiCall = (path: string, options?: { method?: string; body?: unknown }) => Promise<unknown>;
const apiMock = vi.fn<ApiCall>();

vi.mock('./api', () => ({ api: (path: string, options?: { method?: string; body?: unknown }) => apiMock(path, options) }));

import { CustomerFieldsSection } from './pages/CustomerFieldsSection';

const fields = [
  { field_key: 'name', label: 'Nome', group: 'Identificação', locked: true, enabled: true, required: true },
  { field_key: 'phone', label: 'Telefone', group: 'Contato', locked: false, enabled: true, required: false },
  { field_key: 'notes', label: 'Observações', group: 'Outros', locked: false, enabled: true, required: false },
];

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((_path, options) =>
    Promise.resolve({ fields: options?.method === 'PUT' ? fields : fields }),
  );
});

describe('CustomerFieldsSection', () => {
  it('shows the locked name as fixed', async () => {
    render(<CustomerFieldsSection />);
    const enabled = await screen.findByLabelText('Nome: habilitado');
    expect(enabled).toBeChecked();
    expect(enabled).toBeDisabled();
    expect(screen.getByLabelText('Nome: obrigatório')).toBeDisabled();
  });

  it('turning a field off clears and disables its required flag', async () => {
    render(<CustomerFieldsSection />);
    fireEvent.click(await screen.findByLabelText('Telefone: obrigatório'));
    expect(screen.getByLabelText('Telefone: obrigatório')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Telefone: habilitado'));
    expect(screen.getByLabelText('Telefone: obrigatório')).not.toBeChecked();
    expect(screen.getByLabelText('Telefone: obrigatório')).toBeDisabled();
  });

  it('saves only the non-locked fields and confirms', async () => {
    render(<CustomerFieldsSection />);
    fireEvent.click(await screen.findByLabelText('Telefone: obrigatório'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/settings/customers/field-settings', {
        method: 'PUT',
        body: {
          fields: [
            { field_key: 'phone', enabled: true, required: true },
            { field_key: 'notes', enabled: true, required: false },
          ],
        },
      }),
    );
    expect(await screen.findByText('Configuração salva.')).toBeInTheDocument();
  });

  it('shows the server error and keeps the choices', async () => {
    render(<CustomerFieldsSection />);
    fireEvent.click(await screen.findByLabelText('Telefone: obrigatório'));
    apiMock.mockRejectedValueOnce(new Error('Sem permissão'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    expect(await screen.findByText('Sem permissão')).toBeInTheDocument();
    expect(screen.getByLabelText('Telefone: obrigatório')).toBeChecked();
  });
});
