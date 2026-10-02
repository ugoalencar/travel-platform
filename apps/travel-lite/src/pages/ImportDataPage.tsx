import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { api } from '../api';
import { PlanHint } from '../planUi';
import { ErrorNote, StatusBadge, SuccessNote } from '../ui';

type ImportType = 'CUSTOMERS' | 'SALES';

interface Batch {
  id: string;
  type: ImportType;
  filename: string;
  status: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
}

interface ImportRecord {
  id: string;
  source_row: number;
  raw_data: Record<string, string>;
  normalized_data: Record<string, unknown>;
  resolved_customer_id: string | null;
  resolved_sale_id: string | null;
  status: string;
  reason: string | null;
}

interface NamedItem {
  id: string;
  name: string;
}

const CUSTOMER_FIELDS = [
  ['name', 'Nome *'],
  ['cpf', 'CPF'],
  ['birth_date', 'Nascimento'],
  ['phone', 'Telefone'],
  ['whatsapp', 'WhatsApp'],
  ['email', 'E-mail'],
  ['zip_code', 'CEP'],
  ['street', 'Rua'],
  ['number', 'Número'],
  ['complement', 'Complemento'],
  ['neighborhood', 'Bairro'],
  ['city', 'Cidade'],
  ['state', 'UF'],
  ['notes', 'Observações'],
] as const;

const SALE_FIELDS = [
  ['external_reference', 'Referência'],
  ['customer_name', 'Cliente'],
  ['customer_cpf', 'CPF'],
  ['customer_birth_date', 'Nascimento'],
  ['sale_date', 'Data'],
  ['description', 'Descrição'],
  ['gross_amount', 'Valor vendido *'],
  ['cost_amount', 'Custo'],
  ['financial_party_name', 'Fornecedor'],
  ['due_date', 'Vencimento *'],
  ['payment_method_name', 'Forma pagamento'],
  ['notes', 'Observações'],
] as const;

function fileToPayload(file: File): Promise<{ content: string; mimeType: string }> {
  const isXlsx = file.name.toLowerCase().endsWith('.xlsx');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve({
        content: isXlsx ? result.split(',')[1] ?? '' : result,
        mimeType:
          file.type ||
          (isXlsx ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv'),
      });
    };
    if (isXlsx) reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

function displayCell(value: unknown): string {
  if (typeof value === 'string') return value || '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '—';
}

function firstHeader(headers: string[], candidates: string[]): string {
  const lowered = headers.map((header) => ({ header, key: header.toLowerCase() }));
  return lowered.find((entry) => candidates.some((candidate) => entry.key.includes(candidate)))?.header ?? '';
}

function defaultMapping(type: ImportType, headers: string[]): Record<string, string> {
  if (type === 'CUSTOMERS') {
    return {
      name: firstHeader(headers, ['nome', 'cliente']),
      cpf: firstHeader(headers, ['cpf']),
      birth_date: firstHeader(headers, ['nascimento', 'birth']),
      phone: firstHeader(headers, ['telefone', 'phone']),
      whatsapp: firstHeader(headers, ['whats']),
      email: firstHeader(headers, ['email', 'e-mail']),
      notes: firstHeader(headers, ['observa', 'nota']),
    };
  }
  return {
    external_reference: firstHeader(headers, ['refer', 'numero', 'número']),
    customer_name: firstHeader(headers, ['cliente', 'nome']),
    customer_cpf: firstHeader(headers, ['cpf']),
    customer_birth_date: firstHeader(headers, ['nascimento']),
    sale_date: firstHeader(headers, ['data']),
    description: firstHeader(headers, ['descri']),
    gross_amount: firstHeader(headers, ['valor', 'vendido']),
    cost_amount: firstHeader(headers, ['custo']),
    financial_party_name: firstHeader(headers, ['fornecedor', 'prestador']),
    due_date: firstHeader(headers, ['vencimento']),
    payment_method_name: firstHeader(headers, ['forma', 'pagamento']),
    notes: firstHeader(headers, ['observa']),
  };
}

export function ImportDataPage() {
  const [type, setType] = useState<ImportType>('CUSTOMERS');
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState('');
  const [preview, setPreview] = useState<Array<Record<string, string>>>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [sellers, setSellers] = useState<NamedItem[]>([]);
  const [categories, setCategories] = useState<NamedItem[]>([]);
  const [customers, setCustomers] = useState<NamedItem[]>([]);
  const [sellerId, setSellerId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [linkCustomerId, setLinkCustomerId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fieldList = useMemo(() => (type === 'CUSTOMERS' ? CUSTOMER_FIELDS : SALE_FIELDS), [type]);

  useEffect(() => {
    void Promise.all([
      api<{ items: NamedItem[] }>('/sellers?pageSize=100').then((response) => setSellers(response.items)).catch(() => undefined),
      api<{ items: NamedItem[] }>('/categories').then((response) => setCategories(response.items)).catch(() => undefined),
      api<{ items: NamedItem[] }>('/customers?pageSize=100').then((response) => setCustomers(response.items)).catch(() => undefined),
    ]);
  }, []);

  function resetImport() {
    setBatch(null);
    setHeaders([]);
    setSheets([]);
    setSheetName('');
    setPreview([]);
    setMapping({});
    setRecords([]);
    setError(null);
    setNotice(null);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    resetImport();
  }

  async function upload(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const payload = await fileToPayload(file);
      const response = await api<{
        batch: Batch;
        headers: string[];
        sheets: string[];
        preview: Array<Record<string, string>>;
      }>('/imports/upload', {
        method: 'POST',
        body: {
          type,
          filename: file.name,
          mime_type: payload.mimeType,
          content: payload.content,
          sheet_name: sheetName || undefined,
        },
      });
      setBatch(response.batch);
      setHeaders(response.headers);
      setSheets(response.sheets);
      setPreview(response.preview);
      setMapping(defaultMapping(type, response.headers));
      setRecords([]);
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : 'Falha ao enviar arquivo');
    } finally {
      setBusy(false);
    }
  }

  async function dryRun(): Promise<void> {
    if (!batch) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ batch: Batch }>(`/imports/${batch.id}/dry-run`, {
        method: 'POST',
        body: {
          mapping,
          defaults: type === 'SALES' ? { seller_id: sellerId, category_id: categoryId } : {},
        },
      });
      setBatch(response.batch);
      const recordResponse = await api<{ items: ImportRecord[] }>(`/imports/${batch.id}/records`);
      setRecords(recordResponse.items);
      setNotice('Dry-run concluído: confira as pendências abaixo.');
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : 'Falha no dry-run');
    } finally {
      setBusy(false);
    }
  }

  async function reconcile(record: ImportRecord, action: 'LINK_CUSTOMER' | 'IGNORE'): Promise<void> {
    if (!batch) return;
    setError(null);
    try {
      await api(`/imports/${batch.id}/records/${record.id}/reconcile`, {
        method: 'POST',
        body:
          action === 'IGNORE'
            ? { action }
            : { action, customer_id: linkCustomerId[record.id] },
      });
      const response = await api<{ items: ImportRecord[] }>(`/imports/${batch.id}/records`);
      setRecords(response.items);
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : 'Falha ao reconciliar');
    }
  }

  async function confirm(): Promise<void> {
    if (!batch) return;
    if (!window.confirm(`Confirmar a importação? ${batch.valid_rows} linha(s) serão gravadas.`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ batch: Batch }>(`/imports/${batch.id}/confirm`, {
        method: 'POST',
        body: { update_empty_fields: true },
      });
      setBatch(response.batch);
      const recordResponse = await api<{ items: ImportRecord[] }>(`/imports/${batch.id}/records`);
      setRecords(recordResponse.items);
      setNotice('Importação confirmada.');
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : 'Falha ao confirmar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Importações</h1>
      <div className="lite-tabs">
        <button type="button" className={type === 'CUSTOMERS' ? 'lite-tab active' : 'lite-tab'} onClick={() => { setType('CUSTOMERS'); resetImport(); }}>
          Clientes
        </button>
        <button type="button" className={type === 'SALES' ? 'lite-tab active' : 'lite-tab'} onClick={() => { setType('SALES'); resetImport(); }}>
          Vendas
        </button>
      </div>
      <ErrorNote error={error} />
      <PlanHint capabilityKey="importacao" />
      <SuccessNote success={notice} />
      <form className="lite-form" onSubmit={(event) => void upload(event)}>
        <label className="field">
          <span>Arquivo CSV ou XLSX</span>
          <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFileChange} required />
        </label>
        {sheets.length > 0 ? (
          <label className="field">
            <span>Aba</span>
            <select value={sheetName} onChange={(event) => setSheetName(event.target.value)}>
              <option value="">Primeira aba</option>
              {sheets.map((sheet) => (
                <option key={sheet} value={sheet}>{sheet}</option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={!file || busy}>
            {busy ? 'Processando…' : 'Ler arquivo'}
          </button>
        </div>
      </form>
      {preview.length > 0 ? (
        <section className="lite-card">
          <h2>Preview</h2>
          <div className="lite-table-wrap">
            <table>
              <thead>
                <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
              </thead>
              <tbody>
                {preview.slice(0, 5).map((row, index) => (
                  <tr key={index}>
                    {headers.map((header) => <td key={header}>{row[header] || '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {batch ? (
        <section className="lite-card">
          <h2>Associação de colunas</h2>
          <div className="mapping-grid">
            {fieldList.map(([field, label]) => (
              <label className="field" key={field}>
                <span>{label}</span>
                <select value={mapping[field] ?? ''} onChange={(event) => setMapping({ ...mapping, [field]: event.target.value })}>
                  <option value="">Não importar</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </label>
            ))}
            {type === 'SALES' ? (
              <>
                <label className="field">
                  <span>Vendedor padrão *</span>
                  <select value={sellerId} onChange={(event) => setSellerId(event.target.value)} required>
                    <option value="">Selecione…</option>
                    {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Categoria padrão *</span>
                  <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
                    <option value="">Selecione…</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
              </>
            ) : null}
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={() => void dryRun()} disabled={busy || (type === 'SALES' && (!sellerId || !categoryId))}>
              Validar dry-run
            </button>
          </div>
        </section>
      ) : null}
      {batch ? (
        <div className="lite-grid">
          <div className="stat"><div className="stat-label">Total</div><div className="stat-value">{batch.total_rows}</div></div>
          <div className="stat"><div className="stat-label">Válidos</div><div className="stat-value">{batch.valid_rows}</div></div>
          <div className="stat"><div className="stat-label">Pendências</div><div className="stat-value">{batch.invalid_rows}</div></div>
        </div>
      ) : null}
      {records.length > 0 ? (
        <>
          <div className="lite-toolbar">
            <h2>Resultado por linha</h2>
            <span className="spacer" />
            <button type="button" className="btn btn-primary" onClick={() => void confirm()} disabled={busy || records.some((record) => ['INVALID', 'CONFLICT', 'UNLINKED'].includes(record.status))}>
              Confirmar importação
            </button>
          </div>
          <div className="lite-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Status</th>
                  <th>Nome/Cliente</th>
                  <th>CPF</th>
                  <th>Motivo</th>
                  <th>Pendência</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.source_row}</td>
                    <td><StatusBadge status={record.status} /></td>
                    <td>{displayCell(record.normalized_data.name ?? record.normalized_data.customer_name)}</td>
                    <td>{displayCell(record.normalized_data.cpf ?? record.normalized_data.customer_cpf)}</td>
                    <td>{record.reason ?? '—'}</td>
                    <td>
                      {['UNLINKED', 'CONFLICT'].includes(record.status) ? (
                        <div className="row-actions">
                          <select value={linkCustomerId[record.id] ?? ''} onChange={(event) => setLinkCustomerId({ ...linkCustomerId, [record.id]: event.target.value })}>
                            <option value="">Cliente…</option>
                            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                          </select>
                          <button type="button" className="btn btn-small" onClick={() => void reconcile(record, 'LINK_CUSTOMER')} disabled={!linkCustomerId[record.id]}>
                            Vincular
                          </button>
                          <button type="button" className="btn btn-small" onClick={() => void reconcile(record, 'IGNORE')}>
                            Ignorar
                          </button>
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}
