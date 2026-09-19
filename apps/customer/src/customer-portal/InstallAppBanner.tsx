import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'minha-viagem:install-banner-dismissed';

/** Chrome/Android-only browser hook (`beforeinstallprompt`) for a
 * custom "instalar app" banner instead of relying on the browser's own
 * install UI, which most users never notice. Silently renders nothing on
 * browsers that don't fire this event (iOS Safari has no programmatic
 * install prompt -- installing there is the manual "Adicionar à Tela de
 * Início" share-sheet action, which this banner cannot trigger). */
export function InstallAppBanner() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    function handler(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!installEvent || dismissed) return null;

  async function handleInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  function handleDismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Best-effort only -- the banner just reappears next session.
    }
  }

  return (
    <div className="flex items-center gap-3 border-b-2 border-blue-100 bg-white px-4 py-2.5 text-sm sm:px-6">
      <Download className="h-4 w-4 shrink-0 text-[#2563eb]" />
      <p className="flex-1 text-slate-700">
        Instale o app <strong>Minha Viagem</strong> na tela inicial para acesso rápido.
      </p>
      <button
        type="button"
        onClick={() => void handleInstall()}
        className="shrink-0 rounded-lg bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#e85f4d]"
      >
        Instalar
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Fechar"
        className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
