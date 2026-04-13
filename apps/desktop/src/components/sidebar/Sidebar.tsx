import { useState, useCallback, useRef, useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useEditorStore } from '@/store/editorStore';
import { useVaultStore } from '@/store/vaultStore';
import type { VaultEntry } from '@quill/vault-provider';

const MIN_WIDTH = 160;
const MAX_WIDTH = 380;
const DEFAULT_WIDTH = 224;
const COLLAPSE_THRESHOLD = 100;

interface SidebarProps {
  onFileSelect?: () => void;
}

export function Sidebar({ onFileSelect }: SidebarProps): React.JSX.Element {
  const vaultName = useSettingsStore((state) => state.vaultName);
  const setCurrentPage = useSettingsStore((state) => state.setCurrentPage);
  const activeTabId = useEditorStore((state) => state.activeTabId);
  const openFile = useEditorStore((state) => state.openFile);
  const tabs = useEditorStore((state) => state.tabs);

  const fileTree = useVaultStore((state) => state.fileTree);
  const vaultCreateFile = useVaultStore((state) => state.createFile);
  const vaultCreateDir = useVaultStore((state) => state.createDir);
  const vaultDeleteFile = useVaultStore((state) => state.deleteFile);
  const vaultDeleteDir = useVaultStore((state) => state.deleteDir);
  const vaultRenameFile = useVaultStore((state) => state.renameFile);

  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [newItemType, setNewItemType] = useState<'file' | 'dir' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemParent, setNewItemParent] = useState<string | null>(null);
  const [renamingItem, setRenamingItem] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const newItemInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const isDragging = useRef(false);

  // Load sub-directory contents when expanding a folder
  const [subEntries, setSubEntries] = useState<Record<string, VaultEntry[]>>({});

  const loadSubEntries = useCallback(async (dirPath: string) => {
    try {
      const entries = await useVaultStore.getState().manager.listFiles(dirPath);
      setSubEntries((prev) => ({ ...prev, [dirPath]: entries }));
    } catch (err) {
      console.error('[Sidebar] loadSubEntries failed:', err);
    }
  }, []);

  const fileTreeRef = useRef<HTMLDivElement>(null);

  const handleFileClick = useCallback(
    (filePath: string, fileName: string) => {
      openFile(filePath, fileName);
      onFileSelect?.();
    },
    [openFile, onFileSelect],
  );

  /** Expand all parent directories of the active file and scroll it into view */
  const locateActiveFile = useCallback(async () => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab) return;

    const filePath = activeTab.path;
    // Expand all parent directories
    const parts = filePath.split('/');
    const dirsToExpand: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      dirsToExpand.push(parts.slice(0, i).join('/'));
    }

    // Expand directories and load sub-entries
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      for (const dir of dirsToExpand) next.add(dir);
      return next;
    });
    for (const dir of dirsToExpand) {
      await loadSubEntries(dir);
    }

    // Scroll to the file element after DOM update
    requestAnimationFrame(() => {
      const container = fileTreeRef.current;
      if (!container) return;
      const fileElement = container.querySelector(`[data-filepath="${CSS.escape(filePath)}"]`);
      if (fileElement) {
        fileElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }, [activeTabId, tabs, loadSubEntries]);

  const startNewItem = useCallback((type: 'file' | 'dir', parentDir?: string) => {
    setNewItemType(type);
    setNewItemName('');
    setNewItemParent(parentDir ?? null);
    if (parentDir) {
      setExpandedDirs((prev) => new Set([...prev, parentDir]));
    }
    setTimeout(() => newItemInputRef.current?.focus(), 50);
  }, []);

  const confirmNewItem = useCallback(async () => {
    const trimmedName = newItemName.trim();
    if (!trimmedName || !newItemType) {
      setNewItemType(null);
      setNewItemName('');
      setNewItemParent(null);
      return;
    }

    const finalName = newItemType === 'file' && !trimmedName.includes('.')
      ? `${trimmedName}.md`
      : trimmedName;

    const fullPath = newItemParent ? `${newItemParent}/${finalName}` : finalName;

    if (newItemType === 'dir') {
      await vaultCreateDir(fullPath);
    } else {
      await vaultCreateFile(fullPath, `# ${finalName}\n`);
    }

    setNewItemType(null);
    setNewItemName('');
    setNewItemParent(null);

    if (newItemType === 'file') {
      handleFileClick(fullPath, finalName);
    } else {
      setExpandedDirs((prev) => new Set([...prev, fullPath]));
    }

    // Reload sub-entries for parent
    if (newItemParent) {
      await loadSubEntries(newItemParent);
    }
  }, [newItemName, newItemType, newItemParent, handleFileClick, vaultCreateFile, vaultCreateDir, loadSubEntries]);

  const cancelNewItem = useCallback(() => {
    setNewItemType(null);
    setNewItemName('');
    setNewItemParent(null);
  }, []);

  const startRename = useCallback((itemPath: string, itemName: string) => {
    setRenamingItem(itemPath);
    setRenameValue(itemName);
    setTimeout(() => renameInputRef.current?.focus(), 50);
  }, []);

  const confirmRename = useCallback(async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || !renamingItem) {
      setRenamingItem(null);
      setRenameValue('');
      return;
    }
    const oldPath = renamingItem;
    const parentDir = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : '';
    const newPath = parentDir ? `${parentDir}/${trimmed}` : trimmed;

    if (newPath !== oldPath) {
      await vaultRenameFile(oldPath, newPath);
      if (parentDir) {
        await loadSubEntries(parentDir);
      }
    }
    setRenamingItem(null);
    setRenameValue('');
  }, [renameValue, renamingItem, vaultRenameFile, loadSubEntries]);

  const closeTab = useEditorStore((state) => state.closeTab);

  const [deleteConfirm, setDeleteConfirm] = useState<{ path: string; type: 'file' | 'dir'; name: string } | null>(null);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    const { path: itemPath, type: itemType } = deleteConfirm;
    if (itemType === 'dir') {
      const openTabs = useEditorStore.getState().tabs;
      for (const tab of openTabs) {
        if (tab.path === itemPath || tab.path.startsWith(itemPath + '/')) {
          closeTab(tab.id);
        }
      }
      await vaultDeleteDir(itemPath);
    } else {
      const openTabs = useEditorStore.getState().tabs;
      const matchingTab = openTabs.find((t) => t.path === itemPath);
      if (matchingTab) {
        closeTab(matchingTab.id);
      }
      await vaultDeleteFile(itemPath);
    }
    const parentDir = itemPath.includes('/') ? itemPath.substring(0, itemPath.lastIndexOf('/')) : '';
    if (parentDir) {
      await loadSubEntries(parentDir);
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, vaultDeleteFile, vaultDeleteDir, loadSubEntries, closeTab]);

  const deleteItem = useCallback((itemPath: string, itemType: 'file' | 'dir') => {
    const itemName = itemPath.includes('/') ? itemPath.substring(itemPath.lastIndexOf('/') + 1) : itemPath;
    setDeleteConfirm({ path: itemPath, type: itemType, name: itemName });
  }, []);

  // Drag resize
  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging.current) return;
      if (event.clientX < COLLAPSE_THRESHOLD) {
        setCollapsed(true);
      } else {
        setCollapsed(false);
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, event.clientX));
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleToggleDir = useCallback(async (dirPath: string) => {
    const isExpanded = expandedDirs.has(dirPath);
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (isExpanded) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
    if (!isExpanded) {
      await loadSubEntries(dirPath);
    }
  }, [expandedDirs, loadSubEntries]);

  const renderFileTree = (items: VaultEntry[], depth = 0) => {
    return items
      .filter((item) =>
        searchQuery ? item.name.toLowerCase().includes(searchQuery.toLowerCase()) : true,
      )
      .map((item) => {
        const isRenaming = renamingItem === item.path;

        if (item.type === 'dir') {
          const isExpanded = expandedDirs.has(item.path);
          const children = subEntries[item.path] || [];
          return (
            <div key={item.path}>
              <div
                className="ft-item ft-dir"
                style={{ paddingLeft: `${12 + depth * 14}px` }}
                onClick={() => handleToggleDir(item.path)}
              >
                <span className="ft-icon">{isExpanded ? '▾' : '▸'}</span>
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    className="ft-rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmRename();
                      if (e.key === 'Escape') { setRenamingItem(null); setRenameValue(''); }
                    }}
                    onBlur={confirmRename}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="ft-name">{item.name}</span>
                )}
                <div className="ft-actions">
                  <button className="ft-act-btn" title="新建文件" onClick={(e) => { e.stopPropagation(); startNewItem('file', item.path); }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 1.1l3.4 3.5.1.4v2h-1V6H8.5L8 5.5V2H3.5l-.5.5v11l.5.5H7v1H3.5l-1.5-1.5v-11l1.5-1.5h5.7l.3.1zM9 2v3h2.9L9 2zm4 12h-1v-3H9v-1h3V7h1v3h3v1h-3v3z"/></svg>
                  </button>
                  <button className="ft-act-btn" title="新建文件夹" onClick={(e) => { e.stopPropagation(); startNewItem('dir', item.path); }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M14 4H9.618l-1-2H2a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1zm0 9H2V3h6.382l1 2H14v8zM8 7v2H6v1h2v2h1V10h2V9H9V7H8z"/></svg>
                  </button>
                  <button className="ft-act-btn" title="重命名" onClick={(e) => { e.stopPropagation(); startRename(item.path, item.name); }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zm3.83-2.06L4.47 9.76l8-8 1.77 1.77-8 8z"/></svg>
                  </button>
                  <button className="ft-act-btn" title="删除" onClick={(e) => { e.stopPropagation(); deleteItem(item.path, 'dir'); }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M10 3h3v1h-1v9l-1 1H5l-1-1V4H3V3h3V2a1 1 0 011-1h2a1 1 0 011 1v1zM9 2H7v1h2V2zM5 4v9h6V4H5zm2 2h1v5H7V6zm2 0h1v5H9V6z"/></svg>
                  </button>
                </div>
              </div>
              {isExpanded && newItemType && newItemParent === item.path && (
                <div className="ft-item" style={{ paddingLeft: `${12 + (depth + 1) * 14}px` }}>
                  <span className="ft-icon">{newItemType === 'dir' ? '📁' : '📄'}</span>
                  <input
                    ref={newItemInputRef}
                    className="ft-rename-input"
                    placeholder={newItemType === 'dir' ? '文件夹名称' : '文件名称'}
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmNewItem();
                      if (e.key === 'Escape') cancelNewItem();
                    }}
                    onBlur={confirmNewItem}
                  />
                </div>
              )}
              {isExpanded && renderFileTree(children, depth + 1)}
            </div>
          );
        }

        const isActive = tabs.find((t) => t.path === item.path)?.id === activeTabId;
        return (
          <div
            key={item.path}
            data-filepath={item.path}
            className={`ft-item ft-file ${isActive ? 'on' : ''}`}
            style={{ paddingLeft: `${12 + depth * 14}px` }}
            onClick={() => !isRenaming && handleFileClick(item.path, item.name)}
          >
            <span className="ft-icon">📄</span>
            {isRenaming ? (
              <input
                ref={renameInputRef}
                className="ft-rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmRename();
                  if (e.key === 'Escape') { setRenamingItem(null); setRenameValue(''); }
                }}
                onBlur={confirmRename}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="ft-name">{item.name}</span>
            )}
            <div className="ft-actions">
              <button className="ft-act-btn" title="重命名" onClick={(e) => { e.stopPropagation(); startRename(item.path, item.name); }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zm3.83-2.06L4.47 9.76l8-8 1.77 1.77-8 8z"/></svg>
              </button>
              <button className="ft-act-btn" title="删除" onClick={(e) => { e.stopPropagation(); deleteItem(item.path, 'file'); }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M10 3h3v1h-1v9l-1 1H5l-1-1V4H3V3h3V2a1 1 0 011-1h2a1 1 0 011 1v1zM9 2H7v1h2V2zM5 4v9h6V4H5zm2 2h1v5H7V6zm2 0h1v5H9V6z"/></svg>
              </button>
            </div>
          </div>
        );
      });
  };

  return (
    <>
      {collapsed && (
        <div className="sidebar-collapsed">
          <button className="sb-expand-btn" onClick={() => setCollapsed(false)} title="展开文件栏">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="6,3 11,8 6,13" />
            </svg>
          </button>
        </div>
      )}
      <aside className="sidebar" style={{ width: collapsed ? '0px' : `${width}px`, display: collapsed ? 'none' : undefined }}>
        {/* Vault selector */}
        <div className="sb-header">
          <div className="sb-header-row">
          <div className="vault-sel" onClick={() => setCurrentPage('vault')}>
            <span className="vs-icon">📁</span>
            <span className="vs-name">{vaultName}</span>
            <span className="vs-arrow">▾</span>
          </div>

          {/* Actions: new file / new folder / locate */}
          <div className="sb-actions">
            <button className="sb-action-btn" onClick={() => startNewItem('file')} title="新建文件">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 1.1l3.4 3.5.1.4v2h-1V6H8.5L8 5.5V2H3.5l-.5.5v11l.5.5H7v1H3.5l-1.5-1.5v-11l1.5-1.5h5.7l.3.1zM9 2v3h2.9L9 2zm4 12h-1v-3H9v-1h3V7h1v3h3v1h-3v3z"/></svg>
            </button>
            <button className="sb-action-btn" onClick={() => startNewItem('dir')} title="新建文件夹">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14 4H9.618l-1-2H2a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1zm0 9H2V3h6.382l1 2H14v8zM8 7v2H6v1h2v2h1V10h2V9H9V7H8z"/></svg>
            </button>
            <button className="sb-action-btn" onClick={locateActiveFile} title="定位当前文件">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="8" cy="8" r="6.5"/><line x1="8" y1="1.5" x2="8" y2="6.5"/><line x1="8" y1="9.5" x2="8" y2="14.5"/><line x1="1.5" y1="8" x2="6.5" y2="8"/><line x1="9.5" y1="8" x2="14.5" y2="8"/></svg>
            </button>
          </div>
          </div>

          {/* Search */}
          <div className="sb-search-wrap">
            <input
              className="sb-search"
              placeholder="搜索文件..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>

        {/* New item inline input (root level only) */}
        {newItemType && !newItemParent && (
          <div className="ft-item" style={{ paddingLeft: '12px' }}>
            <span className="ft-icon">{newItemType === 'dir' ? '📁' : '📄'}</span>
            <input
              ref={newItemInputRef}
              className="ft-rename-input"
              placeholder={newItemType === 'dir' ? '文件夹名称' : '文件名称（默认 .md）'}
              value={newItemName}
              onChange={(event) => setNewItemName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') confirmNewItem();
                if (event.key === 'Escape') cancelNewItem();
              }}
              onBlur={confirmNewItem}
            />
          </div>
        )}

        {/* File tree */}
        <div className="sb-body" ref={fileTreeRef}>{renderFileTree(fileTree)}</div>

        {/* Settings button at bottom */}
        <div className="sb-footer">
          <button className="sb-settings-btn" onClick={() => setCurrentPage('settings')} title="设置">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="2" y1="4" x2="14" y2="4" />
              <line x1="2" y1="8" x2="14" y2="8" />
              <line x1="2" y1="12" x2="14" y2="12" />
              <circle cx="5" cy="4" r="1.5" fill="var(--panel)" />
              <circle cx="9" cy="8" r="1.5" fill="var(--panel)" />
              <circle cx="6" cy="12" r="1.5" fill="var(--panel)" />
            </svg>
            设置
          </button>
        </div>

        {/* Delete confirmation dialog */}
        {deleteConfirm && (
          <div className="delete-confirm-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="delete-confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="delete-confirm-title">确认删除</div>
              <div className="delete-confirm-msg">
                确定要删除{deleteConfirm.type === 'dir' ? '文件夹' : '文件'} <strong>{deleteConfirm.name}</strong> 吗？
                {deleteConfirm.type === 'dir' && <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: 'var(--t3, #71717a)' }}>文件夹内的所有内容也将被删除</span>}
              </div>
              <div className="delete-confirm-actions">
                <button className="delete-confirm-btn cancel" onClick={() => setDeleteConfirm(null)}>取消</button>
                <button className="delete-confirm-btn danger" onClick={confirmDelete}>删除</button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Resize handle */}
      <div className="resizer" onMouseDown={handleMouseDown} />
    </>
  );
}
