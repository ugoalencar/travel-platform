// Single shared BRL currency formatter for the customer app. Use this instead
// of ad-hoc `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`
// or `.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })` calls
// scattered across pages, so every screen renders currency identically
// (e.g. `R$ 1.234,56`).
const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * Formats a number as Brazilian Real, e.g. `formatBRL(1234.5)` -> `"R$ 1.234,50"`.
 * Returns the placeholder for `null`/`undefined` instead of throwing or
 * rendering the literal string "null"/"undefined".
 */
export function formatBRL(value: number | null | undefined, placeholder = '—'): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return placeholder;
  }
  return currencyFormatter.format(value);
}
