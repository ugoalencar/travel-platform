import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CustomerCombobox, type CustomerOption } from './CustomerCombobox';
import { api } from './api';

vi.mock('./api', () => ({
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

const ana: CustomerOption = {
  id: 'cust-ana',
  name: 'Ana Souza',
  cpf_masked: '***.982.247-**',
  birth_date: '1990-05-01',
  status: 'ACTIVE',
};

const anaLima: CustomerOption = {
  id: 'cust-ana-lima',
  name: 'Ana Lima',
  cpf_masked: null,
  birth_date: null,
  status: 'ACTIVE',
};

const inactive: CustomerOption = {
  id: 'cust-old',
  name: 'Ana Antiga',
  cpf_masked: null,
  birth_date: null,
  status: 'INACTIVE',
};

function renderCombobox(onSelect = vi.fn()) {
  render(<CustomerCombobox label="Cliente *" value="" onSelect={onSelect} />);
  return { onSelect, input: screen.getByRole('combobox', { name: 'Cliente *' }) };
}

function paste(input: HTMLElement, text: string) {
  fireEvent.paste(input, { clipboardData: { getData: () => text } });
}

describe('CustomerCombobox (Travel Lite sale form)', () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it('searches the lookup endpoint by partial name and lists name with birth date', async () => {
    apiMock.mockResolvedValue({ items: [ana, anaLima] });
    const { input } = renderCombobox();

    fireEvent.change(input, { target: { value: 'an' } });

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith(expect.stringContaining('/customers/lookup?q=an')));
    expect(await screen.findByRole('option', { name: /Ana Souza/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Nasc\. 01\/05\/1990/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Ana Lima/ })).toBeInTheDocument();
  });

  it('does not query the server for a single character', async () => {
    const { input } = renderCombobox();

    fireEvent.change(input, { target: { value: 'a' } });

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('selects the highlighted option with the keyboard and reports it', async () => {
    apiMock.mockResolvedValue({ items: [ana, anaLima] });
    const { input, onSelect } = renderCombobox();

    fireEvent.change(input, { target: { value: 'ana' } });
    await screen.findByRole('option', { name: /Ana Souza/ });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith(anaLima);
    expect(input).toHaveValue('Ana Lima');
  });

  it('drops the previous selection when the typed text changes', async () => {
    apiMock.mockResolvedValue({ items: [ana] });
    const { input, onSelect } = renderCombobox();

    fireEvent.change(input, { target: { value: 'ana' } });
    await screen.findByRole('option', { name: /Ana Souza/ });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(ana);

    fireEvent.change(input, { target: { value: 'Bruno' } });

    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('keeps the typed text when the parent clears its value after an edit', async () => {
    apiMock.mockResolvedValue({ items: [ana] });
    function Controlled() {
      const [value, setValue] = useState('cust-ana');
      return (
        <CustomerCombobox label="Cliente *" value={value} onSelect={(c) => setValue(c ? c.id : '')} />
      );
    }
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Cliente *' });

    fireEvent.change(input, { target: { value: 'ana' } });
    await screen.findByRole('option', { name: /Ana Souza/ });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'Bruno' } });

    expect(input).toHaveValue('Bruno');
  });

  it('keeps the pasted text when the parent clears its value after a paste over a selection', async () => {
    apiMock.mockResolvedValue({ items: [ana] });
    function Controlled() {
      const [value, setValue] = useState('cust-ana');
      return (
        <CustomerCombobox label="Cliente *" value={value} onSelect={(c) => setValue(c ? c.id : '')} />
      );
    }
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Cliente *' });

    fireEvent.change(input, { target: { value: 'ana' } });
    await screen.findByRole('option', { name: /Ana Souza/ });
    fireEvent.keyDown(input, { key: 'Enter' });
    paste(input, 'Bruno');

    expect(input).toHaveValue('Bruno');
  });

  it('clears the text on a later external reset when the parent kept the old value', async () => {
    apiMock.mockResolvedValue({ items: [ana] });
    const onSelect = vi.fn();
    const { rerender } = render(<CustomerCombobox label="Cliente *" value="cust-ana" onSelect={onSelect} />);
    const input = screen.getByRole('combobox', { name: 'Cliente *' });

    fireEvent.change(input, { target: { value: 'ana' } });
    await screen.findByRole('option', { name: /Ana Souza/ });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'Bruno' } });
    expect(onSelect).toHaveBeenLastCalledWith(null);

    rerender(<CustomerCombobox label="Cliente *" value="" onSelect={onSelect} />);

    expect(input).toHaveValue('');
  });

  it('pastes a masked CPF, searches it at once and selects the single match', async () => {
    apiMock.mockResolvedValue({ items: [ana] });
    const { input, onSelect } = renderCombobox();

    paste(input, '529.982.247-25');

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(ana));
    expect(apiMock).toHaveBeenCalledWith(expect.stringContaining('q=529.982.247-25'));
  });

  it('pastes a CPF with spaces around it and still selects the single match', async () => {
    apiMock.mockResolvedValue({ items: [ana] });
    const { input, onSelect } = renderCombobox();

    paste(input, '  52998224725  ');

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(ana));
    expect(apiMock).toHaveBeenCalledWith(expect.stringContaining('q=52998224725'));
  });

  it('does not auto-select when a pasted CPF matches more than one customer', async () => {
    apiMock.mockResolvedValue({ items: [ana, anaLima] });
    const { input, onSelect } = renderCombobox();

    paste(input, '52998224725');

    await screen.findByRole('option', { name: /Ana Lima/ });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows the empty state when nothing matches', async () => {
    apiMock.mockResolvedValue({ items: [] });
    const { input, onSelect } = renderCombobox();

    fireEvent.change(input, { target: { value: 'zzz' } });

    expect(await screen.findByText(/Nenhum cliente encontrado/)).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows the server message when the lookup fails', async () => {
    apiMock.mockRejectedValue(new Error('Sem permissão para ver clientes.'));
    const { input } = renderCombobox();

    fireEvent.change(input, { target: { value: 'ana' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão para ver clientes.');
  });

  it('does not select a customer whose status is inactive', async () => {
    apiMock.mockResolvedValue({ items: [inactive] });
    const { input, onSelect } = renderCombobox();

    fireEvent.change(input, { target: { value: 'ant' } });
    await screen.findByRole('option', { name: /Ana Antiga/ });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).not.toHaveBeenCalled();
  });
});
