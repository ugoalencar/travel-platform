import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
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

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/customers" replace />} />
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
        <Route path="proposals" element={<ProposalsPage />} />
        <Route path="proposals/new" element={<ProposalFormPage />} />
        <Route path="proposals/:id" element={<ProposalDetailsPage />} />
        <Route path="proposals/:id/edit" element={<ProposalEditPage />} />
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
      </Route>
    </Routes>
  );
}
