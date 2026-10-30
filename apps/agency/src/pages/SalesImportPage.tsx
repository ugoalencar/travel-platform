import { useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { api } from '../lib/api';

/** Columns the server accepts (mirrors IMPORT_COLUMNS in services/api/src/sales-import-plan.ts). */
export const SALES_IMPORT_COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'external_ref', label: 'Código da venda no sistema de origem' },
  { key: 'sale_date', label: 'Data da venda' },
  { key: 'customer_cpf', label: 'CPF do cliente' },
  { key: 'category', label: 'Categoria' },
  { key: 'supplier', label: 'Fornecedor' },
  { key: 'total', label: 'Valor total' },
  { key: 'discount', label: 'Desconto' },
  { key: 'origin', label: 'Origem' },
  { key: 'destination', label: 'Destino' },
  { key: 'travel_start_date', label: 'Início da viagem' },
  { key: 'notes', label: 'Observações' },
];
const MAX_ROWS = 2000;

interface PlanRow {
  row: number;
  status: 'NEW' | 'ALREADY_IMPORTED' | 'DUPLICATE_IN_FILE' | 'REJECTED';
  toComplete: string[];
  errors: Array<{ column: string; message: string }>;
}
interface DryRun {
  contentHash: string;
  alreadyImported: boolean;
  plan: { summary: Record<string, number>; rows: PlanRow[] };
}

const STATUS_LABEL: Record<PlanRow['status'], string> = {
  NEW: 'Nova',
  ALREADY_IMPORTED: 'Já importada',
  DUPLICATE_IN_FILE: 'Repetida no arquivo',
  REJECTED: 'Rejeitada',
};
const COMPLETE_LABEL: Record<string, string> = { category: 'categoria', supplier: 'fornecedor', destination: 'destino' };

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Small CSV reader (quotes, ";" or "," separator). Returns [] for an empty file. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export function SalesImportPage() {
  const [sourceSystem, setSourceSystem] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [result, setResult] = useState<{ replayed: boolean; summary: Record<string, unknown> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDryRun(null);
    setResult(null);
    setError(null);
  }

  async function onFile(file: File | undefined) {
    reset();
    if (!file) return;
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) {
      setHeaders([]);
      setData([]);
      setError('O arquivo precisa ter um cabeçalho e ao menos uma linha.');
      return;
    }
    if (parsed.length - 1 > MAX_ROWS) {
      setHeaders([]);
      setData([]);
      setError(`O arquivo tem mais de ${MAX_ROWS} linhas. Divida em partes menores.`);
      return;
    }
    const head = parsed[0]!;
    const known = new Set(SALES_IMPORT_COLUMNS.map((c) => c.key));
    const auto: Record<number, string> = {};
    head.forEach((h, i) => {
      const key = normalizeHeader(h);
      if (known.has(key) && !Object.values(auto).includes(key)) auto[i] = key;
    });
    setHeaders(head);
    setData(parsed.slice(1));
    setMapping(auto);
  }

  function buildRows(): Array<Record<string, string>> {
    return data.map((cells) => {
      const out: Record<string, string> = {};
      Object.entries(mapping).forEach(([index, key]) => {
        if (key) out[key] = (cells[Number(index)] ?? '').trim();
      });
      return out;
    });
  }

  const mapped = new Set(Object.values(mapping).filter(Boolean));
  const mappingOk = mapped.has('external_ref') && mapped.has('sale_date') && mapped.has('customer_cpf') && mapped.has('total');

  async function runDry() {
    setBusy(true);
    reset();
    try {
      const { data: res } = await api.post<DryRun>('/imports/sales/dry-run', { sourceSystem: sourceSystem.trim(), rows: buildRows() });
      setDryRun(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível validar o arquivo.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!dryRun) return;
    setBusy(true);
    setError(null);
    try {
      const { data: res } = await api.post<{ replayed: boolean; summary: Record<string, unknown> }>('/imports/sales/confirm', {
        sourceSystem: sourceSystem.trim(),
        rows: buildRows(),
        contentHash: dryRun.contentHash,
      });
      setResult(res);
      setDryRun(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível importar.');
    } finally {
      setBusy(false);
    }
  }

  const summary = dryRun?.plan.summary;
  const problems = dryRun?.plan.rows.filter((r) => r.status === 'REJECTED' || r.toComplete.length > 0) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Importar vendas" />
      <Card>
        <CardHeader>
          <CardTitle>1. Arquivo e mapeamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>
            Vendas importadas são históricas: não geram comissão nem contas a receber. Reenviar o mesmo arquivo, ou vendas que já foram
            importadas, não cria duplicidade. Campos obrigatórios da categoria não são exigidos: a venda entra como “a completar”.
          </p>
          <label className="block">
            Sistema de origem
            <input
              aria-label="Sistema de origem"
              className="ml-2 rounded-md border border-slate-300 px-2 py-1"
              value={sourceSystem}
              maxLength={60}
              onChange={(e) => {
                setSourceSystem(e.target.value);
                reset();
              }}
            />
          </label>
          <label className="block">
            Arquivo CSV
            <input
              aria-label="Arquivo CSV"
              type="file"
              accept=".csv,text/csv"
              className="ml-2"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
          {headers.length > 0 && (
            <div className="space-y-1">
              <p>{data.length} linha(s) lidas. Indique o que é cada coluna (código, data, CPF e valor total são obrigatórios):</p>
              {headers.map((header, index) => (
                <label key={`${header}-${index}`} className="flex items-center gap-2">
                  <span className="w-48 truncate">{header}</span>
                  <select
                    aria-label={`Coluna ${header}`}
                    value={mapping[index] ?? ''}
                    onChange={(e) => {
                      reset();
                      setMapping({ ...mapping, [index]: e.target.value });
                    }}
                  >
                    <option value="">Ignorar</option>
                    {SALES_IMPORT_COLUMNS.map((c) => (
                      <option key={c.key} value={c.key} disabled={mapped.has(c.key) && mapping[index] !== c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <button
                type="button"
                disabled={busy || !mappingOk || sourceSystem.trim() === ''}
                onClick={() => void runDry()}
                className="rounded-md border border-slate-300 px-3 py-1.5"
              >
                Validar (sem gravar)
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {dryRun && summary && (
        <Card>
          <CardHeader>
            <CardTitle>2. Resultado da validação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <p>
              Novas: {summary.new} · Já importadas: {summary.alreadyImported} · Repetidas no arquivo: {summary.duplicateInFile} ·
              Rejeitadas: {summary.rejected} · A completar: {summary.toComplete}
            </p>
            {dryRun.alreadyImported && <p>Este arquivo já foi importado; confirmar apenas repete o resultado anterior.</p>}
            {problems.length > 0 && (
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Situação</th>
                    <th>Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {problems.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>{STATUS_LABEL[r.status]}</td>
                      <td>
                        {r.errors.map((e) => `${e.column}: ${e.message}`).join('; ')}
                        {r.toComplete.length > 0 && `A completar: ${r.toComplete.map((c) => COMPLETE_LABEL[c] ?? c).join(', ')}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button type="button" disabled={busy} onClick={() => void confirm()} className="rounded-md border border-slate-300 px-3 py-1.5">
              Confirmar importação
            </button>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="pt-4 text-sm text-green-700">
            {result.replayed
              ? 'Arquivo já importado antes: nada foi gravado novamente.'
              : `Importação concluída: ${String(result.summary.created)} venda(s) criada(s), ${String(result.summary.rejected)} rejeitada(s).`}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
