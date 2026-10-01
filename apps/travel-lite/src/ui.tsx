import type { ReactNode } from 'react';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  DRAFT: 'Rascunho',
  CONFIRMED: 'Confirmada',
  PARTIALLY_PAID: 'Parcial',
  PAID: 'Pago',
  CANCELLED: 'Cancelada',
  OPEN: 'Em aberto',
  PENDING: 'Pendente',
  PENDING_RULE: 'Sem regra',
  APPROVED: 'Aprovada',
  OVERDUE: 'Vencido',
};

const STATUS_KIND: Record<string, string> = {
  ACTIVE: 'success',
  PAID: 'success',
  APPROVED: 'success',
  CONFIRMED: 'info',
  PENDING: 'warning',
  PARTIALLY_PAID: 'warning',
  OPEN: 'warning',
  PENDING_RULE: 'warning',
  CANCELLED: 'danger',
  INACTIVE: 'neutral',
  DRAFT: 'neutral',
};

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function StatusBadge({ status }: { status: string }) {
  const kind = STATUS_KIND[status] ?? 'neutral';
  return <span className={`badge badge-${kind}`}>{STATUS_LABELS[status] ?? status}</span>;
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="lite-error">{error}</p>;
}

export function SuccessNote({ success }: { success: string | null }) {
  if (!success) return null;
  return (
    <p className="lite-success" role="status">
      {success}
    </p>
  );
}

export function EmptyState({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="lite-empty-state">
      <p className="lite-empty">{message}</p>
      {children}
    </div>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="lite-pagination">
      <button
        type="button"
        className="btn btn-small"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Anterior
      </button>
      <span>
        Página {page} de {pages} — {total} registro(s)
      </span>
      <button
        type="button"
        className="btn btn-small"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
