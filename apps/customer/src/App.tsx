import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { EnrollmentPage } from './pages/EnrollmentPage';
import { AcceptInvitationPage } from './pages/AcceptInvitationPage';
import { CustomersPage } from './pages/CustomersPage';
import { CustomerFormPage } from './pages/CustomerFormPage';
import { CustomerDetailsPage } from './pages/CustomerDetailsPage';
import { CustomerEditPage } from './pages/CustomerEditPage';
import { WishesPage } from './pages/WishesPage';
import { WishFormPage } from './pages/WishFormPage';
import { WishDetailsPage } from './pages/WishDetailsPage';
import { WishEditPage } from './pages/WishEditPage';
import { TripsPage } from './pages/TripsPage';
import { TripFormPage } from './pages/TripFormPage';
import { TripDetailsPage } from './pages/TripDetailsPage';
import { TripEditPage } from './pages/TripEditPage';
import { OffersPage } from './pages/OffersPage';
import { OfferFormPage } from './pages/OfferFormPage';
import { OfferDetailsPage } from './pages/OfferDetailsPage';
import { OfferEditPage } from './pages/OfferEditPage';
import { CreativeStudioPage } from './pages/offer-growth/CreativeStudioPage';
import { TemplatesPage } from './pages/offer-growth/TemplatesPage';
import { AssetsPage } from './pages/offer-growth/AssetsPage';
import { CampaignsPage } from './pages/offer-growth/CampaignsPage';
import { PublicationsPage } from './pages/offer-growth/PublicationsPage';
import { AutomationsPage } from './pages/offer-growth/AutomationsPage';
import { CouponsPage } from './pages/offer-growth/CouponsPage';
import { OfferGrowthDemoPage } from './pages/offer-growth/DemoPage';
import { ProposalsPage } from './pages/ProposalsPage';
import { ProposalFormPage } from './pages/ProposalFormPage';
import { ProposalDetailsPage } from './pages/ProposalDetailsPage';
import { ProposalEditPage } from './pages/ProposalEditPage';
import { TransportRoutesPage } from './pages/TransportRoutesPage';
import { TransportRouteFormPage } from './pages/TransportRouteFormPage';
import { TransportRouteDetailsPage } from './pages/TransportRouteDetailsPage';
import { TransportRouteEditPage } from './pages/TransportRouteEditPage';
import { TransportProductsPage } from './pages/TransportProductsPage';
import { TransportProductFormPage } from './pages/TransportProductFormPage';
import { TransportProductDetailsPage } from './pages/TransportProductDetailsPage';
import { TransportProductEditPage } from './pages/TransportProductEditPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { SupplierFormPage } from './pages/SupplierFormPage';
import { SupplierDetailsPage } from './pages/SupplierDetailsPage';
import { SupplierEditPage } from './pages/SupplierEditPage';
import { DeparturesPage } from './pages/DeparturesPage';
import { DepartureFormPage } from './pages/DepartureFormPage';
import { DepartureDetailsPage } from './pages/DepartureDetailsPage';
import { DepartureEditPage } from './pages/DepartureEditPage';
import { TransportAgendaPage } from './pages/TransportAgendaPage';
import { BookingsPage } from './pages/BookingsPage';
import { BookingFormPage } from './pages/BookingFormPage';
import { BookingDetailsPage } from './pages/BookingDetailsPage';
import { OperationsTodayPage } from './pages/OperationsTodayPage';
import { OperationDetailsPage } from './pages/OperationDetailsPage';
import { SalesPage } from './pages/SalesPage';
import { SaleFormPage } from './pages/SaleFormPage';
import { SaleDetailsPage } from './pages/SaleDetailsPage';
import { SaleEditPage } from './pages/SaleEditPage';
import { FinancialPage } from './pages/FinancialPage';
import { PayablesPage } from './pages/PayablesPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { OperationalCostsPage } from './pages/OperationalCostsPage';
import { SaleMarginPage } from './pages/SaleMarginPage';
import { PescadorPage } from './pages/PescadorPage';
import { CustomerPortalShell } from './customer-portal/CustomerPortalShell';
import { CustomerHomePage } from './customer-portal/pages/CustomerHomePage';
import { CustomerTripsPage } from './customer-portal/pages/CustomerTripsPage';
import { CustomerTripDetailsPage } from './customer-portal/pages/CustomerTripDetailsPage';
import { CustomerOffersPage } from './customer-portal/pages/CustomerOffersPage';
import { CustomerOfferDetailsPage } from './customer-portal/pages/CustomerOfferDetailsPage';
import { CustomerProposalsPage } from './customer-portal/pages/CustomerProposalsPage';
import { CustomerProposalDetailsPage } from './customer-portal/pages/CustomerProposalDetailsPage';
import { CustomerBookingsPage } from './customer-portal/pages/CustomerBookingsPage';
import { CustomerBookingDetailsPage } from './customer-portal/pages/CustomerBookingDetailsPage';
import { CustomerProfilePage } from './customer-portal/pages/CustomerProfilePage';
import { CustomerDocumentsPage } from './customer-portal/pages/CustomerDocumentsPage';
import { CustomerPaymentsPage } from './customer-portal/pages/CustomerPaymentsPage';
import { CustomerHelpPage } from './customer-portal/pages/CustomerHelpPage';
import { CustomerLoginPage } from './customer-portal/pages/CustomerLoginPage';
import { CustomerForgotPasswordPage } from './customer-portal/pages/CustomerForgotPasswordPage';
import { CustomerResetPasswordPage } from './customer-portal/pages/CustomerResetPasswordPage';
import { RequireCustomerAuth } from './customer-portal/RequireCustomerAuth';
import { CommercialDashboardPage } from './pages/commercial/CommercialDashboardPage';
import { CommercialPipelinePage } from './pages/commercial/CommercialPipelinePage';
import { CommercialAgendaPage } from './pages/commercial/CommercialAgendaPage';
import { PipelineConfigPage } from './pages/commercial/PipelineConfigPage';

export function App() {
  return (
    <Routes>
      {/* Public, unauthenticated remote enrollment form (Client Onboarding,
          Agent 02). No shell -- a prospect isn't a staff user or an
          existing customer. Resolves entirely via the :token in the URL,
          which the backend maps to a tenant server-side. */}
      <Route path="enroll/:token" element={<EnrollmentPage />} />

      {/* Public, unauthenticated invite-acceptance form (SaaS Admin,
          Agent 01). Same shape as /enroll/:token above. */}
      <Route path="accept-invitation/:token" element={<AcceptInvitationPage />} />

      {/* End-customer-facing portal. Entirely separate route tree, shell,
          and nav from the staff admin tree below -- see
          customer-portal/CustomerPortalShell.tsx. Login/forgot/reset are
          public; everything else requires a session. */}
      <Route path="customer-portal/login" element={<CustomerLoginPage />} />
      <Route path="customer-portal/forgot-password" element={<CustomerForgotPasswordPage />} />
      <Route path="customer-portal/reset-password" element={<CustomerResetPasswordPage />} />

      <Route element={<RequireCustomerAuth />}>
        <Route element={<CustomerPortalShell />}>
          <Route path="customer-portal" element={<CustomerHomePage />} />
          <Route path="customer-portal/trips" element={<CustomerTripsPage />} />
          <Route path="customer-portal/trips/:id" element={<CustomerTripDetailsPage />} />
          <Route path="customer-portal/offers" element={<CustomerOffersPage />} />
          <Route path="customer-portal/offers/:id" element={<CustomerOfferDetailsPage />} />
          <Route path="customer-portal/proposals" element={<CustomerProposalsPage />} />
          <Route path="customer-portal/proposals/:id" element={<CustomerProposalDetailsPage />} />
          <Route path="customer-portal/bookings" element={<CustomerBookingsPage />} />
          <Route path="customer-portal/bookings/:id" element={<CustomerBookingDetailsPage />} />
          <Route path="customer-portal/profile" element={<CustomerProfilePage />} />
          <Route path="customer-portal/documents" element={<CustomerDocumentsPage />} />
          <Route path="customer-portal/payments" element={<CustomerPaymentsPage />} />
          <Route path="customer-portal/help" element={<CustomerHelpPage />} />
        </Route>
      </Route>

      <Route element={<AppShell />}>
        {/* Root of this domain is customer-facing (portal.*) -- must land on
            the customer portal, never the staff admin tree below. */}
        <Route index element={<Navigate to="/customer-portal" replace />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/new" element={<CustomerFormPage />} />
        <Route path="customers/:id" element={<CustomerDetailsPage />} />
        <Route path="customers/:id/edit" element={<CustomerEditPage />} />
        <Route path="wishes" element={<WishesPage />} />
        <Route path="wishes/new" element={<WishFormPage />} />
        <Route path="wishes/:id" element={<WishDetailsPage />} />
        <Route path="wishes/:id/edit" element={<WishEditPage />} />
        <Route path="trips" element={<TripsPage />} />
        <Route path="trips/new" element={<TripFormPage />} />
        <Route path="trips/:id" element={<TripDetailsPage />} />
        <Route path="trips/:id/edit" element={<TripEditPage />} />
        <Route path="offers" element={<OffersPage />} />
        <Route path="offers/new" element={<OfferFormPage />} />
        <Route path="offers/:id" element={<OfferDetailsPage />} />
        <Route path="offers/:id/edit" element={<OfferEditPage />} />
        <Route path="offer-growth/studio" element={<CreativeStudioPage />} />
        <Route path="offer-growth/editor" element={<OfferGrowthEditorRedirect />} />
        <Route path="offer-growth/templates" element={<TemplatesPage />} />
        <Route path="offer-growth/assets" element={<AssetsPage />} />
        <Route path="offer-growth/campaigns" element={<CampaignsPage />} />
        <Route path="offer-growth/publications" element={<PublicationsPage />} />
        <Route path="offer-growth/automations" element={<AutomationsPage />} />
        <Route path="offer-growth/coupons" element={<CouponsPage />} />
        <Route path="offer-growth/demo" element={<OfferGrowthDemoPage />} />
        <Route path="proposals" element={<ProposalsPage />} />
        <Route path="proposals/new" element={<ProposalFormPage />} />
        <Route path="proposals/:id" element={<ProposalDetailsPage />} />
        <Route path="proposals/:id/edit" element={<ProposalEditPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="bookings/new" element={<BookingFormPage />} />
        <Route path="bookings/:id" element={<BookingDetailsPage />} />
        <Route path="transport/routes" element={<TransportRoutesPage />} />
        <Route path="transport/routes/new" element={<TransportRouteFormPage />} />
        <Route path="transport/routes/:id" element={<TransportRouteDetailsPage />} />
        <Route path="transport/routes/:id/edit" element={<TransportRouteEditPage />} />
        <Route path="transport/products" element={<TransportProductsPage />} />
        <Route path="transport/products/new" element={<TransportProductFormPage />} />
        <Route path="transport/products/:id" element={<TransportProductDetailsPage />} />
        <Route path="transport/products/:id/edit" element={<TransportProductEditPage />} />
        <Route path="transport/suppliers" element={<SuppliersPage />} />
        <Route path="transport/suppliers/new" element={<SupplierFormPage />} />
        <Route path="transport/suppliers/:id" element={<SupplierDetailsPage />} />
        <Route path="transport/suppliers/:id/edit" element={<SupplierEditPage />} />
        <Route path="transport/departures" element={<DeparturesPage />} />
        <Route path="transport/departures/new" element={<DepartureFormPage />} />
        <Route path="transport/departures/:id" element={<DepartureDetailsPage />} />
        <Route path="transport/departures/:id/edit" element={<DepartureEditPage />} />
        <Route path="transport/agenda" element={<TransportAgendaPage />} />
        <Route path="operations/today" element={<OperationsTodayPage />} />
        <Route path="operations/:id" element={<OperationDetailsPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="sales/new" element={<SaleFormPage />} />
        <Route path="sales/:id" element={<SaleDetailsPage />} />
        <Route path="sales/:id/edit" element={<SaleEditPage />} />
        <Route path="financial" element={<FinancialPage />} />
        <Route path="financial/payables" element={<PayablesPage />} />
        <Route path="financial/payments" element={<PaymentsPage />} />
        <Route path="financial/operational-costs" element={<OperationalCostsPage />} />
        <Route path="financial/sales/:saleId/margin" element={<SaleMarginPage />} />
        <Route path="pescador" element={<PescadorPage />} />
        <Route path="commercial/dashboard" element={<CommercialDashboardPage />} />
        <Route path="commercial/pipeline" element={<CommercialPipelinePage />} />
        <Route path="commercial/agenda" element={<CommercialAgendaPage />} />
        <Route path="settings/pipelines" element={<PipelineConfigPage />} />
      </Route>
    </Routes>
  );
}

// /offer-growth/editor is kept as a distinct route (not the Studio
// placeholder) but is a thin alias: opening a template for editing and
// opening the Creative Studio editor are the same feature, so this
// preserves the query string (templateId/offerId) and forwards into
// /offer-growth/studio rather than duplicating the whole editor.
function OfferGrowthEditorRedirect() {
  const location = useLocation();
  return <Navigate to={`/offer-growth/studio${location.search}`} replace />;
}
