import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getDeparture, listSuppliers, updateDeparture } from '../lib/api';
import type {
  DepartureServiceType,
  Supplier,
  UpdateScheduledDepartureInput,
} from '../types/transport';
import { Button } from '../components/ui/button';

// productId is intentionally not editable here -- the backend
// (ALLOWED_DEPARTURE_UPDATE_FIELDS in services/api/src/app.ts) does not
// accept it on PATCH /transport/departures/:id.

interface FormFields {
  departureAt: string;
  arrivalExpectedAt: string;
  capacity: string;
  supplierId: string;
  serviceType: DepartureServiceType;
  cancelled: boolean;
  notes: string;
}

const emptyFields: FormFields = {
  departureAt: '',
  arrivalExpectedAt: '',
  capacity: '',
  supplierId: '',
  serviceType: 'OWN',
  cancelled: false,
  notes: '',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; suppliers: Supplier[] };

function toLocalInputValue(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function mapLoadErrorToMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Saída não encontrada.';
  }
  return 'Não foi possível carregar a saída. Tente novamente.';
}

function mapSubmitErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para editar saídas.';
      case 404:
        return 'Saída ou fornecedor selecionado não encontrado.';
      default:
        return 'Não foi possível salvar a saída. Tente novamente.';
    }
  }
  return 'Não foi possível salvar a saída. Tente novamente.';
}

export function DepartureEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [fields, setFields] = useState<FormFields>(emptyFields);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setLoadState({ status: 'error', message: 'Saída não encontrada.' });
      return;
    }

    setLoadState({ status: 'loading' });

    Promise.all([getDeparture(id), listSuppliers().catch(() => [])])
      .then(([departure, suppliers]) => {
        if (cancelled) return;
        setFields({
          departureAt: toLocalInputValue(departure.departureAt),
          arrivalExpectedAt: toLocalInputValue(departure.arrivalExpectedAt),
          capacity: String(departure.capacity),
          supplierId: departure.supplierId ?? '',
          serviceType: departure.serviceType,
          cancelled: departure.cancelled,
          notes: departure.notes ?? '',
        });
        setLoadState({ status: 'ready', suppliers });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadState({ status: 'error', message: mapLoadErrorToMessage(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  function updateField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
    if (key === 'capacity') {
      const numeric = Number(value);
      setValidationError(
        value !== '' && (Number.isNaN(numeric) || numeric < 0)
          ? 'Capacidade não pode ser negativa.'
          : null,
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting || !id) {
      return;
    }

    const capacity = Number(fields.capacity);
    // Client-side UX nicety only -- the server is still authoritative and
    // independently rejects negative capacity.
    if (fields.capacity.trim() !== '' && (Number.isNaN(capacity) || capacity < 0)) {
      setValidationError('Capacidade não pode ser negativa.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const input: UpdateScheduledDepartureInput = {
      serviceType: fields.serviceType,
      cancelled: fields.cancelled,
    };
    if (fields.departureAt.trim()) {
      input.departureAt = new Date(fields.departureAt).toISOString();
    }
    if (fields.arrivalExpectedAt.trim()) {
      input.arrivalExpectedAt = new Date(fields.arrivalExpectedAt).toISOString();
    }
    if (fields.capacity.trim()) input.capacity = capacity;
    if (fields.supplierId.trim()) input.supplierId = fields.supplierId.trim();
    if (fields.notes.trim()) input.notes = fields.notes.trim();

    try {
      await updateDeparture(id, input);
      void navigate(`/transport/departures/${id}`);
    } catch (err: unknown) {
      setError(mapSubmitErrorToMessage(err));
      setSubmitting(false);
    }
  }

  if (loadState.status === 'loading') {
    return <p className="text-sm text-slate-500">Carregando saída...</p>;
  }

  if (loadState.status === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Editar saída</h1>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadState.message}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Editar saída</h1>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        noValidate
        className="flex max-w-lg flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="departure-at" className="text-sm font-medium text-slate-700">
            Data/hora de saída
          </label>
          <input
            id="departure-at"
            name="departureAt"
            type="datetime-local"
            value={fields.departureAt}
            onChange={(event) => updateField('departureAt', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="departure-arrival" className="text-sm font-medium text-slate-700">
            Chegada prevista (opcional)
          </label>
          <input
            id="departure-arrival"
            name="arrivalExpectedAt"
            type="datetime-local"
            value={fields.arrivalExpectedAt}
            onChange={(event) => updateField('arrivalExpectedAt', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="departure-capacity" className="text-sm font-medium text-slate-700">
            Capacidade
          </label>
          <input
            id="departure-capacity"
            name="capacity"
            type="number"
            min="0"
            step="1"
            value={fields.capacity}
            onChange={(event) => updateField('capacity', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {validationError && <p className="text-xs text-red-600">{validationError}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="departure-supplier" className="text-sm font-medium text-slate-700">
            Fornecedor (opcional)
          </label>
          <select
            id="departure-supplier"
            name="supplierId"
            value={fields.supplierId}
            onChange={(event) => updateField('supplierId', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Nenhum</option>
            {loadState.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="departure-service-type" className="text-sm font-medium text-slate-700">
            Tipo de serviço
          </label>
          <select
            id="departure-service-type"
            name="serviceType"
            value={fields.serviceType}
            onChange={(event) => updateField('serviceType', event.target.value as DepartureServiceType)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="OWN">Próprio</option>
            <option value="SUBCONTRACTED">Subcontratado</option>
            <option value="RESELL">Revenda</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="cancelled"
            checked={fields.cancelled}
            onChange={(event) => updateField('cancelled', event.target.checked)}
          />
          Cancelada
        </label>

        <div className="flex flex-col gap-1">
          <label htmlFor="departure-notes" className="text-sm font-medium text-slate-700">
            Notas
          </label>
          <textarea
            id="departure-notes"
            name="notes"
            value={fields.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={3}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={submitting || validationError !== null}>
            {submitting ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => void navigate(`/transport/departures/${id}`)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
