import { useEffect, useState } from 'react';

interface FinancialMetrics {
  mrr: number;
  arr: number;
  activeSubscriptions: number;
  trialCount: number;
  churnRate: number;
  cancelledSubscriptions?: number;
}

interface Invoice {
  id: string;
  tenant_name: string;
  amount: number;
  currency: string;
  status: 'PAID' | 'OPEN' | 'OVERDUE' | 'REFUNDED';
  issued_at: string;
  due_at: string;
}

interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  status: 'SUCCESSFUL' | 'FAILED' | 'REFUNDED';
  paid_at: string;
}

type TabType = 'overview' | 'invoices' | 'payments';

export function FinancialPage() {
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    fetchFinancialData();
  }, []);

  async function fetchFinancialData() {
    try {
      setLoading(true);

      // Fetch metrics
      const metricsResponse = await fetch('http://127.0.0.1:4000/platform/financial');
      if (!metricsResponse.ok) throw new Error('Failed to fetch financial metrics');
      const metricsData = await metricsResponse.json();
      setMetrics(metricsData.metrics);

      // Fetch invoices
      const invoicesResponse = await fetch('http://127.0.0.1:4000/platform/invoices');
      if (!invoicesResponse.ok) throw new Error('Failed to fetch invoices');
      const invoicesData = await invoicesResponse.json();
      setInvoices(invoicesData.invoices || []);

      // Fetch payments
      const paymentsResponse = await fetch('http://127.0.0.1:4000/platform/payments');
      if (paymentsResponse.ok) {
        const paymentsData = await paymentsResponse.json();
        setPayments(paymentsData.payments || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch financial data');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading financial data...</div>;
  }

  if (!metrics) {
    return <div className="text-center py-8 text-red-600">Unable to load financial data</div>;
  }

  const invoiceCounts = {
    PAID: invoices.filter((i) => i.status === 'PAID').length,
    OPEN: invoices.filter((i) => i.status === 'OPEN').length,
    OVERDUE: invoices.filter((i) => i.status === 'OVERDUE').length,
    REFUNDED: invoices.filter((i) => i.status === 'REFUNDED').length,
  };

  const paymentCounts = {
    SUCCESSFUL: payments.filter((p) => p.status === 'SUCCESSFUL').length,
    FAILED: payments.filter((p) => p.status === 'FAILED').length,
    REFUNDED: payments.filter((p) => p.status === 'REFUNDED').length,
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Financial Dashboard</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Main Metrics */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <StatCard
          title="MRR"
          value={`R$ ${metrics.mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          subtitle="Monthly Recurring Revenue"
        />
        <StatCard
          title="ARR"
          value={`R$ ${metrics.arr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          subtitle="Annual Recurring Revenue"
        />
        <StatCard
          title="Active Subscriptions"
          value={metrics.activeSubscriptions.toString()}
          subtitle={`${metrics.trialCount} on trial`}
        />
        <StatCard
          title="Churn Rate"
          value={`${metrics.churnRate.toFixed(2)}%`}
          subtitle="30-day churn"
        />
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b">
        <div className="flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-4 font-medium ${
              activeTab === 'overview'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`pb-4 font-medium ${
              activeTab === 'invoices'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Invoices ({invoices.length})
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`pb-4 font-medium ${
              activeTab === 'payments'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Payments ({payments.length})
          </button>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div>
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">Invoice Status</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Paid</span>
                  <span className="font-medium">{invoiceCounts.PAID}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Open</span>
                  <span className="font-medium text-yellow-600">{invoiceCounts.OPEN}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Overdue</span>
                  <span className="font-medium text-red-600">{invoiceCounts.OVERDUE}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Refunded</span>
                  <span className="font-medium">{invoiceCounts.REFUNDED}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">Payment Status</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Successful</span>
                  <span className="font-medium text-green-600">{paymentCounts.SUCCESSFUL}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Failed</span>
                  <span className="font-medium text-red-600">{paymentCounts.FAILED}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Refunded</span>
                  <span className="font-medium">{paymentCounts.REFUNDED}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">Tenant</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Amount</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Issued</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-600">
                    No invoices found
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => {
                  const statusColors: Record<string, string> = {
                    PAID: 'bg-green-100 text-green-800',
                    OPEN: 'bg-yellow-100 text-yellow-800',
                    OVERDUE: 'bg-red-100 text-red-800',
                    REFUNDED: 'bg-gray-100 text-gray-800',
                  };

                  return (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium">{invoice.tenant_name}</td>
                      <td className="px-6 py-4">
                        R$ {invoice.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`${statusColors[invoice.status]} px-2 py-1 rounded text-xs font-medium`}>
                          {invoice.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {new Date(invoice.issued_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {new Date(invoice.due_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">Invoice</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Amount</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Paid At</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-gray-600">
                    No payments found
                  </td>
                </tr>
              ) : (
                payments.map((payment) => {
                  const statusColors: Record<string, string> = {
                    SUCCESSFUL: 'bg-green-100 text-green-800',
                    FAILED: 'bg-red-100 text-red-800',
                    REFUNDED: 'bg-gray-100 text-gray-800',
                  };

                  return (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-mono">
                        {payment.invoice_id.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4">
                        R$ {payment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`${statusColors[payment.status]} px-2 py-1 rounded text-xs font-medium`}>
                          {payment.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {new Date(payment.paid_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-gray-600 text-sm font-medium">{title}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
      {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
    </div>
  );
}
