import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { CustomersPage } from './pages/CustomersPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { WishesPage } from './pages/WishesPage';
import { WishDetailPage } from './pages/WishDetailPage';
import { TripsPage } from './pages/TripsPage';
import { TripDetailPage } from './pages/TripDetailPage';
import { NotFoundPage } from './pages/NotFoundPage';
import {
  BookingDetailPage,
  BookingListPage,
  ProposalBuilderPage,
  ProposalDetailPage,
  ProposalListPage,
  ProposalPreviewPage,
  SaleSummaryPage,
  SalesListPage,
} from './pages/SalesJourneyPages';
import { OffersPage } from './pages/OffersPage';
import { OfferDetailPage } from './pages/OfferDetailPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { CouponsPage } from './pages/CouponsPage';
import { FinancialPage } from './pages/FinancialPage';
import { SaleFinancialStoryPage } from './pages/SaleFinancialStoryPage';
import { RevenuesPage } from './pages/RevenuesPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { CostCentersPage } from './pages/CostCentersPage';
import { CashTransactionsPage } from './pages/CashTransactionsPage';
import { ReconciliationPage } from './pages/ReconciliationPage';
import { DetailedReportsPage } from './pages/DetailedReportsPage';
import { ReceivablesPage } from './pages/ReceivablesPage';
import { PayablesPage } from './pages/PayablesPage';
import { PescadorPage } from './pages/PescadorPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { AirServicesPage } from './pages/AirServicesPage';
import { LandServicesPage } from './pages/LandServicesPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="wishes" element={<WishesPage />} />
        <Route path="wishes/:id" element={<WishDetailPage />} />
        <Route path="trips" element={<TripsPage />} />
        <Route path="trips/:id" element={<TripDetailPage />} />
        <Route path="proposals" element={<ProposalListPage />} />
        <Route path="proposals/:id" element={<ProposalDetailPage />} />
        <Route path="proposals/:id/edit" element={<ProposalBuilderPage />} />
        <Route path="proposals/:id/preview" element={<ProposalPreviewPage />} />
        <Route path="bookings" element={<BookingListPage />} />
        <Route path="bookings/:id" element={<BookingDetailPage />} />
        <Route path="sales" element={<SalesListPage />} />
        <Route path="sales/:id" element={<SaleSummaryPage />} />
        <Route path="offers" element={<OffersPage />} />
        <Route path="offers/:id" element={<OfferDetailPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="coupons" element={<CouponsPage />} />
        <Route path="financial" element={<FinancialPage />} />
        <Route path="financial/sales/:saleId/story" element={<SaleFinancialStoryPage />} />
        <Route path="financial/revenues" element={<RevenuesPage />} />
        <Route path="financial/expenses" element={<ExpensesPage />} />
        <Route path="financial/receivables" element={<ReceivablesPage />} />
        <Route path="financial/payables" element={<PayablesPage />} />
        <Route path="financial/categories" element={<CategoriesPage />} />
        <Route path="financial/cost-centers" element={<CostCentersPage />} />
        <Route path="financial/cash-transactions" element={<CashTransactionsPage />} />
        <Route path="financial/reconciliation" element={<ReconciliationPage />} />
        <Route path="financial/reports" element={<DetailedReportsPage />} />
        <Route path="pescador" element={<PescadorPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="operations/air" element={<AirServicesPage />} />
        <Route path="operations/land" element={<LandServicesPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
