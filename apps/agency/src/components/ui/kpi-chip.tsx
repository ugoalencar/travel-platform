import type { ReactNode } from 'react';
import { Card } from './card';
import { cn } from '../../lib/utils';

// Direction A visual system's colored-icon-chip stat card. Originally
// built page-local in DashboardPage.tsx; extracted here once a second
// page (Customer 360) needed the same pattern for real reuse.
const KPI_TONE_CLASSES: Record<'green' | 'blue' | 'purple' | 'orange', string> = {
  green: 'bg-(--color-kpi-green-bg) text-(--color-kpi-green-fg)',
  blue: 'bg-(--color-kpi-blue-bg) text-(--color-kpi-blue-fg)',
  purple: 'bg-(--color-kpi-purple-bg) text-(--color-kpi-purple-fg)',
  orange: 'bg-(--color-kpi-orange-bg) text-(--color-kpi-orange-fg)',
};

export function KpiChip({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone: 'green' | 'blue' | 'purple' | 'orange';
}) {
  return (
    <Card className="flex items-center gap-4 p-5 transition-all duration-200 hover:shadow-md hover:border-slate-300">
      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', KPI_TONE_CLASSES[tone])}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value}</p>
      </div>
    </Card>
  );
}
