import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

// Small fixed semantic-tone set, mirroring the customer app's StatusPill
// convention -- not an arbitrary/per-tenant color system.
export type StatusTone = 'positive' | 'attention' | 'neutral' | 'inactive';

const TONE_CLASSES: Record<StatusTone, string> = {
  positive: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 font-medium',
  attention: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 font-medium',
  neutral: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 font-medium',
  inactive: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200 font-medium',
};

export interface StatusBadgeProps {
  tone: StatusTone;
  children: ReactNode;
  className?: string;
}

export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
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
