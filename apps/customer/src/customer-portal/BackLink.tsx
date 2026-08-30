import { Link } from 'react-router-dom';

// Consistent "Voltar" back-navigation control for customer-portal detail
// pages. Deliberately a plain Link (not history.back()) so behavior is
// predictable when a detail page is opened directly (e.g. shared link) --
// history.back() would be a no-op or leave the portal in that case.
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex w-fit items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 transition-colors"
    >
      <span aria-hidden="true">←</span>
      {label}
    </Link>
  );
}
