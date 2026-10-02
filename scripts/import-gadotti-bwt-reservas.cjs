#!/usr/bin/env node
/**
 * Importa CSV de reservas BWT/Gadotti para o Travel Lite.
 *
 * Uso:
 *   DATABASE_URL="postgresql://..." node scripts/import-gadotti-bwt-reservas.cjs caminho/arquivo.csv --dry-run
 *   DATABASE_URL="postgresql://..." node scripts/import-gadotti-bwt-reservas.cjs caminho/arquivo.csv
 *
 * Regras desta carga:
 * - tenant fixo: gadotti
 * - `Nome Contato` = vendedor
 * - cliente único de teste para todas as vendas
 * - `Id` do CSV vira external_id `bwt:<Id>` para idempotência
 * - registros PAGO entram como venda/recebível PAID
 */
'use strict';

const fs = require('node:fs');
const { Pool } = require('pg');

const [, , csvPath, ...flags] = process.argv;
const dryRun = flags.includes('--dry-run');

if (!csvPath) {
  console.error('Uso: node scripts/import-gadotti-bwt-reservas.cjs <arquivo.csv> [--dry-run]');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL é obrigatório.');
  process.exit(1);
}

function parseCsv(content) {
  const rows = [];
  let cell = '';
  let row = [];
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (quoted) {
      if (ch === '"' && content[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  row.push(cell.trim());
  rows.push(row);
  const [headers, ...data] = rows.filter((item) => item.some((value) => value.length > 0));
  if (!headers) throw new Error('CSV sem cabeçalho.');
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (text) => text.toUpperCase())
    .trim();
}

function sellerName(raw) {
  const normalized = normalizeName(raw);
  if (normalized.startsWith('PATRICIA')) return 'Patricia Voltolini';
  if (normalized.startsWith('NYKAYA')) return 'Nykaya Korine Koch Agostinho de Farias';
  if (normalized === 'ANDRIELLE') return 'Andrielle Rodrigues Dell Agnolo';
  return titleCase(raw);
}

function categoryName(raw) {
  const normalized = normalizeName(raw);
  if (normalized.includes('AEREO')) return 'AÉREO';
  if (normalized.includes('HOSPEDAGEM')) return 'TERRESTRE';
  return 'OUTROS';
}

function parseMoney(value) {
  const normalized = String(value || '')
    .replace(/R\$/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Valor inválido: ${value}`);
  return Math.round(amount * 100) / 100;
}

function parseDateFromIncludedBy(value) {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return new Date().toISOString().slice(0, 10);
  return `${match[3]}-${match[2]}-${match[1]}`;
}

async function nextSaleNumber(client, tenantId) {
  await client.query(
    `INSERT INTO tenant_sequences (tenant_id, key) VALUES ($1, 'sale_number') ON CONFLICT DO NOTHING`,
    [tenantId],
  );
  const result = await client.query(
    `UPDATE tenant_sequences SET next_value = next_value + 1
      WHERE tenant_id = $1 AND key = 'sale_number'
      RETURNING next_value - 1 AS value`,
    [tenantId],
  );
  return `VENDA-${String(result.rows[0].value).padStart(6, '0')}`;
}

async function ensureNamed(client, table, tenantId, name, extra = {}) {
  const existing = await client.query(`SELECT id FROM ${table} WHERE tenant_id = $1 AND lower(name) = lower($2) LIMIT 1`, [
    tenantId,
    name,
  ]);
  if (existing.rows[0]) return existing.rows[0].id;

  if (table === 'sellers') {
    const created = await client.query(
      `INSERT INTO sellers (tenant_id, name, email, phone, commission_rule_type)
       VALUES ($1, $2, $3, $4, 'UNDEFINED')
       RETURNING id`,
      [tenantId, name, extra.email || null, extra.phone || null],
    );
    return created.rows[0].id;
  }

  const created = await client.query(
    `INSERT INTO ${table} (tenant_id, name) VALUES ($1, $2) RETURNING id`,
    [tenantId, name],
  );
  return created.rows[0].id;
}

async function run() {
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const summary = {
    rows: rows.length,
    createdSales: 0,
    skippedExisting: 0,
    createdSellers: new Set(),
    total: 0,
  };

  try {
    await client.query('BEGIN');
    const tenant = await client.query(`SELECT id FROM tenants WHERE slug = 'gadotti'`);
    if (!tenant.rows[0]) throw new Error('Tenant gadotti não encontrado.');
    const tenantId = tenant.rows[0].id;

    await client.query('SELECT set_tenant_context($1, NULL)', [tenantId]);
    const user = await client.query(
      `SELECT id FROM users WHERE tenant_id = $1 AND email = 'patricia.voltolini@gadottijoinville.com.br'`,
      [tenantId],
    );
    if (!user.rows[0]) throw new Error('Usuária Patricia não encontrada no tenant gadotti.');
    await client.query('SELECT set_tenant_context($1, $2)', [tenantId, user.rows[0].id]);

    const customerResult = await client.query(
      `INSERT INTO customers (tenant_id, name, notes)
       VALUES ($1, 'Cliente teste Gadotti - importação BWT', 'Cliente único criado para carga inicial de reservas BWT sem cliente final identificado.')
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [tenantId],
    );
    let customerId = customerResult.rows[0]?.id;
    if (!customerId) {
      const existing = await client.query(
        `SELECT id FROM customers WHERE tenant_id = $1 AND name = 'Cliente teste Gadotti - importação BWT' LIMIT 1`,
        [tenantId],
      );
      customerId = existing.rows[0].id;
    }

    for (const row of rows) {
      const externalId = `bwt:${row.Id}`;
      const exists = await client.query('SELECT id FROM sales WHERE tenant_id = $1 AND external_id = $2', [
        tenantId,
        externalId,
      ]);
      if (exists.rows[0]) {
        summary.skippedExisting += 1;
        continue;
      }

      const amount = parseMoney(row.Total);
      summary.total += amount;
      const seller = sellerName(row['Nome Contato']);
      const beforeSeller = await client.query(
        'SELECT id FROM sellers WHERE tenant_id = $1 AND lower(name) = lower($2) LIMIT 1',
        [tenantId, seller],
      );
      const sellerId = await ensureNamed(client, 'sellers', tenantId, seller, {
        email: row['Email Contato'],
        phone: row['Telefone Contato'],
      });
      if (!beforeSeller.rows[0]) summary.createdSellers.add(seller);

      const categoryId = await ensureNamed(client, 'sale_categories', tenantId, categoryName(row['Reserva Tipo']));
      const saleDate = parseDateFromIncludedBy(row['Incluido Por']);
      const saleNumber = await nextSaleNumber(client, tenantId);
      const notes = [
        `Importação BWT/Gadotti CSV`,
        `Id externo: ${row.Id}`,
        `Status origem: ${row.Status}`,
        `Status pagamento origem: ${row['Status Pagamento']}`,
        `Reserva tipo: ${row['Reserva Tipo']}`,
        `Unidade: ${row.Unidade}`,
        `Pessoa: ${row.Pessoa}`,
        `Profissional: ${row.Profissional}`,
        `Incluído por: ${row['Incluido Por']}`,
      ].join('\n');

      const sale = await client.query(
        `INSERT INTO sales (tenant_id, customer_id, seller_id, category_id, sale_number,
                            description, gross_amount, cost_amount, margin_amount,
                            sale_date, due_date, installment_count, status, notes,
                            external_id, source_system, sync_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $7, $8, $8, 1, 'PAID', $9, $10, 'BWT', 'NOT_SYNCED')
         RETURNING id`,
        [tenantId, customerId, sellerId, categoryId, saleNumber, row.Produto, amount, saleDate, notes, externalId],
      );

      await client.query(
        `INSERT INTO receivables (tenant_id, sale_id, installment_number, installment_count, customer_id,
                                  description, amount, paid_amount, due_at, status, external_id, source_system)
         VALUES ($1, $2, 1, 1, $3, $4, $5, $5, $6, 'PAID', $7, 'BWT')`,
        [tenantId, sale.rows[0].id, customerId, `${saleNumber} - reserva BWT ${row.Id}`, amount, saleDate, externalId],
      );

      await client.query(
        `INSERT INTO seller_commissions (tenant_id, sale_id, seller_id, status, rule_snapshot)
         VALUES ($1, $2, $3, 'PENDING_RULE', $4::jsonb)`,
        [tenantId, sale.rows[0].id, sellerId, JSON.stringify({ rule_type: 'UNDEFINED', imported_from: 'BWT' })],
      );

      summary.createdSales += 1;
    }

    if (dryRun) {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        rows: summary.rows,
        createdSales: summary.createdSales,
        skippedExisting: summary.skippedExisting,
        createdSellers: Array.from(summary.createdSellers),
        total: Math.round(summary.total * 100) / 100,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error('[import-gadotti-bwt-reservas] failed:', error.message);
  process.exit(1);
});
