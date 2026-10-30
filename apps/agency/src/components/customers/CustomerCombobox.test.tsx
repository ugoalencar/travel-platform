import { useState } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CustomerCombobox } from './CustomerCombobox';
import { ApiError } from '../../lib/api';
import { lookupCustomers, type CustomerLookupItem } from '../../lib/customerLookup';

vi.mock('../../lib/customerLookup', () => ({
  lookupCustomers: vi.fn(),
}));

const lookupMock = vi.mocked(lookupCustomers);

const ana: CustomerLookupItem = {
  id: 'cust-ana',
  name: 'Ana Souza',
  cpf_masked: '***.982.247-**',
  birth_date: '1990-05-01',
  status: 'ACTIVE',
};

const anaLima: CustomerLookupItem = {
  id: 'cust-ana-lima',
  name: 'Ana Lima',
  cpf_masked: null,
  birth_date: null,
  status: 'ACTIVE',
};

const inactive: CustomerLookupItem = {
  id: 'cust-old',
  name: 'Ana Antiga',
  cpf_masked: null,
  birth_date: null,
  status: 'INACTIVE',
};

function renderCombobox(onSelect = vi.fn()) {
  render(
    <MemoryRouter>
      <CustomerCombobox value="" onSelect={onSelect} />
    </MemoryRouter>,
  );
  return { onSelect, input: screen.getByRole('combobox', { name: 'Cliente' }) };
}

function paste(input: HTMLElement, text: string) {
  fireEvent.paste(input, { clipboardData: { getData: () => text } });
}

describe('CustomerCombobox (Onda A, Frente 1)', () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it('searches by partial name after a short pause and lists name with birth date', async () => {
    lookupMock.mockResolvedValue([ana, anaLima]);
    const { input } = renderCombobox();

    fireEvent.change(input, { target: { value: 'an' } });

    await waitFor(() => expect(lookupMock).toHaveBeenCalledWith('an', expect.anything()));
    expect(await screen.findByRole('option', { name: /Ana Souza/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Nasc\. 01\/05\/1990/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Ana Lima/ })).toBeInTheDocument();
  });

  it('does not query the server for a single character', async () => {
    const { input } = renderCombobox();

    fireEvent.change(input, { target: { value: 'a' } });

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('drops the previous selection as soon as the text changes, so the old customer id is not kept', async () => {
    lookupMock.mockResolvedValueOnce([ana, anaLima]);
    lookupMock.mockResolvedValue([]);
    const { input, onSelect } = renderCombobox();

    fireEvent.change(input, { target: { value: 'ana' } });
    await screen.findByRole('option', { name: /Ana Souza/ });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(anaLima);

    fireEvent.change(input, { target: { value: 'Bruno' } });

    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(onSelect).not.toHaveBeenLastCalledWith(expect.objectContaining({ id: 'cust-ana-lima' }));
  });

  it('drops the previous selection when a new text is pasted', async () => {
    lookupMock.mockResolvedValueOnce([ana, anaLima]);
    lookupMock.mockResolvedValue([]);
    const { input, onSelect } = renderCombobox();

    fireEvent.change(input, { target: { value: 'ana' } });
    await screen.findByRole('option', { name: /Ana Souza/ });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(ana);

    paste(input, 'Bruno');

    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('keeps the typed text when the parent clears its value after an edit', async () => {
    lookupMock.mockResolvedValueOnce([ana]);
    lookupMock.mockResolvedValue([]);
    function Controlled() {
      const [value, setValue] = useState('cust-ana');
      return (
        <MemoryRouter>
          <CustomerCombobox value={value} onSelect={(c) => setValue(c ? c.id : '')} />
        </MemoryRouter>
      );
    }
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Cliente' });

    fireEvent.change(input, { target: { value: 'ana' } });
    await screen.findByRole('option', { name: /Ana Souza/ });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'Bruno' } });

    expect(input).toHaveValue('Bruno');
  });

  it('keeps the pasted text when the parent clears its value after a paste over a selection', async () => {
    lookupMock.mockResolvedValueOnce([ana]);
    lookupMock.mockResolvedValue([]);
    function Controlled() {
      const [value, setValue] = useState('cust-ana');
      return (
        <MemoryRouter>
          <CustomerCombobox value={value} onSelect={(c) => setValue(c ? c.id : '')} />
        </MemoryRouter>
      );
    }
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Cliente' });

    fireEvent.change(input, { target: { value: 'ana' } });
    await screen.findByRole('option', { name: /Ana Souza/ });
    fireEvent.keyDown(input, { key: 'Enter' });
    paste(input, 'Bruno');

    expect(input).toHaveValue('Bruno');
  });

  it('clears the text on a later external reset when the parent kept the old value', async () => {
    lookupMock.mockResolvedValueOnce([ana]);
    lookupMock.mockResolvedValue([]);
    const onSelect = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <CustomerCombobox value="cust-ana" onSelect={onSelect} />
      </MemoryRouter>,
    );
    const input = screen.getByRole('combobox', { name: 'Cliente' });

    fireEvent.change(input, { target: { value: 'ana' } });
    await screen.findByRole('option', { name: /Ana Souza/ });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'Bruno' } });
    expect(onSelect).toHaveBeenLastCalledWith(null);

    rerender(
      <MemoryRouter>
        <CustomerCombobox value="" onSelect={onSelect} />
      </MemoryRouter>,
    );

    expect(input).toHaveValue('');
  });

  it('selects the highlighted option with the keyboard and reports it', async () => {
    lookupMock.mockResolvedValue([ana, anaLima]);
    const { input, onSelect } = renderCombobox();

    fireEvent.change(input, { target: { value: 'ana' } });
    await screen.findByRole('option', { name: /Ana Souza/ });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith(anaLima);
    expect(input).toHaveValue('Ana Lima');
  });

  it('pastes a masked CPF, searches it at once and selects the single match', async () => {
    lookupMock.mockResolvedValue([ana]);
    const { input, onSelect } = renderCombobox();

    paste(input, '529.982.247-25');

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(ana));
    expect(lookupMock).toHaveBeenCalledWith('529.982.247-25', expect.anything());
  });

  it('pastes a CPF with spaces around it and still selects the single match', async () => {
    lookupMock.mockResolvedValue([ana]);
    const { input, onSelect } = renderCombobox();

    paste(input, '  529 982 247 25  ');

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(ana));
    expect(lookupMock).toHaveBeenCalledWith('529 982 247 25', expect.anything());
  });

  it('does not auto-select when a pasted CPF matches more than one customer', async () => {
    lookupMock.mockResolvedValue([ana, anaLima]);
    const { input, onSelect } = renderCombobox();

    paste(input, '52998224725');

    await screen.findByRole('option', { name: /Ana Lima/ });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows the empty state when nothing matches', async () => {
    lookupMock.mockResolvedValue([]);
    const { input, onSelect } = renderCombobox();

    fireEvent.change(input, { target: { value: 'zzz' } });

    expect(await screen.findByText('Nenhum cliente encontrado.')).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows the server message when the lookup fails', async () => {
    lookupMock.mockRejectedValue(new ApiError('Não autorizado.', 'FORBIDDEN', 403));
    const { input } = renderCombobox();

    fireEvent.change(input, { target: { value: 'ana' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Não autorizado.');
  });

  it('does not select a customer whose status is inactive', async () => {
    lookupMock.mockResolvedValue([inactive]);
    const { input, onSelect } = renderCombobox();

    fireEvent.change(input, { target: { value: 'ant' } });
    await screen.findByRole('option', { name: /Ana Antiga/ });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).not.toHaveBeenCalled();
  });
});
