import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, ProtectedRoute, useCan } from './auth';
import { menuPermissions } from './menu';
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
import { SettingsPage } from './pages/SettingsPage';

/** Hides a page the user cannot use (direct URL -> dashboard). */
function Allowed({ path, children }: { path: string; children: ReactNode }) {
  const anyOf = menuPermissions(path);
  const allowed = useCan(...anyOf);
  return anyOf.length === 0 || allowed ? <>{children}</> : <Navigate to="/" replace />;
}

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
            <Route path="/clientes" element={<Allowed path="/clientes"><CustomersPage /></Allowed>} />
            <Route path="/vendedores" element={<Allowed path="/vendedores"><SellersPage /></Allowed>} />
            <Route path="/vendas" element={<Allowed path="/vendas"><SalesPage /></Allowed>} />
            <Route path="/comissoes" element={<Allowed path="/comissoes"><CommissionsPage /></Allowed>} />
            <Route path="/financeiro" element={<Allowed path="/financeiro"><FinancePage /></Allowed>} />
            <Route path="/relatorios" element={<Allowed path="/relatorios"><ReportsPage /></Allowed>} />
            <Route path="/cadastros" element={<Allowed path="/cadastros"><CatalogPage /></Allowed>} />
            <Route path="/configuracoes" element={<Allowed path="/configuracoes"><SettingsPage /></Allowed>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
