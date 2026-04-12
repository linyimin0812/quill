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
}

const EDITOR_STORAGE_KEY = 'editor:viewMode';

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

      closeTab: (tabId) =>
        set((state) => {
          const newTabs = state.tabs.filter((t) => t.id !== tabId);
          const newActiveId =
            state.activeTabId === tabId
              ? newTabs[newTabs.length - 1]?.id ?? null
              : state.activeTabId;
          return { tabs: newTabs, activeTabId: newActiveId };
        }),

      setActiveTab: (tabId) => set({ activeTabId: tabId }),

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
        } catch (err) {
          console.error('[EditorStore] openFile failed:', err);
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
