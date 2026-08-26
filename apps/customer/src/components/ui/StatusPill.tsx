import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

// Shared status-pill visual component for Offers/Proposals/Sales/
// Receivables. Deliberately separate from the Commercial Pipeline's
// PipelineStageColor / STAGE_COLOR_CLASSES system (services/api pipeline
// config) -- that system is agency-configurable per an explicit prior
// product decision and must not be merged with or reused by this one. This
// component only ever uses a small fixed set of semantic-neutral tones, not
// arbitrary CSS or per-agency color config.
export type StatusPillTone = 'positive' | 'attention' | 'neutral' | 'inactive';

const TONE_CLASSES: Record<StatusPillTone, string> = {
  positive: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  attention: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
  neutral: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
  inactive: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
};

export interface StatusPillProps {
  tone: StatusPillTone;
  children: ReactNode;
  className?: string;
}

export function StatusPill({ tone, children, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// Tone mappings per entity. Kept here (not inline at call sites) so every
// screen that shows a given entity's status agrees on the same tone.
export function proposalStatusTone(
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED',
): StatusPillTone {
  switch (status) {
    case 'ACCEPTED':
      return 'positive';
    case 'DRAFT':
    case 'SENT':
      return 'neutral';
    case 'DECLINED':
    case 'EXPIRED':
      return 'attention';
    case 'CANCELLED':
      return 'inactive';
    default:
      return 'neutral';
  }
}

export function saleStatusTone(
  status: 'PENDING' | 'CONFIRMED' | 'PAID' | 'CANCELLED' | 'REFUNDED',
): StatusPillTone {
  switch (status) {
    case 'PAID':
      return 'positive';
    case 'PENDING':
    case 'CONFIRMED':
      return 'neutral';
    case 'REFUNDED':
      return 'attention';
    case 'CANCELLED':
      return 'inactive';
    default:
      return 'neutral';
  }
}

export function receivableStatusTone(
  status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED',
): StatusPillTone {
  switch (status) {
    case 'PAID':
      return 'positive';
    case 'OPEN':
      return 'attention';
    case 'PARTIALLY_PAID':
      return 'neutral';
    case 'CANCELLED':
      return 'inactive';
    default:
      return 'neutral';
  }
}

export function offerStatusTone(status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED'): StatusPillTone {
  switch (status) {
    case 'ACTIVE':
      return 'positive';
    case 'EXPIRED':
      return 'attention';
    case 'INACTIVE':
      return 'inactive';
    default:
      return 'neutral';
  }
}
