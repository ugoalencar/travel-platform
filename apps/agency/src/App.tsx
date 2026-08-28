import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { NotFoundPage } from './pages/NotFoundPage';
import {
  BookingsPage,
  CustomersPage,
  FinancialPage,
  OffersPage,
  ProposalsPage,
  ReportsPage,
  SalesPage,
  SettingsPage,
  TripsPage,
  WishesPage,
} from './pages/nav-pages';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="wishes" element={<WishesPage />} />
        <Route path="trips" element={<TripsPage />} />
        <Route path="proposals" element={<ProposalsPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="offers" element={<OffersPage />} />
        <Route path="financial" element={<FinancialPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
