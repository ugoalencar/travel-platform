export interface FormatDateBROptions {
  assumeDateOnly?: boolean;
  includeTime?: boolean;
}

export function formatDateBR(
  value: string | Date | null | undefined,
  options: FormatDateBROptions = {},
  placeholder = '—',
): string {
  if (value === null || value === undefined || value === '') {
    return placeholder;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return placeholder;
  }

  const { assumeDateOnly = false, includeTime = false } = options;

  const formatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(includeTime && !assumeDateOnly
      ? { hour: '2-digit' as const, minute: '2-digit' as const }
      : {}),
    ...(assumeDateOnly ? { timeZone: 'UTC' } : {}),
  });

  return formatter.format(date);
}
