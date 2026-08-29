import { useEffect, useState } from 'react';

export type MockLoadState = 'loading' | 'ready';

/**
 * Simulates an initial data fetch for fixture-driven prototype screens.
 * The UI-02 prototype has no backend, so screens render static fixtures;
 * this hook adds a brief, realistic loading phase so each major page can
 * demonstrate its loading state before revealing the populated content.
 *
 * The default delay is kept short so tests assert on the ready state
 * and measure the fixture content, not the loader.
 */
export function useMockLoading(delayMs = 350): MockLoadState {
  const [state, setState] = useState<MockLoadState>('loading');

  useEffect(() => {
    const timer = setTimeout(() => setState('ready'), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return state;
}
