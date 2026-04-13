import { create } from 'zustand';
import { useVaultStore } from './vaultStore';
import { storageClient } from '@/utils/storageClient';

/** Debounced auto-save timers per tab */
const autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const AUTO_SAVE_DELAY_MS = 1000;

export type ViewMode = 'split' | 'edit' | 'preview';

export interface FileTab {
  id: string;
  name: string;
  path: string;
  content: string;
  isDirty: boolean;
}

interface EditorState {
  /** Currently active view mode */
  viewMode: ViewMode;
  /** List of open file tabs */
  tabs: FileTab[];
  /** ID of the currently active tab */
  activeTabId: string | null;
  /** Whether the outline panel is visible */
  outlineVisible: boolean;
  /** Whether the AI panel is visible */
  aiPanelVisible: boolean;
  /** Current cursor position */
  cursorLine: number;
  cursorCol: number;
  /** Word count of current document */
  wordCount: number;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  addTab: (tab: FileTab) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  markTabDirty: (tabId: string, isDirty: boolean) => void;
  toggleOutline: () => void;
  toggleAiPanel: () => void;
  setCursorPosition: (line: number, col: number) => void;
  setWordCount: (count: number) => void;

  /** Open a file from the vault (reads content via VaultStore) */
  openFile: (path: string, name: string) => Promise<void>;
  /** Save the active tab's content to the vault */
  saveFile: (tabId: string) => Promise<void>;
  /** Restore previously open tabs for the current vault */
  restoreOpenTabs: () => Promise<void>;
}

const EDITOR_STORAGE_KEY = 'editor:viewMode';

/** Storage key for open tabs, scoped by vault ID */
function openTabsStorageKey(vaultId: string): string {
  return `editor:openTabs:${vaultId}`;
}

interface PersistedTabInfo {
  path: string;
  name: string;
}

interface PersistedOpenTabs {
  tabs: PersistedTabInfo[];
  activeTabPath: string | null;
}

/** Persist currently open tabs to storage (debounced) */
let persistTabsTimer: ReturnType<typeof setTimeout> | null = null;
function persistOpenTabs(vaultId: string, tabs: FileTab[], activeTabId: string | null) {
  if (persistTabsTimer) clearTimeout(persistTabsTimer);
  persistTabsTimer = setTimeout(() => {
    const data: PersistedOpenTabs = {
      tabs: tabs.map((t) => ({ path: t.path, name: t.name })),
      activeTabPath: tabs.find((t) => t.id === activeTabId)?.path ?? null,
    };
    storageClient.set(openTabsStorageKey(vaultId), data);
  }, 500);
}

export const useEditorStore = create<EditorState>()(
    (set, get) => ({
      viewMode: 'split',
      tabs: [],
      activeTabId: null,
      outlineVisible: false,
      aiPanelVisible: false,
      cursorLine: 1,
      cursorCol: 1,
      wordCount: 0,

      setViewMode: (mode) => {
        set({ viewMode: mode });
        storageClient.set(EDITOR_STORAGE_KEY, mode);
      },

      addTab: (tab) =>
        set((state) => ({
          tabs: [...state.tabs, tab],
          activeTabId: tab.id,
        })),

      closeTab: (tabId) => {
        set((state) => {
          const newTabs = state.tabs.filter((t) => t.id !== tabId);
          const newActiveId =
            state.activeTabId === tabId
              ? newTabs[newTabs.length - 1]?.id ?? null
              : state.activeTabId;
          return { tabs: newTabs, activeTabId: newActiveId };
        });
        const vaultId = useVaultStore.getState().activeVaultId;
        if (vaultId) persistOpenTabs(vaultId, get().tabs, get().activeTabId);
      },

      setActiveTab: (tabId) => {
        set({ activeTabId: tabId });
        const vaultId = useVaultStore.getState().activeVaultId;
        if (vaultId) persistOpenTabs(vaultId, get().tabs, tabId);
      },

      updateTabContent: (tabId, content) => {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId ? { ...t, content, isDirty: true } : t,
          ),
        }));

        // Debounced auto-save
        const existing = autoSaveTimers.get(tabId);
        if (existing) clearTimeout(existing);
        autoSaveTimers.set(
          tabId,
          setTimeout(() => {
            autoSaveTimers.delete(tabId);
            get().saveFile(tabId);
          }, AUTO_SAVE_DELAY_MS),
        );
      },

      markTabDirty: (tabId, isDirty) =>
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId ? { ...t, isDirty } : t,
          ),
        })),

      toggleOutline: () => set((state) => ({ outlineVisible: !state.outlineVisible })),
      toggleAiPanel: () => set((state) => ({ aiPanelVisible: !state.aiPanelVisible })),
      setCursorPosition: (line, col) => set({ cursorLine: line, cursorCol: col }),
      setWordCount: (count) => set({ wordCount: count }),

      openFile: async (filePath, name) => {
        // Include vault id in tab id to distinguish same-name files across vaults
        const vaultId = useVaultStore.getState().activeVaultId || '';
        const tabId = `${vaultId}:${filePath}`;

        const existing = get().tabs.find((t) => t.id === tabId);
        if (existing) {
          set({ activeTabId: existing.id });
          return;
        }
        try {
          const content = await useVaultStore.getState().readFile(filePath);
          const newTab: FileTab = {
            id: tabId,
            name,
            path: filePath,
            content,
            isDirty: false,
          };
          set((state) => ({
            tabs: [...state.tabs, newTab],
            activeTabId: newTab.id,
          }));
          persistOpenTabs(vaultId, get().tabs, get().activeTabId);
        } catch (err) {
          console.error('[EditorStore] openFile failed:', err);
        }
      },

      restoreOpenTabs: async () => {
        const vaultId = useVaultStore.getState().activeVaultId;
        if (!vaultId) return;
        const saved = await storageClient.get<PersistedOpenTabs>(openTabsStorageKey(vaultId));
        if (!saved || saved.tabs.length === 0) return;

        for (const tabInfo of saved.tabs) {
          const tabId = `${vaultId}:${tabInfo.path}`;
          const alreadyOpen = get().tabs.find((t) => t.id === tabId);
          if (alreadyOpen) continue;
          try {
            const content = await useVaultStore.getState().readFile(tabInfo.path);
            const newTab: FileTab = {
              id: tabId,
              name: tabInfo.name,
              path: tabInfo.path,
              content,
              isDirty: false,
            };
            set((state) => ({
              tabs: [...state.tabs, newTab],
            }));
          } catch {
            // File may have been deleted since last session, skip
          }
        }

        // Restore active tab
        if (saved.activeTabPath) {
          const activeId = `${vaultId}:${saved.activeTabPath}`;
          const exists = get().tabs.find((t) => t.id === activeId);
          if (exists) {
            set({ activeTabId: activeId });
          }
        } else if (get().tabs.length > 0 && !get().activeTabId) {
          set({ activeTabId: get().tabs[0].id });
        }
      },

      saveFile: async (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId);
        if (!tab) return;
        try {
          await useVaultStore.getState().writeFile(tab.path, tab.content);
          set((state) => ({
            tabs: state.tabs.map((t) =>
              t.id === tabId ? { ...t, isDirty: false } : t,
            ),
          }));
        } catch (err) {
          console.error('[EditorStore] saveFile failed:', err);
        }
      },
    }),
);

/** Load persisted viewMode from backend on startup */
storageClient.get<ViewMode>(EDITOR_STORAGE_KEY).then((saved) => {
  if (saved) {
    useEditorStore.setState({ viewMode: saved });
  }
});
