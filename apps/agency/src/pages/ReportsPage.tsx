import { useEffect, useState } from 'react';
import { BarChart3, MapPin, TrendingUp, AlertCircle } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { StatCard } from '../components/ui/stat-card';
import { api } from '../lib/api';

interface SalesByPeriod {
  period: string;
  count: number;
  total: string;
}

interface BookingsByStatus {
  status: string;
  count: number;
}

interface ProposalConversion {
  sent: number;
  accepted: number;
  conversionRate: string;
}

interface TopDestination {
  destination: string;
  bookingCount: number;
  tripCount: number;
}

interface TripsByStatus {
  status: string;
  count: number;
}

export function ReportsPage() {
  const [salesData, setSalesData] = useState<SalesByPeriod[]>([]);
  const [bookingsData, setBookingsData] = useState<BookingsByStatus[]>([]);
  const [proposalData, setProposalData] = useState<ProposalConversion | null>(null);
  const [destinationsData, setDestinationsData] = useState<TopDestination[]>([]);
  const [tripsData, setTripsData] = useState<TripsByStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({
    startDate: '2026-01-01',
    endDate: '2026-08-31',
  });

  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch all reports in parallel
        const [salesResp, bookingsResp, proposalsResp, destinationsResp, tripsResp] =
          await Promise.all([
            api.get(
              `/commercial/reports/sales?start_date=${dateRange.startDate}&end_date=${dateRange.endDate}`,
            ),
            api.get('/commercial/reports/bookings'),
            api.get('/commercial/reports/proposals'),
            api.get('/commercial/reports/destinations?limit=10'),
            api.get('/commercial/reports/trips'),
          ]);

        const salesRespData = salesResp.data as { sales?: SalesByPeriod[] };
        const bookingsRespData = bookingsResp.data as { bookings?: BookingsByStatus[] };
        const proposalsRespData = proposalsResp.data as { proposals?: ProposalConversion };
        const destinationsRespData = destinationsResp.data as { destinations?: TopDestination[] };
        const tripsRespData = tripsResp.data as { trips?: TripsByStatus[] };

        setSalesData(salesRespData.sales || []);
        setBookingsData(bookingsRespData.bookings || []);
        setProposalData(proposalsRespData.proposals || null);
        setDestinationsData(destinationsRespData.destinations || []);
        setTripsData(tripsRespData.trips || []);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else if (typeof err === 'object' && err !== null && 'status' in err) {
          const httpErr = err as { status: number; data?: { message: string } };
          if (httpErr.status === 429) {
            setError('Limite de requisicoes excedido. Tente novamente em alguns instantes.');
          } else if (httpErr.status === 403) {
            setError('Voce nao tem permissao para ver estes relatorios.');
          } else {
            setError(httpErr.data?.message || 'Nao foi possivel carregar os relatorios.');
          }
        } else {
          setError('Ocorreu um erro inesperado.');
        }
      } finally {
        setLoading(false);
      }
    };

    void fetchReports();
  }, [dateRange]);

  const handleDateChange = (type: 'startDate' | 'endDate', value: string) => {
    setDateRange((prev) => ({
      ...prev,
      [type]: value,
    }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Relatórios"
          description="Carregando indicadores de vendas, conversão e destinos..."
        />
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Relatórios"
          description="Indicadores de vendas, conversão e destinos mais procurados pela agência."
        />
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
            <div className="text-sm text-red-800">
              <p className="font-semibold">Erro ao carregar relatórios</p>
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate summary statistics
  const totalSales = salesData.reduce((sum, item) => sum + parseFloat(item.total || '0'), 0);
  const totalSalesFormatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(totalSales);

  const conversionRate = proposalData?.conversionRate ?? '0';
  const activeBookings =
    bookingsData.find((b) => b.status === 'ACTIVE')?.count ?? 0;
  const cancelledBookings =
    bookingsData.find((b) => b.status === 'CANCELLED')?.count ?? 0;
  const totalBookings = activeBookings + cancelledBookings;

  const upcomingTrips =
    tripsData.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED').reduce(
      (sum, t) => sum + t.count,
      0,
    ) ?? 0;

  const maxSales = Math.max(...salesData.map((s) => parseFloat(s.total || '0')), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Indicadores de vendas, conversão e destinos mais procurados pela agência."
      />

      {/* Date Range Filter */}
      <Card>
        <CardContent className="flex gap-4 pt-6">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700">Data Inicial</label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700">Data Final</label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Vendas no período"
          value={totalSalesFormatted}
          delta={`${salesData.length} períodos com dados`}
          deltaTone="positive"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Taxa de conversão (proposta → venda)"
          value={`${conversionRate}%`}
          delta={`${proposalData?.accepted ?? 0} de ${proposalData?.sent ?? 0} propostas fechadas`}
          deltaTone={parseFloat(conversionRate) > 50 ? 'positive' : 'neutral'}
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <StatCard
          label="Viagens ativas"
          value={upcomingTrips.toString()}
          delta={`${totalBookings} reservas registradas`}
          deltaTone="neutral"
          icon={<MapPin className="h-4 w-4" />}
        />
      </div>

      {/* Sales by Period & Proposal Status */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Vendas por período</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {salesData.length > 0 ? (
              salesData.map((item) => (
                <div key={item.period} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs font-medium text-slate-500">
                    {item.period}
                  </span>
                  <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                    <div
                      className="h-2.5 rounded-full bg-slate-900"
                      style={{ width: `${(parseFloat(item.total || '0') / maxSales) * 100}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs font-semibold text-slate-900">
                    {new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                      maximumFractionDigits: 0,
                    }).format(parseFloat(item.total || '0'))}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">Nenhum dado de vendas para este período</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição de status das reservas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
              {activeBookings > 0 && (
                <div
                  className="bg-emerald-500"
                  style={{ width: `${(activeBookings / Math.max(totalBookings, 1)) * 100}%` }}
                />
              )}
              {cancelledBookings > 0 && (
                <div
                  className="bg-red-500"
                  style={{ width: `${(cancelledBookings / Math.max(totalBookings, 1)) * 100}%` }}
                />
              )}
            </div>
            <ul className="space-y-2">
              <li className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Ativas
                </span>
                <span className="font-medium text-slate-900">{activeBookings}</span>
              </li>
              <li className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  Canceladas
                </span>
                <span className="font-medium text-slate-900">{cancelledBookings}</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Top Destinations */}
      <Card>
        <CardHeader>
          <CardTitle>Top destinos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {destinationsData.length > 0 ? (
            destinationsData.map((item) => {
              const maxBookings = Math.max(...destinationsData.map((d) => d.bookingCount), 1);
              return (
                <div key={item.destination} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-sm font-medium text-slate-900">
                    {item.destination}
                  </span>
                  <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                    <div
                      className="h-2.5 rounded-full bg-cyan-600"
                      style={{ width: `${(item.bookingCount / maxBookings) * 100}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs text-slate-500">
                    {item.bookingCount} reserva{item.bookingCount !== 1 ? 's' : ''}
                  </span>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-slate-500">Nenhum destino com dados</p>
          )}
        </CardContent>
      </Card>

      {/* Trips by Status */}
      <Card>
        <CardHeader>
          <CardTitle>Viagens por status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tripsData.length > 0 ? (
            <ul className="space-y-2">
              {tripsData.map((item) => (
                <li key={item.status} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{item.status}</span>
                  <span className="font-medium text-slate-900">{item.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Nenhuma viagem registrada</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
