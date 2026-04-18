import { useEffect, useRef, useState, useCallback } from 'react';
import { Topbar } from './components/shell/Topbar';
import { Sidebar } from './components/sidebar/Sidebar';
import { WorkArea } from './components/shell/WorkArea';
import { StatusBar } from './components/shell/StatusBar';
import { AiPanel } from './components/ai/AiPanel';
import { LockScreen } from './components/auth/LockScreen';

import { SettingsPage } from './components/pages/SettingsPage';
import { VaultPage } from './components/pages/VaultPage';
import { useTheme } from './hooks/useTheme';
import { useSidecar } from './hooks/useSidecar';
import { useSettingsStore } from './store/settingsStore';
import { useVaultStore } from './store/vaultStore';
import { useEditorStore } from './store/editorStore';
import { registerBuiltinPlugins } from '@quill/container-plugins';
import { checkAuthStatus, getAuthToken, setAuthToken, getApiRoot } from './utils/authToken';
import { isTauri } from './utils/platform';

// Register all built-in container plugins at app startup
registerBuiltinPlugins();

/** Hook to detect mobile viewport */
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mql.addEventListener('change', handler);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

export default function App() {
  useTheme();
  useSidecar();

  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const toggleMobileSidebar = useCallback(() => {
    setMobileSidebarOpen((prev) => !prev);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  const currentPage = useSettingsStore((state) => state.currentPage);
  const showAiPanel = useSettingsStore((state) => state.showAiPanel);
  const showStatusBar = useSettingsStore((state) => state.showStatusBar);
  const fontSize = useSettingsStore((state) => state.fontSize);

  // ── Auth: check if password protection is enabled ──
  const [authState, setAuthState] = useState<'checking' | 'locked' | 'unlocked'>('checking');
  const locked = authState === 'locked';

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const status = await checkAuthStatus();
        if (cancelled) return;

        if (!status.enabled || !status.hasToken) {
          setAuthState('unlocked');
          return;
        }

        const existingToken = getAuthToken();
        if (!existingToken) {
          setAuthState('locked');
          return;
        }

        const response = await fetch(`${getApiRoot()}/auth/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: existingToken }),
        });

        if (!cancelled) {
          setAuthState(response.ok ? 'unlocked' : 'locked');
        }
      } catch {
        if (!cancelled) setAuthState('locked');
      }
    }

    checkAuth();
    return () => { cancelled = true; };
  }, []);

  const handleUnlock = useCallback((token: string) => {
    setAuthToken(token);
    setAuthState('unlocked');
  }, []);

  // ── Vault initialization: wait until auth is resolved ──
  const vaultInitialized = useRef(false);

  useEffect(() => {
    if (authState !== 'unlocked') return;
    if (vaultInitialized.current) return;
    vaultInitialized.current = true;

    const initializeVault = async () => {
      await useVaultStore.getState().initVault();

      // Restore previously opened tabs from last session
      await useEditorStore.getState().restoreOpenTabs();

      // If no tabs were restored, open the first file as fallback
      const { fileTree } = useVaultStore.getState();
      const { tabs } = useEditorStore.getState();
      if (tabs.length === 0 && fileTree.length > 0) {
        const firstFile = fileTree.find((entry) => entry.type === 'file');
        if (firstFile) {
          await useEditorStore.getState().openFile(firstFile.path, firstFile.name);
        }
      }
    };
    initializeVault();
  }, [authState]);

  // ── Hide all native webviews when leaving the editor page ──
  useEffect(() => {
    if (currentPage !== 'editor' && isTauri()) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('hide_all_webviews').catch(() => {});
      });
    }
  }, [currentPage]);

  // ── Global Ctrl+S / Cmd+S ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const { activeTabId, saveFile } = useEditorStore.getState();
        if (activeTabId) {
          saveFile(activeTabId);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={`shell ${locked ? 'locked' : ''}`} style={{ '--ui-font-size': `${fontSize}px` } as any}>
      {locked && (
        <LockScreen
          apiBase={getApiRoot()}
          onUnlock={handleUnlock}
        />
      )}
      <Topbar isMobile={isMobile} onToggleSidebar={toggleMobileSidebar} />

      {currentPage === 'editor' && (
        <div className="body-row">
          {/* Mobile: overlay sidebar drawer */}
          {isMobile && mobileSidebarOpen && (
            <div className="mobile-sidebar-overlay" onClick={closeMobileSidebar} />
          )}
          <div className={`sidebar-wrapper ${isMobile ? 'mobile' : ''} ${mobileSidebarOpen ? 'open' : ''}`}>
            <Sidebar onFileSelect={isMobile ? closeMobileSidebar : undefined} />
          </div>
          <WorkArea />
          {showAiPanel && <AiPanel />}
        </div>
      )}

      {currentPage === 'vault' && (
        <div className="body-row">
          {isMobile && mobileSidebarOpen && (
            <div className="mobile-sidebar-overlay" onClick={closeMobileSidebar} />
          )}
          <div className={`sidebar-wrapper ${isMobile ? 'mobile' : ''} ${mobileSidebarOpen ? 'open' : ''}`}>
            <Sidebar onFileSelect={isMobile ? closeMobileSidebar : undefined} />
          </div>
          <VaultPage />
        </div>
      )}

      {currentPage === 'settings' && (
        <div className="body-row">
          <SettingsPage />
        </div>
      )}

      {showStatusBar && <StatusBar />}
    </div>
  );
}
