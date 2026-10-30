import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, lookupCep } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export interface CepAddress {
  street: string;
  district: string;
  city: string;
  state: string;
}

interface Props {
  value: string;
  address: CepAddress;
  onChange: (value: string) => void;
  onAddress: (value: Partial<CepAddress>, expected: CepAddress) => void;
  disabled?: boolean;
}

const FIELDS = ['street', 'district', 'city', 'state'] as const;

export function CustomerCepField({
  value,
  address,
  onChange,
  onAddress,
  disabled = false,
}: Props) {
  const id = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const latest = useRef({ address, onAddress });
  const autoValues = useRef<Partial<CepAddress>>({});
  const pending = useRef<{
    baseline: CepAddress;
    dirty: Set<keyof CepAddress>;
  } | null>(null);

  useEffect(() => {
    latest.current = { address, onAddress };
    for (const field of FIELDS) {
      if (
        autoValues.current[field] !== undefined &&
        address[field] !== autoValues.current[field]
      ) {
        delete autoValues.current[field];
      }
    }
    const active = pending.current;
    if (active) {
      for (const field of FIELDS) {
        if (address[field] !== active.baseline[field]) active.dirty.add(field);
      }
    }
  }, [address, onAddress]);

  useEffect(() => {
    if (!query || query !== value || !/^\d{5}-\d{3}$/.test(query)) return;
    const controller = new AbortController();
    let active = true;
    const snapshot = {
      baseline: { ...latest.current.address },
      dirty: new Set<keyof CepAddress>(),
    };
    pending.current = snapshot;
    const timer = setTimeout(() => {
      setStatus('loading');
      setMessage('Consultando CEP...');
      void lookupCep(query.replace('-', ''), controller.signal)
        .then((result) => {
          if (!active) return;
          const incoming: Record<keyof CepAddress, string> = {
            street: result.street,
            district: result.neighborhood,
            city: result.city,
            state: result.state,
          };
          const next: Partial<CepAddress> = {};
          let preserved = false;
          for (const field of FIELDS) {
            const replaceable =
              !snapshot.baseline[field] ||
              snapshot.baseline[field] === autoValues.current[field];
            if (
              replaceable &&
              !snapshot.dirty.has(field) &&
              latest.current.address[field] === snapshot.baseline[field]
            ) {
              next[field] = incoming[field];
              autoValues.current[field] = incoming[field];
            } else if (
              incoming[field] &&
              latest.current.address[field] !== incoming[field]
            ) {
              preserved = true;
            }
          }
          latest.current.onAddress(next, snapshot.baseline);
          setStatus('done');
          setMessage(
            result.status === 'generic'
              ? 'CEP sem rua específica. Complete o endereço manualmente.'
              : preserved
                ? 'CEP consultado. Campos já preenchidos foram preservados.'
                : 'Endereço preenchido pelo ViaCEP.',
          );
        })
        .catch((error: unknown) => {
          if (!active) return;
          setStatus('error');
          setMessage(
            error instanceof ApiError
              ? error.message
              : 'Não foi possível consultar o CEP. Preencha manualmente.',
          );
        });
    }, 400);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
      if (pending.current === snapshot) pending.current = null;
    };
  }, [query, value, attempt]);

  return (
    <div>
      <label className="text-xs text-slate-500" htmlFor={id}>
        CEP
      </label>
      <Input
        id={id}
        value={value}
        placeholder="00000-000"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={9}
        disabled={disabled}
        className="mt-1"
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '').slice(0, 8);
          const masked =
            digits.length > 5
              ? `${digits.slice(0, 5)}-${digits.slice(5)}`
              : digits;
          onChange(masked);
          setQuery(masked);
          setStatus('idle');
          setMessage('');
        }}
        aria-describedby={`${id}-status`}
      />
      <span
        id={`${id}-status`}
        className={`mt-1 block text-xs ${
          status === 'error' ? 'text-red-600' : 'text-slate-500'
        }`}
        role="status"
        aria-live="polite"
      >
        {message}
      </span>
      {status === 'error' ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            setAttempt((current) => current + 1);
          }}
        >
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}
