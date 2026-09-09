import { Route, Routes } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { PricingPage } from './pages/PricingPage';
import { TrialSignup } from './pages/TrialSignup';
import { DemoRequest } from './pages/DemoRequest';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/trial" element={<TrialSignup />} />
      <Route path="/demo" element={<DemoRequest />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
