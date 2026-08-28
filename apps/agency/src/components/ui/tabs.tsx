import * as React from 'react';
import { cn } from '../../lib/utils';

export interface TabItem {
  value: string;
  label: string;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export function Tabs({ items, value, onValueChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex items-center gap-1 rounded-md bg-slate-100 p-1', className)}
    >
      {items.map((item) => {
        const isActive = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onValueChange(item.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
