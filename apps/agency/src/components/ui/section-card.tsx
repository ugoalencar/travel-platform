import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Card } from './card';

export interface SectionCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  contentClassName?: string;
}

/**
 * Titled card wrapper with consistent header/padding/shadow -- groundwork
 * for the shared "card on canvas" composition used across Dashboard,
 * Finance, and Customer 360 in later waves. Not a replacement for the
 * lower-level Card/CardHeader/CardContent primitives, just the common
 * "section with a title" shape so pages stop hand-rolling it.
 */
export function SectionCard({
  title,
  description,
  actions,
  contentClassName,
  className,
  children,
  ...props
}: SectionCardProps) {
  return (
    <Card className={cn('flex flex-col overflow-hidden', className)} {...props}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold tracking-tight text-slate-900">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className={cn('flex-1 p-5', contentClassName)}>{children}</div>
    </Card>
  );
}
