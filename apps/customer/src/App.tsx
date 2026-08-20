import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { CustomersPage } from './pages/CustomersPage';
import { CustomerFormPage } from './pages/CustomerFormPage';
import { CustomerDetailsPage } from './pages/CustomerDetailsPage';
import { CustomerEditPage } from './pages/CustomerEditPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/customers" replace />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/new" element={<CustomerFormPage />} />
        <Route path="customers/:id" element={<CustomerDetailsPage />} />
        <Route path="customers/:id/edit" element={<CustomerEditPage />} />
      </Route>
    </Routes>
  );
}
