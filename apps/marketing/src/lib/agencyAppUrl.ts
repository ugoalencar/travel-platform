// Marketing is a separate Vite build/origin from apps/agency, where real
// login/signup actually live (session.ts, authApi.ts, LoginPage,
// SignupPage) -- no static-page recreation of that flow here. Configure
// via VITE_AGENCY_APP_URL per environment (Vercel: the deployed agency
// app's URL; local vite dev: defaults to its dev server port; local
// staging (Caddy): set to https://agency.localhost).
const AGENCY_APP_URL: string = (import.meta.env.VITE_AGENCY_APP_URL as string | undefined) ?? 'http://localhost:5173';

export function agencySignupUrl(): string {
  return `${AGENCY_APP_URL}/signup`;
}

export function agencyLoginUrl(): string {
  return `${AGENCY_APP_URL}/login`;
}
