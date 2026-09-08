import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { ErrorState } from '../../components/ui/error-state';
import { LoadingState } from '../../components/ui/loading-state';
import { StatusBadge, type StatusTone } from '../../components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { ApiError, listDocumentAlerts, type DocumentAlert, type DocumentAlertStatus } from '../../lib/api';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'success' };

const REQUIREMENT_TYPE_LABELS: Record<string, string> = {
  PASSAPORTE_VALIDO: 'Passaporte válido',
  VISTO: 'Visto',
  VACINACAO: 'Vacinação',
  SEGURO: 'Seguro',
  AUTORIZACAO: 'Autorização',
  OUTROS: 'Outros',
};

const STATUS_LABELS: Record<DocumentAlertStatus, string> = {
  PENDENTE: 'Pendente',
  EXPIRANDO: 'Expirando',
  EXPIRADO: 'Expirado',
  OK: 'Regular',
};

const STATUS_TONES: Record<DocumentAlertStatus, StatusTone> = {
  PENDENTE: 'attention',
  EXPIRANDO: 'attention',
  EXPIRADO: 'negative',
  OK: 'positive',
};

export function DocumentAlertsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [alerts, setAlerts] = useState<DocumentAlert[]>([]);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    listDocumentAlerts()
      .then((data) => {
        setAlerts(data);
        setState({ status: 'success' });
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar os alertas de documentos.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader
          title="Documentos"
          description="Requisitos de viagem pendentes ou próximos do vencimento, entre todos os clientes."
        />
        <LoadingState label="Carregando alertas de documentos..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentos"
        description="Visão operacional entre clientes: requisitos de viagem pendentes, expirando ou expirados para viagens futuras. Para o histórico documental completo de um cliente, use a aba Documentos em Cliente 360."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Documentos' }]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Alertas de Documentos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {alerts.length === 0 ? (
            <EmptyState
              title="Nenhum alerta de documento"
              description="Todos os requisitos de viagem obrigatórios estão cumpridos e em dia."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Viajante</TableHead>
                  <TableHead>Viagem</TableHead>
                  <TableHead>Requisito</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.requirementId}>
                    <TableCell className="font-medium">{alert.travelerName}</TableCell>
                    <TableCell>
                      {alert.tripName ? (
                        <>
                          {alert.tripName}
                          <div className="text-xs text-slate-500">{alert.destination}</div>
                        </>
                      ) : (
                        <span className="text-slate-400">Sem viagem vinculada</span>
                      )}
                    </TableCell>
                    <TableCell>{REQUIREMENT_TYPE_LABELS[alert.type] ?? alert.type}</TableCell>
                    <TableCell className="text-xs">{alert.expirationDate?.slice(0, 10) ?? '-'}</TableCell>
                    <TableCell>
                      <StatusBadge tone={STATUS_TONES[alert.status]}>{STATUS_LABELS[alert.status]}</StatusBadge>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/customers/${alert.customerId}`}
                        className="text-xs text-slate-600 underline-offset-2 hover:underline"
                      >
                        Ver Cliente 360
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
