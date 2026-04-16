import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { isTauri, getApiBase } from '@/utils/platform';

const POLL_INTERVAL_MS = 3000;

/**
 * Hook to poll the NestJS sidecar health endpoint.
 * Sets sidecarReady=true once the backend responds.
 */
export function useSidecar() {
  const sidecarReady = useSettingsStore((state) => state.sidecarReady);
  const setSidecarReady = useSettingsStore((state) => state.setSidecarReady);

  useEffect(() => {
    // Only poll in Tauri environment; in browser dev mode the backend is started manually
    if (typeof window === 'undefined' || !isTauri()) {
      setSidecarReady(true);
      return;
    }

    if (sidecarReady) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(`${getApiBase()}/health`);
        if (response.ok && !cancelled) {
          setSidecarReady(true);
          return;
        }
      } catch {
        // sidecar not ready yet
      }
      if (!cancelled) {
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, [sidecarReady, setSidecarReady]);

  return sidecarReady;
}
