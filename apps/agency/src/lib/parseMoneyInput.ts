/**
 * Parses a money amount typed by the user in pt-BR style ("2300", "2300,50",
 * "2.300,50") or plain decimal ("2300.50"). Returns null for anything that is
 * not a non-negative amount with at most 2 decimals, so invalid input is never
 * silently dropped or reinterpreted.
 */
export function parseMoneyInput(raw: string): number | null {
  const text = raw.trim();
  if (text === '') return null;

  let normalized: string;
  if (text.includes(',')) {
    // comma is the decimal separator; dots may only group thousands
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(text)) return null;
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else {
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
    normalized = text;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
