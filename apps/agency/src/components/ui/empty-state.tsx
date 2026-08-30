import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && <div className="text-slate-300">{icon}</div>}
      <div className="space-y-2">
        <p className="text-base font-semibold text-slate-900">{title}</p>
        {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      </div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
