import { useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '../ui/input';
import { ApiError } from '../../lib/api';
import { lookupCustomers, type CustomerLookupItem } from '../../lib/customerLookup';
import { formatDateBR } from '../../lib/formatDateBR';

const DEBOUNCE_MS = 250;
const MIN_TERM_LENGTH = 2;
const RESULT_LIMIT = 10;
const CPF_DIGITS = 11;

type LookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; items: CustomerLookupItem[] }
  | { status: 'error'; message: string };

interface CustomerComboboxProps {
  /** Selected customer id, or '' when none. Clearing it to '' resets the field. */
  value: string;
  onSelect: (customer: CustomerLookupItem | null) => void;
}

function optionMeta(customer: CustomerLookupItem): string {
  const birth = customer.birth_date
    ? `Nasc. ${formatDateBR(customer.birth_date, { assumeDateOnly: true })}`
    : 'sem data de nascimento';
  const cpf = customer.cpf_masked ? ` · CPF ${customer.cpf_masked}` : '';
  const inactive = customer.status === 'ACTIVE' ? '' : ' · inativo';
  return `${birth}${cpf}${inactive}`;
}

/**
 * Customer picker for sale forms. Searches the server by name (after a short
 * pause) or by CPF. A CPF pasted with or without mask is searched at once,
 * and selected automatically when it matches exactly one active customer.
 * Only the minimal lookup shape is held here, never the full customer list.
 */
export function CustomerCombobox({ value, onSelect }: CustomerComboboxProps) {
  const inputId = useId();
  const listId = useId();
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<CustomerLookupItem | null>(null);
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const requestRef = useRef(0);
  const pasteRef = useRef<{ autoSelect: boolean } | null>(null);
  const onSelectRef = useRef(onSelect);
  const previousValueRef = useRef(value);
  const droppingRef = useRef(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const previous = previousValueRef.current;
    previousValueRef.current = value;
    if (previous && value === '') {
      setSelected(null);
      if (!droppingRef.current) setText('');
      setLookup({ status: 'idle' });
    }
  }, [value]);

  useEffect(() => {
    droppingRef.current = false;
  });

  function dropSelection() {
    if (!selected) return;
    droppingRef.current = true;
    setSelected(null);
    onSelect(null);
  }

  useEffect(() => {
    const term = text.trim();
    if (selected && text === selected.name) return;

    const paste = pasteRef.current;
    pasteRef.current = null;
    const requestId = ++requestRef.current;

    if (term.length < MIN_TERM_LENGTH) {
      setLookup({ status: 'idle' });
      return;
    }

    const run = async () => {
      setLookup({ status: 'loading' });
      try {
        const items = await lookupCustomers(term, { limit: RESULT_LIMIT });
        if (requestId !== requestRef.current) return;
        setLookup({ status: 'ready', items });
        setActiveIndex(0);
        const [only] = items;
        if (paste?.autoSelect && items.length === 1 && only && only.status === 'ACTIVE') {
          setSelected(only);
          setText(only.name);
          setOpen(false);
          onSelectRef.current(only);
        }
      } catch (err: unknown) {
        if (requestId !== requestRef.current) return;
        setLookup({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Não foi possível buscar clientes.',
        });
      }
    };

    const timer = setTimeout(() => void run(), paste ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, selected]);

  const items = lookup.status === 'ready' ? lookup.items : [];

  function choose(customer: CustomerLookupItem) {
    if (customer.status !== 'ACTIVE') return;
    setSelected(customer);
    setText(customer.name);
    setOpen(false);
    onSelect(customer);
  }

  function clear() {
    setSelected(null);
    setText('');
    setLookup({ status: 'idle' });
    onSelect(null);
  }

  function handleChange(nextText: string) {
    if (selected && nextText !== selected.name) dropSelection();
    setText(nextText);
    setOpen(true);
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text');
    if (!pasted) return;
    event.preventDefault();
    const digits = pasted.replace(/\D/g, '');
    pasteRef.current = { autoSelect: digits.length === CPF_DIGITS };
    dropSelection();
    setOpen(true);
    setText(pasted);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, Math.max(items.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open && items[activeIndex]) {
      event.preventDefault();
      choose(items[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const showList = open && text.trim().length >= MIN_TERM_LENGTH;
  const activeId = showList && items[activeIndex] ? `${listId}-${activeIndex}` : undefined;

  return (
    <div className="relative">
      <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-slate-700">
        Cliente
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          role="combobox"
          autoComplete="off"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          placeholder="Digite o nome ou cole o CPF"
          value={text}
          onChange={(event) => handleChange(event.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onBlur={() => setOpen(false)}
        />
        {selected ? (
          <button
            type="button"
            aria-label="Limpar cliente"
            className="rounded-md border border-slate-300 px-2 text-sm text-slate-600 hover:bg-slate-50"
            onClick={clear}
          >
            ×
          </button>
        ) : null}
      </div>

      {showList ? (
        <div className="absolute z-10 mt-1 w-max min-w-full max-w-[min(36rem,calc(100vw-2rem))] rounded-md border border-slate-200 bg-white text-sm shadow-lg">
          {lookup.status === 'loading' ? <p className="px-3 py-2 text-slate-500">Buscando…</p> : null}
          {lookup.status === 'error' ? (
            <p role="alert" className="px-3 py-2 text-red-700">
              {lookup.message}
            </p>
          ) : null}
          {lookup.status === 'ready' && items.length === 0 ? (
            <p className="px-3 py-2 text-slate-600">
              <span>Nenhum cliente encontrado.</span>{' '}
              <Link to="/customers" className="underline">
                Cadastrar novo
              </Link>
            </p>
          ) : null}
          {items.length > 0 ? (
            <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1">
              {items.map((customer, index) => {
                const disabled = customer.status !== 'ACTIVE';
                return (
                  <li
                    key={customer.id}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    aria-disabled={disabled || undefined}
                    className={`cursor-pointer px-3 py-2 ${index === activeIndex ? 'bg-slate-100' : ''} ${disabled ? 'text-slate-400' : 'text-slate-900'}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      choose(customer);
                    }}
                  >
                    <span className="block break-words font-medium">{customer.name}</span>
                    <span className="block text-xs text-slate-500">{optionMeta(customer)}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
