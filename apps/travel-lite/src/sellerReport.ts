/**
 * Shared client for GET /reports/sellers and its drill-down
 * (GET /reports/sales with the same filters + seller_id). Used by the
 * Reports > Vendedores tab and by the seller summary on the Sellers page.
 */

/** Same default the API applies when no status is given: effective sales only. */
export const EFFECTIVE_SALE_STATUSES = 'CONFIRMED,PARTIALLY_PAID,PAID';

export const SALE_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Vendas efetivas (confirmadas e pagas)' },
  { value: 'CONFIRMED', label: 'Confirmadas (sem recebimento)' },
  { value: 'PARTIALLY_PAID', label: 'Parcialmente recebidas' },
  { value: 'PAID', label: 'Recebidas' },
  { value: 'CANCELLED', label: 'Canceladas' },
  { value: 'DRAFT', label: 'Rascunhos' },
];

export interface SellerReportFilters {
  from: string;
  to: string;
  sellerId: string;
  categoryId: string;
  status: string;
}

export interface SellerTotals {
  gross_amount: number;
  cost_amount: number;
  margin_amount: number;
  received_amount: number;
  pending_amount: number;
  commission_amount: number;
  commission_paid_amount: number;
  commission_pending_amount: number;
}

export interface SellerReportItem extends SellerTotals {
  seller_id: string;
  seller_name: string;
  sales_count: number;
  commission_pending_rule_count: number;
}

export interface SellerReport {
  items: SellerReportItem[];
  totals: SellerTotals & { sales_count: number };
}

export interface SellerSaleRow {
  sale_id: string;
  sale_number: string;
  sale_date: string;
  status: string;
  customer_name: string | null;
  category_name: string | null;
  gross_amount: number;
  cost_amount: number;
  margin_amount: number;
  received_amount: number;
  pending_amount: number;
  commission_status: string | null;
  commission_amount: number;
}

export interface SellerSalesDrillDown {
  items: SellerSaleRow[];
  totals: SellerTotals & { count: number };
}

export function sellerReportQuery(filters: SellerReportFilters, drillSellerId?: string): string {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.categoryId) params.set('category_id', filters.categoryId);
  const sellerId = drillSellerId ?? filters.sellerId;
  if (sellerId) params.set('seller_id', sellerId);
  // The drill-down hits /reports/sales, whose default is "all statuses", so
  // the effective-sales default is made explicit to keep totals identical.
  const status = filters.status || (drillSellerId ? EFFECTIVE_SALE_STATUSES : '');
  if (status) params.set('status', status);
  return params.toString();
}

/** Link from a seller to the Reports > Vendedores tab, already drilled down. */
export function sellerSalesLink(sellerId: string, from: string, to: string): string {
  const params = new URLSearchParams({ aba: 'vendedores', vendedor: sellerId });
  if (from) params.set('de', from);
  if (to) params.set('ate', to);
  return `/relatorios?${params.toString()}`;
}
