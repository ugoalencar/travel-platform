import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SalesImportPage, parseCsv } from './SalesImportPage';
import * as apiModule from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof apiModule>('../lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

const post = vi.mocked(apiModule.api.post);

const dry = {
  contentHash: 'a'.repeat(64),
  alreadyImported: false,
  plan: {
    summary: { total: 3, new: 2, alreadyImported: 0, duplicateInFile: 0, rejected: 1, toComplete: 1 },
    rows: [
      { row: 1, status: 'NEW', toComplete: [], errors: [] },
      { row: 2, status: 'NEW', toComplete: ['category', 'destination'], errors: [] },
      { row: 3, status: 'REJECTED', toComplete: [], errors: [{ column: 'customer_cpf', message: 'CPF inválido' }] },
    ],
  },
};

function csvFile(text: string) {
  const file = new File([text], 'vendas.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  post.mockImplementation((path: string) =>
    Promise.resolve({ data: path.endsWith('dry-run') ? dry : { replayed: false, contentHash: dry.contentHash, summary: { created: 2, rejected: 1 } } }),
  );
});

describe('parseCsv', () => {
  it('reads quotes and the ; separator', () => {
    expect(parseCsv('a;b\n"x;y";"z ""q"""\n')).toEqual([['a', 'b'], ['x;y', 'z "q"']]);
  });
});

describe('SalesImportPage', () => {
  async function load() {
    render(<SalesImportPage />);
    fireEvent.change(screen.getByLabelText('Sistema de origem'), { target: { value: 'BWT' } });
    fireEvent.change(screen.getByLabelText('Arquivo CSV'), {
      target: { files: [csvFile('external_ref;sale_date;customer_cpf;total;notes\nV-1;2026-09-10;52998224725;100;x\n')] },
    });
    await screen.findByLabelText('Coluna external_ref');
  }

  it('maps known headers automatically and blocks the dry run until the required columns are mapped', async () => {
    await load();
    expect(screen.getByLabelText('Coluna external_ref')).toHaveValue('external_ref');
    expect(screen.getByLabelText('Coluna notes')).toHaveValue('notes');
    fireEvent.change(screen.getByLabelText('Coluna total'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Validar (sem gravar)' })).toBeDisabled();
  });

  it('dry run shows rejections and "a completar", writes nothing, and confirm sends the validated hash', async () => {
    await load();
    fireEvent.click(screen.getByRole('button', { name: 'Validar (sem gravar)' }));
    expect(await screen.findByText(/CPF inválido/)).toBeInTheDocument();
    expect(screen.getByText(/A completar: categoria, destino/)).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![0]).toBe('/imports/sales/dry-run');
    expect(post.mock.calls[0]![1]).toMatchObject({ sourceSystem: 'BWT', rows: [{ external_ref: 'V-1', total: '100', notes: 'x' }] });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1]![0]).toBe('/imports/sales/confirm');
    expect(post.mock.calls[1]![1]).toMatchObject({ contentHash: dry.contentHash });
    expect(await screen.findByText(/2 venda\(s\) criada\(s\)/)).toBeInTheDocument();
  });

  it('shows the server error and does not offer to confirm', async () => {
    post.mockRejectedValueOnce(new Error('Sem permissão'));
    await load();
    fireEvent.click(screen.getByRole('button', { name: 'Validar (sem gravar)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão');
    expect(screen.queryByRole('button', { name: 'Confirmar importação' })).toBeNull();
  });
});
