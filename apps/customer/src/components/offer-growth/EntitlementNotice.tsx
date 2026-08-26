// Shared "feature not enabled" banner used across every Offer & Growth
// screen. Never show a generic error or a blank/broken state when an
// entitlement is off -- the backend fails closed (403), and this is the
// one friendly message every screen renders instead.
export function EntitlementNotice({ feature }: { feature?: string }) {
  return (
    <div
      role="status"
      className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
    >
      Recurso não habilitado para esta agência{feature ? ` (${feature})` : ''}. Fale com o time
      responsável pelo plano da agência para habilitar este recurso.
    </div>
  );
}

export function TestChannelBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-fuchsia-300 bg-fuchsia-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-fuchsia-700">
      Teste / Demo
    </span>
  );
}
