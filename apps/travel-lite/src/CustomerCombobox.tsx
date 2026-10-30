import { useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { api } from './api';
import './CustomerCombobox.css';

const DEBOUNCE_MS = 250;
const MIN_TERM_LENGTH = 2;
const RESULT_LIMIT = 10;
const CPF_DIGITS = 11;

export interface CustomerOption {
  id: string;
  name: string;
  cpf_masked: string | null;
  birth_date: string | null;
  status: string;
}

type LookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; items: CustomerOption[] }
  | { status: 'error'; message: string };

interface CustomerComboboxProps {
  label: string;
  /** Selected customer id, or '' when none. Clearing it to '' resets the field. */
  value: string;
  onSelect: (customer: CustomerOption | null) => void;
}

function formatBirthDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function optionMeta(customer: CustomerOption): string {
  const birth = customer.birth_date ? `Nasc. ${formatBirthDate(customer.birth_date)}` : 'sem data de nascimento';
  const cpf = customer.cpf_masked ? ` · CPF ${customer.cpf_masked}` : '';
  const inactive = customer.status === 'ACTIVE' ? '' : ' · inativo';
  return `${birth}${cpf}${inactive}`;
}

/**
 * Customer picker for the sale form. Searches the server by name (after a
 * short pause) or by CPF. A CPF pasted with or without mask is searched at
 * once, and selected automatically when it matches exactly one active
 * customer. Only the lookup shape is held here, never the full customer list.
 */
export function CustomerCombobox({ label, value, onSelect }: CustomerComboboxProps) {
  const inputId = useId();
  const listId = useId();
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<CustomerOption | null>(null);
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
        const params = new URLSearchParams({ q: term, limit: String(RESULT_LIMIT) });
        const { items } = await api<{ items: CustomerOption[] }>(`/customers/lookup?${params.toString()}`);
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
          message: err instanceof Error ? err.message : 'Não foi possível buscar clientes.',
        });
      }
    };

    const timer = setTimeout(() => void run(), paste ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, selected]);

  const items = lookup.status === 'ready' ? lookup.items : [];

  function choose(customer: CustomerOption) {
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
    <div className="customer-combobox">
      <div className="customer-combobox-row">
        <label className="field">
          <span>{label}</span>
          <input
            id={inputId}
            role="combobox"
            autoComplete="off"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            placeholder="Digite o nome ou cole o CPF"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setOpen(true);
              dropSelection();
            }}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onBlur={() => setOpen(false)}
          />
        </label>
        {selected ? (
          <button type="button" className="btn" aria-label="Limpar cliente" onClick={clear}>
            ×
          </button>
        ) : null}
      </div>

      {showList ? (
        <div className="customer-combobox-list">
          {lookup.status === 'loading' ? <p className="lite-muted">Buscando…</p> : null}
          {lookup.status === 'error' ? <p role="alert" className="lite-error">{lookup.message}</p> : null}
          {lookup.status === 'ready' && items.length === 0 ? (
            <p className="lite-muted">Nenhum cliente encontrado. Cadastre o cliente em Clientes.</p>
          ) : null}
          {items.length > 0 ? (
            <ul id={listId} role="listbox">
              {items.map((customer, index) => {
                const disabled = customer.status !== 'ACTIVE';
                return (
                  <li
                    key={customer.id}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    aria-disabled={disabled || undefined}
                    className={index === activeIndex ? 'active' : undefined}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      choose(customer);
                    }}
                  >
                    <span className="customer-combobox-name">{customer.name}</span>
                    <span className="customer-combobox-meta">{optionMeta(customer)}</span>
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
