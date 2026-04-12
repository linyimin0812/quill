import { useEffect, useRef } from 'react';
import { Topbar } from './components/shell/Topbar';
import { Sidebar } from './components/sidebar/Sidebar';
import { WorkArea } from './components/shell/WorkArea';
import { StatusBar } from './components/shell/StatusBar';
import { OutlinePanel } from './components/outline/OutlinePanel';
import { AiPanel } from './components/ai/AiPanel';
import { SettingsPage } from './components/pages/SettingsPage';
import { VaultPage } from './components/pages/VaultPage';
import { useTheme } from './hooks/useTheme';
import { useSidecar } from './hooks/useSidecar';
import { useSettingsStore } from './store/settingsStore';
import { useVaultStore } from './store/vaultStore';
import { useEditorStore } from './store/editorStore';
import { registerBuiltinPlugins } from '@quill/container-plugins';

// Register all built-in container plugins at app startup
registerBuiltinPlugins();

export default function App() {
  useTheme();
  useSidecar();

  const vaultInitialized = useRef(false);

  useEffect(() => {
    if (vaultInitialized.current) return;
    vaultInitialized.current = true;

    const initializeVault = async () => {
      await useVaultStore.getState().initVault();

      // Auto-open the first file when entering editor for the first time
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
  }, []);

  // Global Ctrl+S / Cmd+S to save the active tab
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

  const currentPage = useSettingsStore((state) => state.currentPage);
  const showAiPanel = useSettingsStore((state) => state.showAiPanel);
  const showStatusBar = useSettingsStore((state) => state.showStatusBar);
  const fontSize = useSettingsStore((state) => state.fontSize);

  return (
    <div className="shell" style={{ '--ui-font-size': `${fontSize}px` } as any}>
      <Topbar />

      {currentPage === 'editor' && (
        <div className="body-row">
          <Sidebar />
          <WorkArea />
          <OutlinePanel />
          {showAiPanel && <AiPanel />}
        </div>
      )}

      {currentPage === 'vault' && (
        <div className="body-row">
          <Sidebar />
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
