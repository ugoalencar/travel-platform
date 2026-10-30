import { useEffect, useId, useRef, useState } from 'react';
import { api, ApiError } from './api';

export interface CepAddress { street: string; neighborhood: string; city: string; state: string }
interface Result extends CepAddress { status: 'ok' | 'generic'; source: 'viacep' }
interface Props {
  value: string;
  address: CepAddress;
  onChange: (value: string) => void;
  onAddress: (value: Partial<CepAddress>, expected: CepAddress) => void;
}
const FIELDS = ['street', 'neighborhood', 'city', 'state'] as const;

export function CustomerCepField({ value, address, onChange, onAddress }: Props) {
  const id = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const latest = useRef({ address, onAddress });
  const autoValues = useRef<Partial<CepAddress>>({});
  const pending = useRef<{ baseline: CepAddress; dirty: Set<keyof CepAddress> } | null>(null);

  useEffect(() => {
    latest.current = { address, onAddress };
    for (const field of FIELDS) {
      if (autoValues.current[field] !== undefined && address[field] !== autoValues.current[field]) {
        delete autoValues.current[field];
      }
    }
    const active = pending.current;
    if (active) for (const field of FIELDS) {
      if (address[field] !== active.baseline[field]) active.dirty.add(field);
    }
  }, [address, onAddress]);

  useEffect(() => {
    if (!query || query !== value || !/^\d{5}-\d{3}$/.test(query)) return;
    const controller = new AbortController();
    let active = true;
    const snapshot = { baseline: { ...latest.current.address }, dirty: new Set<keyof CepAddress>() };
    pending.current = snapshot;
    const timer = setTimeout(() => {
      setStatus('loading');
      setMessage('Consultando CEP...');
      void api<Result>(`/cep/lookup?cep=${query.replace('-', '')}`, { signal: controller.signal }).then((result) => {
        if (!active) return;
        const next: Partial<CepAddress> = {};
        let preserved = false;
        for (const field of FIELDS) {
          const replaceable = !snapshot.baseline[field] || snapshot.baseline[field] === autoValues.current[field];
          if (replaceable && !snapshot.dirty.has(field) && latest.current.address[field] === snapshot.baseline[field]) {
            next[field] = result[field];
            autoValues.current[field] = result[field];
          }
          else if (result[field] && latest.current.address[field] !== result[field]) preserved = true;
        }
        latest.current.onAddress(next, snapshot.baseline);
        setStatus('done');
        setMessage(result.status === 'generic' ? 'CEP sem rua específica. Complete o endereço manualmente.' :
          preserved ? 'CEP consultado. Campos já preenchidos foram preservados.' : 'Endereço preenchido pelo ViaCEP.');
      }).catch((error: unknown) => {
        if (!active) return;
        setStatus('error');
        setMessage(error instanceof ApiError ? error.message : 'Não foi possível consultar o CEP. Preencha manualmente.');
      });
    }, 400);
    return () => { active = false; controller.abort(); clearTimeout(timer); if (pending.current === snapshot) pending.current = null; };
  }, [query, value, attempt]);

  return <div className="field lite-more lite-cep-field">
    <label className="lite-more" htmlFor={id}>CEP</label>
    <input id={id} value={value} placeholder="00000-000" inputMode="numeric" autoComplete="postal-code" maxLength={9}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, '').slice(0, 8);
        const masked = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
        onChange(masked); setQuery(masked); setStatus('idle'); setMessage('');
      }} aria-describedby={`${id}-status`} />
    <span id={`${id}-status`} className="lite-cep-status" role="status" aria-live="polite">{message}</span>
    {status === 'error' ? <button type="button" className="btn" onClick={(event) => { event.preventDefault(); setAttempt((current) => current + 1); }}>Tentar novamente</button> : null}
  </div>;
}
