import type { ComponentType } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Card } from './card';

export type KpiAccent = 'revenue' | 'expense' | 'success' | 'pending' | 'neutral';

const ACCENT_CLASSES: Record<KpiAccent, { icon: string; iconBg: string }> = {
  revenue: { icon: 'text-(--color-kpi-revenue)', iconBg: 'bg-(--color-kpi-revenue-bg)' },
  expense: { icon: 'text-(--color-kpi-expense)', iconBg: 'bg-(--color-kpi-expense-bg)' },
  success: { icon: 'text-(--color-kpi-success)', iconBg: 'bg-(--color-kpi-success-bg)' },
  pending: { icon: 'text-(--color-kpi-pending)', iconBg: 'bg-(--color-kpi-pending-bg)' },
  neutral: { icon: 'text-(--color-kpi-neutral)', iconBg: 'bg-(--color-kpi-neutral-bg)' },
};

const DELTA_CLASSES: Record<'positive' | 'negative' | 'neutral', string> = {
  positive: 'text-emerald-600',
  negative: 'text-rose-600',
  neutral: 'text-slate-500',
};

export interface KpiCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: 'positive' | 'negative' | 'neutral';
  icon: ComponentType<{ className?: string }>;
  accent?: KpiAccent;
  className?: string;
}

/** Platform Admin's local equivalent of Agency's KpiCard/StatCard -- kept as
 * a small in-app copy rather than a cross-app import (frontend apps in this
 * monorepo each have their own TS `rootDir`, which blocks clean cross-app
 * imports; duplicating this ~40-line component is simpler than fighting the
 * build config for a visual-only wave). */
export function KpiCard({ label, value, delta, deltaTone = 'neutral', icon: Icon, accent = 'neutral', className }: KpiCardProps) {
  const accentClasses = ACCENT_CLASSES[accent];
  return (
    <Card className={cn('flex flex-col gap-3 p-5 hover:shadow-(--shadow-card-hover)', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-full', accentClasses.iconBg, accentClasses.icon)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="space-y-1.5">
        <span className="block text-2xl font-extrabold tracking-tight text-slate-900">{value}</span>
        {delta && (
          <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', DELTA_CLASSES[deltaTone])}>
            {deltaTone === 'positive' && <ArrowUpRight className="h-3.5 w-3.5" />}
            {deltaTone === 'negative' && <ArrowDownRight className="h-3.5 w-3.5" />}
            {delta}
          </span>
        )}
      </div>
    </Card>
  );
}
