import { act, fireEvent, render, screen } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { CustomerCepField, type CepAddress } from './CustomerCepField';

const { ApiError, lookupCep } = api;
type CepLookupResult = api.CepLookupResult;

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return { ...actual, lookupCep: vi.fn() };
});

const EMPTY: CepAddress = { street: '', district: '', city: '', state: '' };
const STREET_RESULT: CepLookupResult = {
  status: 'ok',
  street: 'Praça da Sé',
  neighborhood: 'Sé',
  city: 'São Paulo',
  state: 'SP',
  source: 'viacep',
};
const GENERIC_RESULT: CepLookupResult = {
  status: 'generic',
  street: '',
  neighborhood: '',
  city: 'Campinas',
  state: 'SP',
  source: 'viacep',
};
const FIELDS = ['street', 'district', 'city', 'state'] as const;

function Harness({
  initialCep = '',
  initialAddress = EMPTY,
}: {
  initialCep?: string;
  initialAddress?: CepAddress;
}) {
  const [cep, setCep] = useState(initialCep);
  const [address, setAddress] = useState(initialAddress);
  const applyAddress = useCallback(
    (next: Partial<CepAddress>, expected: CepAddress) => {
      setAddress((current) => {
        let changed = false;
        const updated = { ...current };
        for (const field of FIELDS) {
          const value = next[field];
          if (
            value !== undefined &&
            current[field] === expected[field] &&
            current[field] !== value
          ) {
            updated[field] = value;
            changed = true;
          }
        }
        return changed ? updated : current;
      });
    },
    [],
  );
  const update = (field: keyof CepAddress, value: string) => {
    setAddress((current) => ({ ...current, [field]: value }));
  };
  return (
    <div>
      <CustomerCepField
        value={cep}
        address={address}
        onChange={setCep}
        onAddress={applyAddress}
      />
      <label>
        Rua
        <input
          value={address.street}
          onChange={(event) => update('street', event.target.value)}
        />
      </label>
      <label>
        Bairro
        <input
          value={address.district}
          onChange={(event) => update('district', event.target.value)}
        />
      </label>
      <label>
        Cidade
        <input
          value={address.city}
          onChange={(event) => update('city', event.target.value)}
        />
      </label>
      <label>
        Estado
        <input
          value={address.state}
          onChange={(event) => update('state', event.target.value)}
        />
      </label>
    </div>
  );
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.mocked(lookupCep).mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CustomerCepField', () => {
  it('queries only after the debounce and fills every address field', async () => {
    vi.mocked(lookupCep).mockResolvedValue(STREET_RESULT);
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('CEP'), {
      target: { value: '01001-000' },
    });
    await advance(399);
    expect(lookupCep).not.toHaveBeenCalled();
    await advance(1);
    expect(vi.mocked(lookupCep).mock.calls[0]?.[0]).toBe('01001000');
    expect(vi.mocked(lookupCep).mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
    expect(screen.getByLabelText('Rua')).toHaveValue('Praça da Sé');
    expect(screen.getByLabelText('Bairro')).toHaveValue('Sé');
    expect(screen.getByLabelText('Cidade')).toHaveValue('São Paulo');
    expect(screen.getByLabelText('Estado')).toHaveValue('SP');
  });

  it('does not query when the modal opens with an existing address', async () => {
    render(
      <Harness
        initialCep="01001-000"
        initialAddress={{
          street: 'Rua Existente',
          district: 'Centro',
          city: 'São Paulo',
          state: 'SP',
        }}
      />,
    );
    await advance(1000);
    expect(lookupCep).not.toHaveBeenCalled();
  });

  it('preserves a field edited manually while the lookup is in flight', async () => {
    let resolve: (value: CepLookupResult) => void = () => undefined;
    vi.mocked(lookupCep).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('CEP'), {
      target: { value: '01001-000' },
    });
    await advance(400);
    fireEvent.change(screen.getByLabelText('Rua'), {
      target: { value: 'Rua Manual' },
    });
    await act(async () => {
      resolve(STREET_RESULT);
      await Promise.resolve();
    });
    expect(screen.getByLabelText('Rua')).toHaveValue('Rua Manual');
    expect(screen.getByLabelText('Cidade')).toHaveValue('São Paulo');
  });

  it('discards an older response when the CEP changes', async () => {
    let resolveFirst: (value: CepLookupResult) => void = () => undefined;
    let resolveSecond: (value: CepLookupResult) => void = () => undefined;
    vi.mocked(lookupCep)
      .mockReturnValueOnce(
        new Promise((done) => {
          resolveFirst = done;
        }),
      )
      .mockReturnValueOnce(
        new Promise((done) => {
          resolveSecond = done;
        }),
      );
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('CEP'), {
      target: { value: '01001-000' },
    });
    await advance(400);
    fireEvent.change(screen.getByLabelText('CEP'), {
      target: { value: '13010-000' },
    });
    await advance(400);
    expect(lookupCep).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolveSecond(GENERIC_RESULT);
      await Promise.resolve();
    });
    await act(async () => {
      resolveFirst(STREET_RESULT);
      await Promise.resolve();
    });
    expect(screen.getByLabelText('Cidade')).toHaveValue('Campinas');
    expect(screen.getByLabelText('Rua')).toHaveValue('');
  });

  it('clears a previously filled street when the new CEP is generic', async () => {
    vi.mocked(lookupCep)
      .mockResolvedValueOnce(STREET_RESULT)
      .mockResolvedValueOnce(GENERIC_RESULT);
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('CEP'), {
      target: { value: '01001-000' },
    });
    await advance(400);
    expect(screen.getByLabelText('Rua')).toHaveValue('Praça da Sé');
    fireEvent.change(screen.getByLabelText('CEP'), {
      target: { value: '13010-000' },
    });
    await advance(400);
    expect(screen.getByLabelText('Rua')).toHaveValue('');
    expect(screen.getByLabelText('Cidade')).toHaveValue('Campinas');
  });

  it('keeps manual fields when a later generic CEP arrives', async () => {
    vi.mocked(lookupCep)
      .mockResolvedValueOnce(STREET_RESULT)
      .mockResolvedValueOnce(GENERIC_RESULT);
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('CEP'), {
      target: { value: '01001-000' },
    });
    await advance(400);
    fireEvent.change(screen.getByLabelText('Rua'), {
      target: { value: 'Rua Manual' },
    });
    fireEvent.change(screen.getByLabelText('CEP'), {
      target: { value: '13010-000' },
    });
    await advance(400);
    expect(screen.getByLabelText('Rua')).toHaveValue('Rua Manual');
    expect(screen.getByLabelText('Cidade')).toHaveValue('Campinas');
  });

  it('shows a retry action after a lookup failure and succeeds on retry', async () => {
    vi.mocked(lookupCep)
      .mockRejectedValueOnce(new ApiError('Falha ao consultar CEP.', 'CEP_UNAVAILABLE', 502))
      .mockResolvedValueOnce(STREET_RESULT);
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('CEP'), {
      target: { value: '01001-000' },
    });
    await advance(400);
    expect(screen.getByText('Falha ao consultar CEP.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await advance(400);
    expect(lookupCep).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Rua')).toHaveValue('Praça da Sé');
  });

  it('aborts the request when the field unmounts', async () => {
    vi.mocked(lookupCep).mockReturnValue(new Promise(() => undefined));
    const { unmount } = render(<Harness />);
    fireEvent.change(screen.getByLabelText('CEP'), {
      target: { value: '01001-000' },
    });
    await advance(400);
    const signal = vi.mocked(lookupCep).mock.calls[0]?.[1];
    expect(signal).toBeInstanceOf(AbortSignal);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('never calls ViaCEP directly from the browser', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(lookupCep).mockResolvedValue(STREET_RESULT);
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('CEP'), {
      target: { value: '01001-000' },
    });
    await advance(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
