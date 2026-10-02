/**
 * Registers the app-shell service worker (public/sw.js). Production only:
 * in dev a service worker would keep serving stale modules.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Installing is an enhancement: the app works the same without it.
    });
  });
}
