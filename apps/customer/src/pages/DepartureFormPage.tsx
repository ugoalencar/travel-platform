import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createDeparture, listSuppliers, listTransportProducts } from '../lib/api';
import type {
  CreateScheduledDepartureInput,
  DepartureServiceType,
  Supplier,
  TransportProduct,
} from '../types/transport';
import { Button } from '../components/ui/button';

interface FormFields {
  productId: string;
  departureAt: string;
  arrivalExpectedAt: string;
  capacity: string;
  supplierId: string;
  serviceType: DepartureServiceType;
  notes: string;
}

const initialFields: FormFields = {
  productId: '',
  departureAt: '',
  arrivalExpectedAt: '',
  capacity: '',
  supplierId: '',
  serviceType: 'OWN',
  notes: '',
};

type RelationsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; products: TransportProduct[]; suppliers: Supplier[] };

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Sessão local indisponível. Verifique a autenticação de desenvolvimento.';
      case 403:
        return 'Você não tem permissão para criar saídas.';
      case 404:
        return 'Produto ou fornecedor selecionado não encontrado.';
      default:
        return 'Não foi possível salvar a saída. Tente novamente.';
    }
  }
  return 'Não foi possível salvar a saída. Tente novamente.';
}

export function DepartureFormPage() {
  const navigate = useNavigate();
  const [fields, setFields] = useState<FormFields>(initialFields);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relationsState, setRelationsState] = useState<RelationsState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    setRelationsState({ status: 'loading' });

    Promise.all([listTransportProducts(), listSuppliers().catch(() => [])])
      .then(([products, suppliers]) => {
        if (cancelled) return;
        setRelationsState({ status: 'ready', products, suppliers });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : 'Não foi possível carregar os dados relacionados.';
        setRelationsState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function updateField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const productId = fields.productId.trim();
    if (!productId) {
      setError('Produto é obrigatório.');
      return;
    }
    if (!fields.departureAt.trim()) {
      setError('Data/hora de saída é obrigatória.');
      return;
    }
    const capacity = Number(fields.capacity);
    if (fields.capacity.trim() === '' || Number.isNaN(capacity) || !Number.isInteger(capacity)) {
      setError('Capacidade é obrigatória e deve ser um número inteiro.');
      return;
    }
    // Client-side UX nicety only -- the server is still authoritative and
    // rejects negative capacity independently.
    if (capacity < 0) {
      setError('Capacidade não pode ser negativa.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const input: CreateScheduledDepartureInput = {
      productId,
      departureAt: new Date(fields.departureAt).toISOString(),
      capacity,
      serviceType: fields.serviceType,
    };
    if (fields.arrivalExpectedAt.trim()) {
      input.arrivalExpectedAt = new Date(fields.arrivalExpectedAt).toISOString();
    }
    if (fields.supplierId.trim()) input.supplierId = fields.supplierId.trim();
    if (fields.notes.trim()) input.notes = fields.notes.trim();

    try {
      const created = await createDeparture(input);
      void navigate(`/transport/departures/${created.id}`);
    } catch (err: unknown) {
      setError(mapErrorToMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Nova saída</h1>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {relationsState.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {relationsState.message}
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
          <label htmlFor="departure-product" className="text-sm font-medium text-slate-700">
            Produto
          </label>
          <select
            id="departure-product"
            name="productId"
            disabled={relationsState.status === 'loading'}
            value={fields.productId}
            onChange={(event) => updateField('productId', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">
              {relationsState.status === 'loading' ? 'Carregando produtos...' : 'Selecione um produto'}
            </option>
            {relationsState.status === 'ready' &&
              relationsState.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
          </select>
        </div>

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
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="departure-supplier" className="text-sm font-medium text-slate-700">
            Fornecedor (opcional)
          </label>
          <select
            id="departure-supplier"
            name="supplierId"
            disabled={relationsState.status === 'loading'}
            value={fields.supplierId}
            onChange={(event) => updateField('supplierId', event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Nenhum</option>
            {relationsState.status === 'ready' &&
              relationsState.suppliers.map((supplier) => (
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
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => void navigate('/transport/departures')}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
