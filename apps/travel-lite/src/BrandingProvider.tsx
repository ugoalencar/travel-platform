import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { DEFAULT_BRANDING, brandingVars, normalizeBranding, type Branding } from './branding';

export type BrandingStatus = 'idle' | 'loading' | 'ready' | 'error';

interface BrandingContextValue {
  branding: Branding;
  /** `ready` only after the session tenant's branding was actually read. */
  status: BrandingStatus;
  setBranding: (branding: Branding) => void;
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: DEFAULT_BRANDING,
  status: 'idle',
  setBranding: () => undefined,
});

/**
 * Loads the session tenant's branding after login and applies the colors to
 * the document root while the user is signed in.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [status, setStatus] = useState<BrandingStatus>('idle');
  const signedIn = user !== null;

  useEffect(() => {
    if (!signedIn) {
      setBranding(DEFAULT_BRANDING);
      setStatus('idle');
      return;
    }
    let active = true;
    setStatus('loading');
    api<{ branding: unknown }>('/branding')
      .then((response) => {
        if (!active) return;
        setBranding(normalizeBranding(response.branding));
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [signedIn]);

  useEffect(() => {
    const vars = brandingVars(branding);
    const root = document.documentElement;
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
    return () => {
      for (const name of Object.keys(vars)) root.style.removeProperty(name);
    };
  }, [branding]);

  // The installed app's status bar follows the agency's primary color.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta || !branding.primaryColor) return;
    const original = meta.content;
    meta.content = branding.primaryColor;
    return () => {
      meta.content = original;
    };
  }, [branding.primaryColor]);

  const value = useMemo(() => ({ branding, status, setBranding }), [branding, status]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}
