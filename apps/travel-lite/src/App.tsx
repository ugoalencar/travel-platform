import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, ProtectedRoute } from './auth';
import { Layout } from './Layout';
import { CatalogPage } from './pages/CatalogPage';
import { CommissionsPage } from './pages/CommissionsPage';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { FinancePage } from './pages/FinancePage';
import { LoginPage } from './pages/LoginPage';
import { ReportsPage } from './pages/ReportsPage';
import { SalesPage } from './pages/SalesPage';
import { SellersPage } from './pages/SellersPage';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/clientes" element={<CustomersPage />} />
            <Route path="/vendedores" element={<SellersPage />} />
            <Route path="/vendas" element={<SalesPage />} />
            <Route path="/comissoes" element={<CommissionsPage />} />
            <Route path="/financeiro" element={<FinancePage />} />
            <Route path="/relatorios" element={<ReportsPage />} />
            <Route path="/cadastros" element={<CatalogPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
