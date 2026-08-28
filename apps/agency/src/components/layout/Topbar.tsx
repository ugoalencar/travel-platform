import { Menu } from 'lucide-react';
import { Button } from '../ui/button';

export interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
      <Button
        variant="ghost"
        size="sm"
        className="md:hidden"
        onClick={onMenuClick}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <span className="text-sm font-medium text-slate-500">Agência Demo</span>
    </header>
  );
}
