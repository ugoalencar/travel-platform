import { cn } from '../../lib/utils';
import { Button } from './button';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'Algo deu errado',
  description = 'Não foi possível carregar esta informação. Tente novamente.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50/60 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="space-y-2">
        <p className="text-base font-semibold text-red-800">{title}</p>
        <p className="max-w-sm text-sm text-red-700">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
