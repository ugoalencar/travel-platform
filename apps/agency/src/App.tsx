import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth } from './components/auth/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { OnboardingWizardPage } from './pages/OnboardingWizardPage';
import { DashboardPage } from './pages/DashboardPage';
import { CustomersPage } from './pages/CustomersPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { WishesPage } from './pages/WishesPage';
import { PipelinePage } from './pages/PipelinePage';
import { SegmentsPage } from './pages/SegmentsPage';
import { InsurancePage } from './pages/InsurancePage';
import { ExcursionsPage } from './pages/ExcursionsPage';
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
import { DrePage } from './pages/DrePage';
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
import { PassengersPage } from './pages/operations/PassengersPage';
import { DocumentAlertsPage } from './pages/operations/DocumentAlertsPage';
import { OccurrencesPage } from './pages/operations/OccurrencesPage';
import { PostTripPage } from './pages/operations/PostTripPage';
import { ReportsPage } from './pages/ReportsPage';
import { CommunicationPage } from './pages/CommunicationPage';
import { CommunicationFormPage } from './pages/CommunicationFormPage';
import { TasksPage } from './pages/TasksPage';
import { TaskFormPage } from './pages/TaskFormPage';
import { SettingsPage } from './pages/SettingsPage';
import { EnrollmentLinksPage } from './pages/EnrollmentLinksPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { EmployeeDetailPage } from './pages/EmployeeDetailPage';
import { CommissionPlansPage } from './pages/CommissionPlansPage';
import { PayrollPage } from './pages/PayrollPage';

export function App() {
  return (
    <Routes>
      {/* Public: no session required. */}
      <Route path="login" element={<LoginPage />} />
      <Route path="signup" element={<SignupPage />} />
      <Route path="forgot-password" element={<ForgotPasswordPage />} />
      <Route path="reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        {/* Outside AppShell on purpose: no sidebar/nav chrome during
            first-run setup, and staying out of AppShell avoids re-running
            its onboarding-redirect check while already on this page. */}
        <Route path="onboarding" element={<OnboardingWizardPage />} />

        <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="wishes" element={<WishesPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="segments" element={<SegmentsPage />} />
        <Route path="insurance" element={<InsurancePage />} />
        <Route path="excursions" element={<ExcursionsPage />} />
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
        <Route path="communications" element={<CommunicationPage />} />
        <Route path="communications/new" element={<CommunicationFormPage />} />
        <Route path="communications/:id/edit" element={<CommunicationFormPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="tasks/new" element={<TaskFormPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="coupons" element={<CouponsPage />} />
        <Route path="financial" element={<FinancialPage />} />
        <Route path="financial/dre" element={<DrePage />} />
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
        <Route path="operations/passengers" element={<PassengersPage />} />
        <Route path="operations/documents" element={<DocumentAlertsPage />} />
        <Route path="operations/occurrences" element={<OccurrencesPage />} />
        <Route path="operations/post-trip" element={<PostTripPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="enrollment-links" element={<EnrollmentLinksPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="employees/:id" element={<EmployeeDetailPage />} />
        <Route path="commission-plans" element={<CommissionPlansPage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
