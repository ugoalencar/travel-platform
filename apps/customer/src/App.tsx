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
      </Route>
    </Routes>
  );
}
