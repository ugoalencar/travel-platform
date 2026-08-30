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
    <Card className={cn('flex flex-col gap-3 p-5 transition-all duration-200 hover:shadow-md hover:border-slate-300', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
        {icon && <span className="text-slate-300">{icon}</span>}
      </div>
      <div className="space-y-1">
        <span className="block text-3xl font-bold text-slate-900">{value}</span>
        {delta && <span className={cn('text-xs font-medium leading-relaxed', DELTA_CLASSES[deltaTone])}>{delta}</span>}
      </div>
    </Card>
  );
}
