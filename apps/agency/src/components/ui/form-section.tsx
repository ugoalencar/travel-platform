import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface FormSectionProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  /** Number of columns the field grid should use at the `sm` breakpoint and up. Defaults to 2. */
  columns?: 1 | 2 | 3;
}

const COLUMN_CLASSES: Record<1 | 2 | 3, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
};

/**
 * A titled block of a form, laid out as a responsive multi-column field
 * grid. Used to break long forms (Fornecedores, Funcionários, Clientes)
 * into "Dados principais / Contato / Financeiro / ..." sections instead of
 * a single dense column of 20 fields, per the visual-polish blueprint.
 *
 * Usage:
 *   <FormSection title="Dados Pessoais" description="Identificação do funcionário">
 *     <LabeledInput ... />
 *     <LabeledInput ... />
 *   </FormSection>
 *
 * Each direct child occupies one grid cell; pass a wrapper with
 * `sm:col-span-2` (etc.) on a child to let it span full width.
 */
export function FormSection({
  title,
  description,
  columns = 2,
  className,
  children,
  ...props
}: FormSectionProps) {
  return (
    <div className={cn('rounded-lg border border-slate-200 bg-white', className)} {...props}>
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      <div className={cn('grid grid-cols-1 gap-4 p-4', COLUMN_CLASSES[columns])}>{children}</div>
    </div>
  );
}
