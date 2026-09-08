import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Select } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { EmptyState } from '../../components/ui/empty-state';
import { ErrorState } from '../../components/ui/error-state';
import { LoadingState } from '../../components/ui/loading-state';
import { Modal } from '../../components/ui/modal';
import { StatusBadge, type StatusTone } from '../../components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  ApiError,
  createTripOccurrence,
  listTripOccurrences,
  listTrips,
  updateTripOccurrence,
  type CreateTripOccurrenceInput,
  type TripOccurrence,
  type TripOccurrenceSeverity,
  type TripOccurrenceStatus,
  type TripOccurrenceType,
} from '../../lib/api';
import type { Trip } from '../../types/trip';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'success' };

const TYPE_LABELS: Record<TripOccurrenceType, string> = {
  ATRASO: 'Atraso',
  CANCELAMENTO: 'Cancelamento',
  PROBLEMA_DOCUMENTO: 'Problema de documento',
  RECLAMACAO: 'Reclamação',
  OUTRO: 'Outro',
};

const SEVERITY_LABELS: Record<TripOccurrenceSeverity, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
};

const SEVERITY_TONES: Record<TripOccurrenceSeverity, StatusTone> = {
  BAIXA: 'neutral',
  MEDIA: 'attention',
  ALTA: 'negative',
};

const STATUS_LABELS: Record<TripOccurrenceStatus, string> = {
  ABERTA: 'Aberta',
  EM_ANDAMENTO: 'Em andamento',
  RESOLVIDA: 'Resolvida',
};

const STATUS_TONES: Record<TripOccurrenceStatus, StatusTone> = {
  ABERTA: 'negative',
  EM_ANDAMENTO: 'attention',
  RESOLVIDA: 'positive',
};

const emptyForm: CreateTripOccurrenceInput = {
  tripId: '',
  type: 'OUTRO',
  description: '',
  severity: 'MEDIA',
};

export function OccurrencesPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [occurrences, setOccurrences] = useState<TripOccurrence[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CreateTripOccurrenceInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    Promise.all([listTripOccurrences(), listTrips()])
      .then(([occurrencesRes, tripsRes]) => {
        setOccurrences(occurrencesRes);
        setTrips(tripsRes);
        setState({ status: 'success' });
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar as ocorrências.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openTrips = useMemo(
    () => trips.filter((t) => t.status !== 'CANCELLED'),
    [trips],
  );

  function openCreate() {
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.tripId) {
      setFormError('Selecione a viagem.');
      return;
    }
    if (!form.description.trim()) {
      setFormError('Descreva a ocorrência.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createTripOccurrence(form);
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível registrar a ocorrência.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(occurrence: TripOccurrence, status: TripOccurrenceStatus) {
    try {
      await updateTripOccurrence(occurrence.id, { status });
      load();
    } catch (err: unknown) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Não foi possível atualizar a ocorrência.',
      });
    }
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Ocorrências" description="Incidentes operacionais registrados durante as viagens." />
        <LoadingState label="Carregando ocorrências..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ocorrências"
        description="Registro de incidentes operacionais por viagem: atrasos, cancelamentos, problemas de documento e reclamações. Distinto dos Incidentes de plataforma (SaaS) do Platform Admin."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Ocorrências' }]}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nova Ocorrência
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Ocorrências</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {occurrences.length === 0 ? (
            <EmptyState
              title="Nenhuma ocorrência registrada"
              description="Registre atrasos, cancelamentos ou outros incidentes ligados a uma viagem."
              action={
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Registrar
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Viagem</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Reportado em</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {occurrences.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">
                      {o.tripName}
                      <div className="text-xs font-normal text-slate-500">{o.customerName}</div>
                    </TableCell>
                    <TableCell>{TYPE_LABELS[o.type]}</TableCell>
                    <TableCell className="max-w-xs text-sm">{o.description}</TableCell>
                    <TableCell>
                      <StatusBadge tone={SEVERITY_TONES[o.severity]}>{SEVERITY_LABELS[o.severity]}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-xs">{o.reportedAt.slice(0, 10)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <StatusBadge tone={STATUS_TONES[o.status]}>{STATUS_LABELS[o.status]}</StatusBadge>
                        <Select
                          aria-label={`Alterar status da ocorrência ${o.id}`}
                          value={o.status}
                          onChange={(event) => {
                            void handleStatusChange(o, event.target.value as TripOccurrenceStatus);
                          }}
                          className="h-8 w-36 text-xs"
                        >
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </Select>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova Ocorrência"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => { void handleSave(); }} disabled={saving}>
              {saving ? 'Salvando...' : 'Registrar'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
          <div>
            <label htmlFor="occ-trip" className="mb-1 block text-sm font-medium text-slate-700">Viagem *</label>
            <Select
              id="occ-trip"
              value={form.tripId}
              onChange={(event) => setForm({ ...form, tripId: event.target.value })}
            >
              <option value="">Selecione a viagem</option>
              {openTrips.map((trip) => (
                <option key={trip.id} value={trip.id}>{trip.name} — {trip.destination}</option>
              ))}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="occ-type" className="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
              <Select
                id="occ-type"
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value as TripOccurrenceType })}
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="occ-severity" className="mb-1 block text-sm font-medium text-slate-700">Severidade</label>
              <Select
                id="occ-severity"
                value={form.severity ?? 'MEDIA'}
                onChange={(event) => setForm({ ...form, severity: event.target.value as TripOccurrenceSeverity })}
              >
                {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <label htmlFor="occ-description" className="mb-1 block text-sm font-medium text-slate-700">Descrição *</label>
            <Textarea
              id="occ-description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Descreva o que aconteceu"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
