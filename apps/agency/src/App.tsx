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
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
