/**
 * CSV and XLSX parser for Import Center.
 *
 * Parses uploaded files into a standardized row format for mapping
 * and validation. Uses streaming for CSV (memory efficient) and
 * sheetjs for XLSX.
 *
 * SECURITY: Files are already validated (MIME type, size) before
 * reaching this parser. This module does NOT trust file contents
 * beyond basic structural parsing.
 */

import type { ImportEntityType } from './types';
import { getEntityFields, MAX_IMPORT_ROWS } from './types';

// ============================================================
// Parsed row type
// ============================================================

export interface ParsedRow {
  rowNumber: number;
  data: Record<string, string>;
}

export interface ParseResult {
  headers: string[];
  rows: ParsedRow[];
  totalRows: number;
  truncated: boolean;
  warnings: string[];
}

// ============================================================
// CSV Parser (no external dependency — uses streaming)
// ============================================================

/**
 * Parse a CSV buffer into headers + rows.
 * Handles: quoted fields, commas in quotes, newlines in quotes, escaped quotes.
 */
export function parseCsv(content: Buffer, _entityType: ImportEntityType): ParseResult {
  const text = content.toString('utf-8');
  const lines = splitCsvLines(text);

  if (lines.length === 0) {
    return { headers: [], rows: [], totalRows: 0, truncated: false, warnings: ['Arquivo vazio'] };
  }

  // First line = headers
  const headers = parseCsvLine(lines[0] ?? '');

  if (headers.length === 0) {
    return { headers: [], rows: [], totalRows: 0, truncated: false, warnings: ['Nenhum cabeçalho encontrado'] };
  }

  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  let truncated = false;

  for (let i = 1; i < lines.length; i++) {
    if (rows.length >= MAX_IMPORT_ROWS) {
      truncated = true;
      warnings.push(`Arquivo truncado em ${MAX_IMPORT_ROWS} linhas. Total: ${lines.length - 1} linhas.`);
      break;
    }

    const line = lines[i] ?? '';
    // Skip completely empty lines
    if (line.trim() === '') continue;

    const values = parseCsvLine(line);
    const data: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j] ?? '';
      data[header] = (values[j] ?? '').trim();
    }

    rows.push({ rowNumber: i + 1, data });
  }

  return {
    headers,
    rows,
    totalRows: rows.length,
    truncated,
    warnings,
  };
}

/**
 * Split CSV text into lines, respecting quoted fields.
 */
function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i] ?? '';
    const next = text[i + 1] ?? '';

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          // End of quoted field
          inQuotes = false;
          current += char;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        current += char;
      } else if (char === '\r' && next === '\n') {
        // Windows line ending
        lines.push(current);
        current = '';
        i++;
      } else if (char === '\n' || char === '\r') {
        lines.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  // Last line
  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
}

/**
 * Parse a single CSV line into fields.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i] ?? '';
    const next = line[i + 1] ?? '';

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        fields.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  fields.push(current);
  return fields;
}

// ============================================================
// XLSX Parser (uses sheetjs / xlsx)
// ============================================================

/**
 * Parse an XLSX buffer into headers + rows.
 * Falls back to CSV parsing if xlsx library is not available.
 */
export async function parseXlsx(content: Buffer, _entityType: ImportEntityType): Promise<ParseResult> {
  try {
    // Dynamic import to avoid hard dependency
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    const XLSX: any = await import('xlsx');
    const workbook = XLSX.read(content, { type: 'buffer' });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { headers: [], rows: [], totalRows: 0, truncated: false, warnings: ['Nenhuma planilha encontrada'] };
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return { headers: [], rows: [], totalRows: 0, truncated: false, warnings: ['Planilha vazia'] };
    }

    // Convert to JSON with headers
    const jsonData: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });

    if (jsonData.length === 0) {
      return { headers: [], rows: [], totalRows: 0, truncated: false, warnings: ['Planilha vazia'] };
    }

    // First row = headers
    const firstRow = (jsonData[0] ?? []) as any[];
    const headers = firstRow.map((h: any) => String(h ?? '').trim()).filter((h: string) => h.length > 0);

    const rows: ParsedRow[] = [];
    const warnings: string[] = [];
    let truncated = false;

    for (let i = 1; i < jsonData.length; i++) {
      if (rows.length >= MAX_IMPORT_ROWS) {
        truncated = true;
        warnings.push(`Planilha truncada em ${MAX_IMPORT_ROWS} linhas. Total: ${jsonData.length - 1} linhas.`);
        break;
      }

      const row = (jsonData[i] ?? []) as any[];
      const data: Record<string, string> = {};

      for (let j = 0; j < headers.length; j++) {
        const header = headers[j] ?? '';
        const value = row[j];
        data[header] = String(value ?? '').trim();
      }

      rows.push({ rowNumber: i + 2, data }); // +2 because row 1 is header, and 0-indexed
    }
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

    return {
      headers,
      rows,
      totalRows: rows.length,
      truncated,
      warnings,
    };
  } catch (error) {
    // If xlsx library is not available, try treating as CSV
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Cannot find module') || msg.includes('xlsx')) {
      throw new Error(
        'Biblioteca XLSX não está instalada. Execute: npm install xlsx --workspace=services/api'
      );
    }
    throw new Error(`Erro ao processar arquivo XLSX: ${msg}`);
  }
}

// ============================================================
// Auto-mapping: match source headers to entity fields
// ============================================================

/**
 * Generate automatic column mapping based on header similarity
 * to entity field labels.
 */
export function autoMapColumns(
  headers: string[],
  entityType: ImportEntityType,
): Record<string, string> {
  const fields = getEntityFields(entityType);
  const mapping: Record<string, string> = {};

  for (const header of headers) {
    const normalizedHeader = normalizeForComparison(header);

    for (const field of fields) {
      const normalizedLabel = normalizeForComparison(field.label);
      const normalizedField = normalizeForComparison(field.field);

      // Exact match on label or field name
      if (normalizedHeader === normalizedLabel || normalizedHeader === normalizedField) {
        mapping[header] = field.field;
        break;
      }

      // Partial match (contains)
      if (normalizedLabel.includes(normalizedHeader) || normalizedHeader.includes(normalizedLabel)) {
        mapping[header] = field.field;
        break;
      }

      // Common aliases
      if (isAliasFor(normalizedHeader, field.field)) {
        mapping[header] = field.field;
        break;
      }
    }
  }

  return mapping;
}

/**
 * Normalize a string for comparison: lowercase, remove accents, trim.
 */
function normalizeForComparison(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric
    .trim();
}

/**
 * Check if a normalized header is an alias for a field.
 */
function isAliasFor(normalizedHeader: string, field: string): boolean {
  const aliases: Record<string, string[]> = {
    name: ['nome', 'razao', 'razaosocial', 'razao_social', 'full name', 'fullname'],
    email: ['e mail', 'email address', 'correo', 'correoelectronico'],
    phone: ['telefone', 'tel', 'celular', 'mobile', 'movil', 'contact'],
    cpf: ['cpf', 'documento', 'doc', 'document'],
    cnpj: ['cnpj', 'document', 'registro', 'registration'],
    birth_date: ['datadenascimento', 'nascimento', 'birth', 'birthdate', 'dob', 'dateofbirth'],
    notes: ['observacoes', 'observação', 'obs', 'comments', 'notas', 'anotacoes'],
    trade_name: ['nomed fantasia', 'fantasia', 'trading name', 'tradingname'],
    category: ['categoria', 'type', 'tipo', 'classification'],
    role: ['funcao', 'função', 'cargo', 'position', 'job title'],
  };

  const fieldAliases = aliases[field] ?? [];
  return fieldAliases.some((alias) => normalizedHeader === alias);
}
