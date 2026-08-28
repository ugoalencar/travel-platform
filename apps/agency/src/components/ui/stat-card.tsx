import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Card } from './card';

export interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: 'positive' | 'negative' | 'neutral';
  icon?: ReactNode;
  className?: string;
}

const DELTA_CLASSES: Record<NonNullable<StatCardProps['deltaTone']>, string> = {
  positive: 'text-emerald-600',
  negative: 'text-red-600',
  neutral: 'text-slate-500',
};

export function StatCard({ label, value, delta, deltaTone = 'neutral', icon, className }: StatCardProps) {
  return (
    <Card className={cn('flex flex-col gap-2 p-4', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <span className="text-2xl font-semibold text-slate-900">{value}</span>
      {delta && <span className={cn('text-xs font-medium', DELTA_CLASSES[deltaTone])}>{delta}</span>}
    </Card>
  );
}
