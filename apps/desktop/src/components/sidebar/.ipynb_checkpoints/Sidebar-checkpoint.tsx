import { useState, useCallback, useRef, useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useEditorStore } from '@/store/editorStore';
import { useVaultStore } from '@/store/vaultStore';
import type { VaultEntry } from '@quill/vault-provider';

const MIN_WIDTH = 160;
const MAX_WIDTH = 380;
const DEFAULT_WIDTH = 224;

export function Sidebar(): React.JSX.Element {
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

  const handleFileClick = useCallback(
    (filePath: string, fileName: string) => {
      openFile(filePath, fileName);
    },
    [openFile],
  );

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

  const deleteItem = useCallback(async (itemPath: string, itemType: 'file' | 'dir') => {
    if (itemType === 'dir') {
      await vaultDeleteDir(itemPath);
    } else {
      await vaultDeleteFile(itemPath);
    }
    const parentDir = itemPath.includes('/') ? itemPath.substring(0, itemPath.lastIndexOf('/')) : '';
    if (parentDir) {
      await loadSubEntries(parentDir);
    }
  }, [vaultDeleteFile, vaultDeleteDir, loadSubEntries]);

  // Drag resize
  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, event.clientX));
      setWidth(newWidth);
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
      <aside className="sidebar" style={{ width: `${width}px` }}>
        {/* Vault selector */}
        <div className="sb-header">
          <div className="vault-sel" onClick={() => setCurrentPage('vault')}>
            <span className="vs-icon">📁</span>
            <span className="vs-name">{vaultName}</span>
            <span className="vs-arrow">▾</span>
          </div>

          {/* Actions: new file / new folder */}
          <div className="sb-actions">
            <button className="sb-action-btn" onClick={() => startNewItem('file')} title="新建文件">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 1.1l3.4 3.5.1.4v2h-1V6H8.5L8 5.5V2H3.5l-.5.5v11l.5.5H7v1H3.5l-1.5-1.5v-11l1.5-1.5h5.7l.3.1zM9 2v3h2.9L9 2zm4 12h-1v-3H9v-1h3V7h1v3h3v1h-3v3z"/></svg>
            </button>
            <button className="sb-action-btn" onClick={() => startNewItem('dir')} title="新建文件夹">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14 4H9.618l-1-2H2a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1zm0 9H2V3h6.382l1 2H14v8zM8 7v2H6v1h2v2h1V10h2V9H9V7H8z"/></svg>
            </button>
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
        <div className="sb-body">{renderFileTree(fileTree)}</div>

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
      </aside>

      {/* Resize handle */}
      <div className="resizer" onMouseDown={handleMouseDown} />
    </>
  );
}
