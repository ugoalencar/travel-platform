import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

interface BatchJson {
  id: string;
  status: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index: number): string {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const mod = (value - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    value = Math.floor((value - mod) / 26);
  }
  return name;
}

function worksheetXml(rows: string[][]): string {
  const xmlRows = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row
        .map((cell, columnIndex) => {
          const ref = `${columnName(columnIndex)}${rowNumber}`;
          return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xmlRows}</sheetData></worksheet>`;
}

function makeXlsxBase64(sheets: Array<{ name: string; rows: string[][] }>): string {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
        .map(
          (_, index) =>
            `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('')}</Types>`,
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
        .map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
        .join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map(
          (_, index) =>
            `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
        )
        .join('')}</Relationships>`,
    ),
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(worksheetXml(sheet.rows));
  });
  return Buffer.from(zipSync(files)).toString('base64');
}

describe('Travel Lite import center backend', () => {
  let lite: LiteFixture;
  let adminToken: string;
  let viewerToken: string;
  let sellerId: string;
  let categoryId: string;

  beforeAll(async () => {
    lite = await createLiteFixture();
    adminToken = await lite.login('tenant-a', 'admin@a.test');
    viewerToken = await lite.login('tenant-a', 'viewer@a.test');

    const seller = await lite.app.inject({
      method: 'POST',
      url: '/sellers',
      headers: lite.headers(adminToken),
      payload: { name: 'Vendedor Import' },
    });
    sellerId = seller.json<{ seller: { id: string } }>().seller.id;

    const category = await lite.app.inject({
      method: 'POST',
      url: '/categories',
      headers: lite.headers(adminToken),
      payload: { name: 'IMPORT' },
    });
    categoryId = category.json<{ category: { id: string } }>().category.id;
  });

  afterAll(async () => {
    await lite?.close();
  });

  it('imports customers from CSV with CPF normalization and no duplicate on second confirmation', async () => {
    const csv = [
      'Nome,CPF,Nascimento,Email,Telefone',
      'Maria Import,529.982.247-25,1990-01-20,maria@import.test,11999990000',
      'CPF Ruim,111.111.111-11,1992-02-02,bad@import.test,',
    ].join('\n');

    const upload = await lite.app.inject({
      method: 'POST',
      url: '/imports/upload',
      headers: lite.headers(adminToken),
      payload: { type: 'CUSTOMERS', filename: 'clientes.csv', mime_type: 'text/csv', content: csv },
    });
    expect(upload.statusCode).toBe(201);
    const batchId = upload.json<{ batch: BatchJson; preview: unknown[] }>().batch.id;

    const dryRun = await lite.app.inject({
      method: 'POST',
      url: `/imports/${batchId}/dry-run`,
      headers: lite.headers(adminToken),
      payload: {
        mapping: {
          name: 'Nome',
          cpf: 'CPF',
          birth_date: 'Nascimento',
          email: 'Email',
          phone: 'Telefone',
        },
      },
    });
    expect(dryRun.statusCode).toBe(200);
    expect(dryRun.json<{ batch: BatchJson }>().batch).toMatchObject({
      total_rows: 2,
      valid_rows: 1,
      invalid_rows: 1,
    });

    const confirm = await lite.app.inject({
      method: 'POST',
      url: `/imports/${batchId}/confirm`,
      headers: lite.headers(adminToken),
      payload: { update_empty_fields: true },
    });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json<{ result: { imported: number; skipped: number } }>().result).toEqual({
      imported: 1,
      skipped: 1,
    });

    const again = await lite.app.inject({
      method: 'POST',
      url: `/imports/${batchId}/confirm`,
      headers: lite.headers(adminToken),
      payload: { update_empty_fields: true },
    });
    expect(again.statusCode).toBe(409);

    const customers = await lite.app.inject({
      method: 'GET',
      url: '/customers?search=52998224725',
      headers: lite.headers(adminToken),
    });
    expect(customers.json<{ total: number; items: Array<{ cpf: string }> }>()).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ cpf: '52998224725' })],
    });
  });

  it('detects CPF birth-date conflicts and never matches customers by name', async () => {
    const existing = await lite.app.inject({
      method: 'POST',
      url: '/customers',
      headers: lite.headers(adminToken),
      payload: { name: 'Nome Igual', cpf: '390.533.447-05', birth_date: '1980-01-01' },
    });
    expect(existing.statusCode).toBe(201);

    const upload = await lite.app.inject({
      method: 'POST',
      url: '/imports/upload',
      headers: lite.headers(adminToken),
      payload: {
        type: 'CUSTOMERS',
        filename: 'clientes.csv',
        mime_type: 'text/csv',
        content: 'Nome,CPF,Nascimento\nNome Igual,39053344705,1981-01-01\nNome Igual,,1999-01-01',
      },
    });
    const batchId = upload.json<{ batch: BatchJson }>().batch.id;
    const dryRun = await lite.app.inject({
      method: 'POST',
      url: `/imports/${batchId}/dry-run`,
      headers: lite.headers(adminToken),
      payload: { mapping: { name: 'Nome', cpf: 'CPF', birth_date: 'Nascimento' } },
    });
    expect(dryRun.statusCode).toBe(200);

    const records = await lite.app.inject({
      method: 'GET',
      url: `/imports/${batchId}/records`,
      headers: lite.headers(adminToken),
    });
    expect(records.json<{ items: Array<{ status: string; reason: string | null }> }>().items).toEqual([
      expect.objectContaining({ status: 'CONFLICT' }),
      expect.objectContaining({ status: 'NEW' }),
    ]);
  });

  it('stages sales imports without financial side effects until linked and confirmed elsewhere', async () => {
    const customer = await lite.app.inject({
      method: 'POST',
      url: '/customers',
      headers: lite.headers(adminToken),
      payload: { name: 'Cliente Venda Import', cpf: '153.509.460-56', birth_date: '1995-05-05' },
    });
    expect(customer.statusCode).toBe(201);

    const upload = await lite.app.inject({
      method: 'POST',
      url: '/imports/upload',
      headers: lite.headers(adminToken),
      payload: {
        type: 'SALES',
        filename: 'vendas.csv',
        mime_type: 'text/csv',
        content: [
          'Cliente,CPF,Nascimento,Valor,Vencimento',
          'Cliente Venda Import,15350946056,1995-05-05,1000,2026-11-10',
          'Sem CPF,,,500,2026-11-11',
        ].join('\n'),
      },
    });
    const batchId = upload.json<{ batch: BatchJson }>().batch.id;

    const dryRun = await lite.app.inject({
      method: 'POST',
      url: `/imports/${batchId}/dry-run`,
      headers: lite.headers(adminToken),
      payload: {
        mapping: {
          customer_name: 'Cliente',
          customer_cpf: 'CPF',
          customer_birth_date: 'Nascimento',
          gross_amount: 'Valor',
          due_date: 'Vencimento',
        },
        defaults: { seller_id: sellerId, category_id: categoryId },
      },
    });
    expect(dryRun.statusCode).toBe(200);

    const records = await lite.app.inject({
      method: 'GET',
      url: `/imports/${batchId}/records`,
      headers: lite.headers(adminToken),
    });
    expect(records.json<{ items: Array<{ status: string }> }>().items.map((r) => r.status)).toEqual([
      'READY',
      'UNLINKED',
    ]);

    const finance = await lite.adminPool.query<{ total: number }>(
      `SELECT (
         (SELECT count(*) FROM receivables) +
         (SELECT count(*) FROM seller_commissions) +
         (SELECT count(*) FROM financial_transactions)
       )::int AS total`,
    );
    expect(finance.rows[0]?.total).toBe(0);
  });

  it('enforces imports.manage and upload restrictions', async () => {
    const forbidden = await lite.app.inject({
      method: 'POST',
      url: '/imports/upload',
      headers: lite.headers(viewerToken),
      payload: { type: 'CUSTOMERS', filename: 'clientes.csv', mime_type: 'text/csv', content: 'Nome\nA' },
    });
    expect(forbidden.statusCode).toBe(403);

    const badExt = await lite.app.inject({
      method: 'POST',
      url: '/imports/upload',
      headers: lite.headers(adminToken),
      payload: { type: 'CUSTOMERS', filename: 'clientes.txt', mime_type: 'text/plain', content: 'Nome\nA' },
    });
    expect(badExt.statusCode).toBe(400);

    const xlsx = await lite.app.inject({
      method: 'POST',
      url: '/imports/upload',
      headers: lite.headers(adminToken),
      payload: {
        type: 'CUSTOMERS',
        filename: 'clientes.xlsx',
        mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content: makeXlsxBase64([{ name: 'Clientes', rows: [['Nome'], ['A']] }]),
      },
    });
    expect(xlsx.statusCode).toBe(201);
  });

  it('reads XLSX sheets as data only and lets the user choose a sheet before dry-run', async () => {
    const content = makeXlsxBase64([
      { name: 'Resumo', rows: [['Ignorar'], ['não importar']] },
      {
        name: 'Clientes',
        rows: [
          ['Nome', 'CPF', 'Nascimento', 'Observacoes'],
          ['Cliente XLSX', '286.255.878-87', '1991-04-03', '=HYPERLINK("https://evil.test","clicar")'],
        ],
      },
    ]);

    const upload = await lite.app.inject({
      method: 'POST',
      url: '/imports/upload',
      headers: lite.headers(adminToken),
      payload: {
        type: 'CUSTOMERS',
        filename: 'clientes.xlsx',
        mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content,
        sheet_name: 'Clientes',
      },
    });
    expect(upload.statusCode).toBe(201);
    const body = upload.json<{ batch: BatchJson; sheets: string[]; headers: string[]; preview: Array<Record<string, string>> }>();
    expect(body.sheets).toEqual(['Resumo', 'Clientes']);
    expect(body.headers).toEqual(['Nome', 'CPF', 'Nascimento', 'Observacoes']);
    expect(body.preview[0]).toMatchObject({
      Nome: 'Cliente XLSX',
      Observacoes: '=HYPERLINK("https://evil.test","clicar")',
    });

    const dryRun = await lite.app.inject({
      method: 'POST',
      url: `/imports/${body.batch.id}/dry-run`,
      headers: lite.headers(adminToken),
      payload: {
        mapping: {
          name: 'Nome',
          cpf: 'CPF',
          birth_date: 'Nascimento',
          notes: 'Observacoes',
        },
      },
    });
    expect(dryRun.statusCode).toBe(200);
    expect(dryRun.json<{ batch: BatchJson }>().batch).toMatchObject({
      total_rows: 1,
      valid_rows: 1,
      invalid_rows: 0,
    });
  });

  it('reconciles pending sales imports before converting them through the sale confirmation flow', async () => {
    const linkedCustomer = await lite.app.inject({
      method: 'POST',
      url: '/customers',
      headers: lite.headers(adminToken),
      payload: { name: 'Cliente Reconciliado', cpf: '935.411.347-80', birth_date: '1988-08-08' },
    });
    expect(linkedCustomer.statusCode).toBe(201);
    const linkedCustomerId = linkedCustomer.json<{ customer: { id: string } }>().customer.id;

    const upload = await lite.app.inject({
      method: 'POST',
      url: '/imports/upload',
      headers: lite.headers(adminToken),
      payload: {
        type: 'SALES',
        filename: 'vendas.csv',
        mime_type: 'text/csv',
        content: [
          'Referencia,Cliente,CPF,Nascimento,Vendedor,Categoria,Data,Descricao,Valor,Custo,Fornecedor,Vencimento,Forma,Observacoes',
          'LEG-001,Cliente Reconciliado,93541134780,1988-08-08,Vendedor Import,IMPORT,2026-11-01,Pacote,5000,3600,Hotel Parceiro,2026-11-20,PIX,linha pronta',
          'LEG-002,Cliente Sem Cadastro,,,Vendedor Import,IMPORT,2026-11-02,Pacote pendente,900,0,,2026-11-21,PIX,precisa cliente',
        ].join('\n'),
      },
    });
    expect(upload.statusCode).toBe(201);
    const batchId = upload.json<{ batch: BatchJson }>().batch.id;

    const dryRun = await lite.app.inject({
      method: 'POST',
      url: `/imports/${batchId}/dry-run`,
      headers: lite.headers(adminToken),
      payload: {
        mapping: {
          external_reference: 'Referencia',
          customer_name: 'Cliente',
          customer_cpf: 'CPF',
          customer_birth_date: 'Nascimento',
          seller_name: 'Vendedor',
          category_name: 'Categoria',
          sale_date: 'Data',
          description: 'Descricao',
          gross_amount: 'Valor',
          cost_amount: 'Custo',
          financial_party_name: 'Fornecedor',
          due_date: 'Vencimento',
          payment_method_name: 'Forma',
          notes: 'Observacoes',
        },
        defaults: { seller_id: sellerId, category_id: categoryId },
      },
    });
    expect(dryRun.statusCode).toBe(200);

    let records = await lite.app.inject({
      method: 'GET',
      url: `/imports/${batchId}/records`,
      headers: lite.headers(adminToken),
    });
    const pending = records
      .json<{ items: Array<{ id: string; status: string; source_row: number }> }>()
      .items.find((record) => record.source_row === 3);
    expect(pending).toMatchObject({ status: 'UNLINKED' });

    const reconcile = await lite.app.inject({
      method: 'POST',
      url: `/imports/${batchId}/records/${pending!.id}/reconcile`,
      headers: lite.headers(adminToken),
      payload: { action: 'LINK_CUSTOMER', customer_id: linkedCustomerId },
    });
    expect(reconcile.statusCode).toBe(200);
    expect(reconcile.json<{ record: { status: string; resolved_customer_id: string } }>().record).toMatchObject({
      status: 'READY',
      resolved_customer_id: linkedCustomerId,
    });

    const confirm = await lite.app.inject({
      method: 'POST',
      url: `/imports/${batchId}/confirm`,
      headers: lite.headers(adminToken),
      payload: {},
    });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json<{ result: { imported: number; skipped: number } }>().result).toEqual({
      imported: 2,
      skipped: 0,
    });

    records = await lite.app.inject({
      method: 'GET',
      url: `/imports/${batchId}/records`,
      headers: lite.headers(adminToken),
    });
    const importedRecords = records.json<{ items: Array<{ status: string; resolved_sale_id: string | null }> }>().items;
    expect(importedRecords.map((record) => record.status)).toEqual(['IMPORTED', 'IMPORTED']);
    expect(importedRecords.every((record) => typeof record.resolved_sale_id === 'string')).toBe(true);

    const finance = await lite.adminPool.query<{ receivables: number; commissions: number; costs: number; suppliers: number }>(
      `SELECT
         (SELECT count(*) FROM receivables)::int AS receivables,
         (SELECT count(*) FROM seller_commissions)::int AS commissions,
         (SELECT count(*) FROM sale_cost_items)::int AS costs,
         (SELECT count(*) FROM financial_parties WHERE name = 'Hotel Parceiro')::int AS suppliers`,
    );
    expect(finance.rows[0]).toEqual({ receivables: 2, commissions: 2, costs: 1, suppliers: 1 });
  });
});
