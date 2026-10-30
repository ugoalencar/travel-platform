import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CustomerFieldSettingsTab } from './CustomerFieldSettingsTab';
import * as apiModule from '../../lib/api';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof apiModule>('../../lib/api');
  return { ...actual, getCustomerFieldSettings: vi.fn(), saveCustomerFieldSettings: vi.fn() };
});

const load = vi.mocked(apiModule.getCustomerFieldSettings);
const save = vi.mocked(apiModule.saveCustomerFieldSettings);

const fields: apiModule.CustomerFieldSetting[] = [
  { fieldKey: 'name', apiField: 'name', label: 'Nome', group: 'Identificação', locked: true, enabled: true, required: true },
  { fieldKey: 'phone', apiField: 'phone', label: 'Telefone', group: 'Contato', locked: false, enabled: true, required: false },
  { fieldKey: 'rg', apiField: 'rg', label: 'RG', group: 'Documentos', locked: false, enabled: true, required: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  load.mockResolvedValue(fields);
  save.mockResolvedValue(fields);
});

describe('CustomerFieldSettingsTab', () => {
  it('shows locked fields as fixed and disabled', async () => {
    render(<CustomerFieldSettingsTab />);
    const enabled = await screen.findByLabelText('Nome: habilitado');
    expect(enabled).toBeChecked();
    expect(enabled).toBeDisabled();
    expect(screen.getByLabelText('Nome: obrigatório')).toBeDisabled();
    expect(screen.getByText(/Campo fixo/)).toBeInTheDocument();
  });

  it('disabling a field also clears its required flag and blocks making it required', async () => {
    render(<CustomerFieldSettingsTab />);
    fireEvent.click(await screen.findByLabelText('Telefone: obrigatório'));
    expect(screen.getByLabelText('Telefone: obrigatório')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Telefone: habilitado'));
    expect(screen.getByLabelText('Telefone: habilitado')).not.toBeChecked();
    expect(screen.getByLabelText('Telefone: obrigatório')).not.toBeChecked();
    expect(screen.getByLabelText('Telefone: obrigatório')).toBeDisabled();
  });

  it('sends only the non-locked fields on save and confirms', async () => {
    render(<CustomerFieldSettingsTab />);
    fireEvent.click(await screen.findByLabelText('Telefone: obrigatório'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith([
        { fieldKey: 'phone', enabled: true, required: true },
        { fieldKey: 'rg', enabled: true, required: false },
      ]),
    );
    expect(await screen.findByText('Configuração salva.')).toBeInTheDocument();
  });

  it('shows the server error and keeps the choices', async () => {
    save.mockRejectedValue(new apiModule.ApiError('Sem permissão', 'FORBIDDEN', 403));
    render(<CustomerFieldSettingsTab />);
    fireEvent.click(await screen.findByLabelText('Telefone: obrigatório'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão');
    expect(screen.getByLabelText('Telefone: obrigatório')).toBeChecked();
  });
});
