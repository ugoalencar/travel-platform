const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatBRL(value: number | null | undefined, placeholder = '—'): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return placeholder;
  }
  return currencyFormatter.format(value);
}
