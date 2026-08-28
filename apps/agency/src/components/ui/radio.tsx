import * as React from 'react';
import { cn } from '../../lib/utils';

export const Radio = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type="radio"
      className={cn(
        'h-4 w-4 border-slate-300 text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
Radio.displayName = 'Radio';
