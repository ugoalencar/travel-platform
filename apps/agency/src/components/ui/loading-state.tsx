import { cn } from '../../lib/utils';

export interface LoadingStateProps {
  label?: string;
  className?: string;
}

export function LoadingState({ label = 'Carregando…', className }: LoadingStateProps) {
  return (
    <div
      role="status"
      className={cn('flex flex-col items-center justify-center gap-4 px-6 py-12 text-slate-500', className)}
    >
      <span
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-3 border-slate-300 border-t-slate-900"
      />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
