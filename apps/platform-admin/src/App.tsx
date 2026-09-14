import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequirePlatformAuth } from './components/auth/RequirePlatformAuth';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { SubscribersPage } from './pages/SubscribersPage';
import { PlansPage } from './pages/PlansPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { FinancialPage } from './pages/FinancialPage';
import { LeadsPage } from './pages/LeadsPage';
import { MarketingPage } from './pages/MarketingPage';
import { SupportPage } from './pages/SupportPage';
import { SettingsPage } from './pages/SettingsPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { FeatureFlagsPage } from './pages/FeatureFlagsPage';
import { HealthPage } from './pages/HealthPage';
import { AuditPage } from './pages/AuditPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />

      <Route element={<RequirePlatformAuth />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="subscribers" element={<SubscribersPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="subscriptions" element={<SubscriptionsPage />} />
          <Route path="financial" element={<FinancialPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="marketing" element={<MarketingPage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="feature-flags" element={<FeatureFlagsPage />} />
          <Route path="health" element={<HealthPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
