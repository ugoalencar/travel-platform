import { cn } from '../../lib/utils';

// Deterministic name -> background gradient, so the same person always gets
// the same color across the app (topbar user chip, Customer 360 header,
// etc.) without persisting anything new server-side.
const GRADIENTS = [
  'from-blue-500 to-blue-600',
  'from-teal-500 to-teal-600',
  'from-violet-500 to-violet-600',
  'from-amber-500 to-amber-600',
  'from-rose-500 to-rose-600',
  'from-emerald-500 to-emerald-600',
  'from-indigo-500 to-indigo-600',
];

export function initialsFor(label: string | null | undefined): string {
  if (!label) return '?';
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

function gradientFor(label: string | null | undefined): string {
  if (!label) return GRADIENTS[0]!;
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return GRADIENTS[hash % GRADIENTS.length]!;
}

export interface AvatarProps {
  name: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-lg',
};

/** Initials-based avatar with a deterministic per-name color. No real
 * photos are tracked for customers or staff, so this is the honest
 * placeholder used everywhere a "profile picture" would go. */
export function Avatar({ name, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white',
        SIZE_CLASSES[size],
        gradientFor(name),
        className,
      )}
    >
      {initialsFor(name)}
    </span>
  );
}
