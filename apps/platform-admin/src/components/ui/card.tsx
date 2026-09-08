import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200/70 bg-white shadow-(--shadow-card) transition-shadow duration-200',
        className,
      )}
      {...props}
    />
  );
}
