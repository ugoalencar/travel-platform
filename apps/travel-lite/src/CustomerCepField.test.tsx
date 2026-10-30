import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerCepField, type CepAddress } from './CustomerCepField';

const address: CepAddress = { street: '', neighborhood: '', city: '', state: '' };
const result = { status: 'ok', street: 'Rua Teste', neighborhood: 'Centro', city: 'Cidade Teste', state: 'SC', source: 'viacep' };
function Harness({ initialCep = '', initialStreet = '' }) {
  const [cep, setCep] = useState(initialCep);
  const [fields, setFields] = useState({ ...address, street: initialStreet });
  return <><CustomerCepField value={cep} address={fields} onChange={setCep} onAddress={(next, expected) => setFields((current) => ({ ...current,
    ...Object.fromEntries(Object.entries(next).filter(([field]) => current[field as keyof CepAddress] === expected[field as keyof CepAddress])),
  }))} />
    <label>Rua<input value={fields.street} onChange={(e) => setFields({ ...fields, street: e.target.value })} /></label>
    <output>{fields.city}</output><button>Salvar</button></>;
}
afterEach(() => vi.unstubAllGlobals());

describe('Customer CEP field', () => {
  it('replaces auto-filled address when the CEP changes without resetting the form', async () => {
    const fetcher = vi.fn().mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify(result))))
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ ...result, street: 'Rua Nova', city: 'Cidade Nova' }))));
    vi.stubGlobal('fetch', fetcher);
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '01001000' } });
    await waitFor(() => expect(screen.getByLabelText('Rua')).toHaveValue('Rua Teste'));
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '02002000' } });
    await waitFor(() => expect(screen.getByLabelText('Rua')).toHaveValue('Rua Nova'));
    expect(screen.getByText('Cidade Nova')).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps a street manually edited after auto-fill when looking up another CEP', async () => {
    const fetcher = vi.fn().mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify(result))))
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ ...result, street: 'Rua Nova', city: 'Cidade Nova' }))));
    vi.stubGlobal('fetch', fetcher);
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '01001000' } });
    await waitFor(() => expect(screen.getByLabelText('Rua')).toHaveValue('Rua Teste'));
    fireEvent.change(screen.getByLabelText('Rua'), { target: { value: 'Rua corrigida manualmente' } });
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '02002000' } });
    await waitFor(() => expect(screen.getByText('Cidade Nova')).toBeInTheDocument());
    expect(screen.getByLabelText('Rua')).toHaveValue('Rua corrigida manualmente');
  });

  it('loads a complete CEP and fills empty address fields', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)));
    vi.stubGlobal('fetch', fetcher);
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '01001000' } });
    expect(screen.getByLabelText('CEP')).toHaveValue('01001-000');
    await waitFor(() => expect(screen.getByLabelText('Rua')).toHaveValue('Rua Teste'));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not query on opening an existing customer, or overwrite an existing street', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)));
    vi.stubGlobal('fetch', fetcher);
    render(<Harness initialCep="01001-000" initialStreet="Rua manual" />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '01001001' } });
    await waitFor(() => expect(screen.getByText('Cidade Teste')).toBeInTheDocument());
    expect(screen.getByLabelText('Rua')).toHaveValue('Rua manual');
  });

  it('discards stale responses and preserves manual edits during the lookup', async () => {
    let finish: (value: Response) => void = () => undefined;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }))
      .mockResolvedValue(new Response(JSON.stringify(result)));
    vi.stubGlobal('fetch', fetcher);
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '01001000' } });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Rua'), { target: { value: 'Digitada durante consulta' } });
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '01001001' } });
    await waitFor(() => expect(screen.getByText('Cidade Teste')).toBeInTheDocument());
    await act(() => { finish(new Response(JSON.stringify({ ...result, city: 'Resposta antiga' }))); return Promise.resolve(); });
    expect(screen.getByLabelText('Rua')).toHaveValue('Digitada durante consulta');
    expect(screen.queryByText('Resposta antiga')).not.toBeInTheDocument();
  });

  it('leaves saving available on failures and offers a retry', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network'));
    vi.stubGlobal('fetch', fetcher);
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '01001000' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });
});
