import type { ComponentType, ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Card } from './card';

export type KpiAccent = 'revenue' | 'expense' | 'success' | 'pending' | 'neutral';

const ACCENT_CLASSES: Record<KpiAccent, { icon: string; iconBg: string }> = {
  revenue: { icon: 'text-[--color-kpi-revenue]', iconBg: 'bg-[--color-kpi-revenue-bg]' },
  expense: { icon: 'text-[--color-kpi-expense]', iconBg: 'bg-[--color-kpi-expense-bg]' },
  success: { icon: 'text-[--color-kpi-success]', iconBg: 'bg-[--color-kpi-success-bg]' },
  pending: { icon: 'text-[--color-kpi-pending]', iconBg: 'bg-[--color-kpi-pending-bg]' },
  neutral: { icon: 'text-[--color-kpi-neutral]', iconBg: 'bg-[--color-kpi-neutral-bg]' },
};

export interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: 'positive' | 'negative' | 'neutral';
  icon?: ReactNode;
  className?: string;
  /** Semantic accent for the icon chip. Defaults to neutral so existing
   * call sites that only pass an icon keep the previous plain look until
   * they opt into a KPI accent. */
  accent?: KpiAccent;
}

const DELTA_CLASSES: Record<NonNullable<StatCardProps['deltaTone']>, string> = {
  positive: 'text-[--color-status-success]',
  negative: 'text-[--color-status-danger]',
  neutral: 'text-slate-500',
};

/**
 * KPI/stat card -- icon chip (semantically colored) + label + value + trend
 * indicator. This is the "Wave 1 groundwork" component named in the shell
 * pass; dashboard call sites are migrated to the richer accent/trend props
 * in the Dashboard-content wave, not here.
 */
export function StatCard({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  icon,
  className,
  accent = 'neutral',
}: StatCardProps) {
  const accentClasses = ACCENT_CLASSES[accent];
  return (
    <Card
      className={cn(
        'flex flex-col gap-3 p-5 shadow-[--shadow-card] transition-all duration-200 hover:shadow-[--shadow-card-hover]',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        {icon && (
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-[--radius-sm]',
              accentClasses.iconBg,
              accentClasses.icon,
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        <span className="block text-3xl font-extrabold tracking-tight text-slate-900">{value}</span>
        {delta && (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-semibold leading-relaxed',
              DELTA_CLASSES[deltaTone],
            )}
          >
            {deltaTone === 'positive' && <ArrowUpRight className="h-3.5 w-3.5" />}
            {deltaTone === 'negative' && <ArrowDownRight className="h-3.5 w-3.5" />}
            {delta}
          </span>
        )}
      </div>
    </Card>
  );
}

export interface KpiCardProps extends Omit<StatCardProps, 'icon'> {
  icon: ComponentType<{ className?: string }>;
}

/**
 * Thin convenience wrapper over StatCard for the common "icon component +
 * accent" KPI usage (Wave 2 Dashboard). Kept separate from StatCard so
 * existing call sites passing a rendered `icon` node are unaffected.
 */
export function KpiCard({ icon: Icon, ...props }: KpiCardProps) {
  return <StatCard {...props} icon={<Icon className="h-4 w-4" />} />;
}
