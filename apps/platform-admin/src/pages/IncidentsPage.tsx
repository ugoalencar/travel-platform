import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

// No incident-tracking table/endpoint exists anywhere in the backend
// (confirmed: services/api/src has no incident/postmortem domain). This
// page previously showed two hardcoded fake incidents -- replaced with an
// honest empty state rather than fabricated operational telemetry.
// Real system status lives on the "Saúde do Sistema" page (/health,
// /readiness, /version), which this page links to.
export function IncidentsPage() {
  return (
    <div>
      <h1 className="mb-8 text-3xl font-bold">Incidentes</h1>

      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-slate-400" />
        <p className="mt-3 text-sm font-medium text-slate-600">
          Nenhum sistema de rastreamento de incidentes está conectado ainda.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Para status operacional em tempo real, consulte{' '}
          <Link to="/health" className="text-(--color-platform-accent) hover:underline">
            Saúde do Sistema
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
