import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';

const MAX_LOGO_BYTES = 150 * 1024;
const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

interface LogoFilePickerProps {
  id: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function LogoFilePicker({ id, value, disabled = false, onChange }: LogoFilePickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      setError('Escolha uma imagem PNG, JPEG ou WebP.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError('A imagem deve ter no máximo 150 KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onChange(reader.result);
      else setError('Não foi possível ler a imagem.');
    };
    reader.onerror = () => setError('Não foi possível ler a imagem.');
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-slate-700">Logo da agência</span>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          <img
            src={value}
            alt="Prévia do logo da agência"
            className="h-16 w-28 rounded-md border border-slate-200 bg-white object-contain p-2"
          />
        ) : (
          <div className="flex h-16 w-28 items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-400">
            <ImagePlus aria-hidden="true" className="h-5 w-5" />
            <span className="sr-only">Nenhum logo selecionado</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {value ? 'Escolher outra imagem' : 'Buscar imagem'}
          </button>
          {value && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => { onChange(''); setError(null); }}
              className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Remover
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            handleFile(event.currentTarget.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
      </div>
      <p className="text-xs text-slate-500">PNG, JPEG ou WebP, até 150 KB.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
