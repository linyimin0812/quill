import { useRef, useState, useCallback, useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useVaultStore } from '@/store/vaultStore';
import { QuillEditor, type QuillEditorHandle } from '@/editor/EditorView';
import { MarkdownPreview } from '../preview/MarkdownPreview';
import { SlashMenu } from '../editor/SlashMenu';
import { CodeBlockLangMenu } from '../editor/CodeBlockLangMenu';
import { ImagePasteDialog, type ImageSaveConfig } from '../editor/ImagePasteDialog';
import { hideSlashMenu, type SlashMenuState } from '@/editor/extensions/SlashCommandPlugin';
import { type CodeBlockMenuState } from '@/editor/extensions/CodeBlockExtension';
import { getStrategy, fileToBase64, convertImageFormat } from '@/utils/imageUploader';
import { getSidecarOrigin, isTauri } from '@/utils/platform';
import type { ContainerPlugin } from '@quill/container-plugins';
import { EditorView } from '@codemirror/view';

interface HeadingItem {
  level: number;
  text: string;
  line: number;
}

function extractHeadings(content: string): HeadingItem[] {
  const lines = content.split('\n');
  const headings: HeadingItem[] = [];
  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      headings.push({ level: match[1].length, text: match[2], line: index + 1 });
    }
  });
  return headings;
}

/** Insert text wrapping the current selection (e.g. **bold**) */
function wrapSelection(view: EditorView, before: string, after: string) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const replacement = `${before}${selected || '文本'}${after}`;
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: from + before.length, head: from + replacement.length - after.length },
  });
  view.focus();
}

/** Insert a line prefix (e.g. # heading) and place cursor after it */
function insertLinePrefix(view: EditorView, prefix: string) {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  view.dispatch({
    changes: { from: line.from, to: line.from, insert: prefix },
    selection: { anchor: line.from + prefix.length },
  });
  view.focus();
}

export function WorkArea() {
  const viewMode = useEditorStore((state) => state.viewMode);
  const activeTabId = useEditorStore((state) => state.activeTabId);
  const tabs = useEditorStore((state) => state.tabs);
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const closeTab = useEditorStore((state) => state.closeTab);
  const updateTabContent = useEditorStore((state) => state.updateTabContent);
  const markTabDirty = useEditorStore((state) => state.markTabDirty);
  const isFileLoading = useEditorStore((state) => state.isFileLoading);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const showLineNumbers = useSettingsStore((s) => s.showLineNumbers);
  const settingsTabSize = useSettingsStore((s) => s.tabSize);
  const wrapColumn = useSettingsStore((s) => s.wrapColumn);
  const editorFont = useSettingsStore((s) => s.editorFont);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);

  const [outlineVisible, setOutlineVisible] = useState(false);
  const [outlineWidth, setOutlineWidth] = useState(180);
  const outlineDragging = useRef(false);
  const prevBodyRef = useRef<HTMLDivElement>(null);

  const editorRef = useRef<QuillEditorHandle>(null);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState>({ visible: false, pos: 0, filter: '' });
  const [slashMenuPosition, setSlashMenuPosition] = useState({ top: 0, left: 0 });
  const [codeBlockMenu, setCodeBlockMenu] = useState<CodeBlockMenuState>({ visible: false, triggerPos: 0, blockStart: 0, filter: '', selectedIndex: 0 });
  const [codeBlockMenuPosition, setCodeBlockMenuPosition] = useState({ top: 0, left: 0 });

  // Image paste dialog state
  const [imagePasteVisible, setImagePasteVisible] = useState(false);
  const [imagePasteFile, setImagePasteFile] = useState<File | null>(null);
  const [imagePastePreviewUrl, setImagePastePreviewUrl] = useState('');
  const vaultRoot = useVaultStore((s) => s.currentVault?.basePath ?? '');

  // Web viewer: embedded Tauri Webview management
  const webViewerRef = useRef<HTMLDivElement>(null);
  const webviewInstances = useRef<Map<string, any>>(new Map());

  // Sync a webview's position/size to match the web-viewer-body container
  const syncWebviewPosition = useCallback(async (webview: any) => {
    const container = webViewerRef.current;
    if (!container || !webview) return;
    try {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/dpi');
      await webview.setPosition(new LogicalPosition(rect.left, rect.top));
      await webview.setSize(new LogicalSize(rect.width, rect.height));
    } catch {}
  }, []);

  // Create / destroy / show-hide embedded webviews based on active tab
  useEffect(() => {
    if (!isTauri()) return;
    const isWebTab = activeTab?.fileType === 'web';
    const tabId = activeTab?.id;
    const url = activeTab?.path;

    // Hide all webviews that are not the active one
    (async () => {
      try {
        const { LogicalPosition } = await import('@tauri-apps/api/dpi');
        for (const [id, wv] of webviewInstances.current.entries()) {
          if (id !== tabId) {
            try { await wv.setPosition(new LogicalPosition(-10000, -10000)); } catch {}
          }
        }
      } catch {}
    })();

    if (!isWebTab || !tabId || !url) return;

    const existing = webviewInstances.current.get(tabId);
    if (existing) {
      requestAnimationFrame(() => syncWebviewPosition(existing));
      return;
    }

    // Create new webview — delay to ensure the container is visible and has layout
    const createTimer = setTimeout(async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const { Webview } = await import('@tauri-apps/api/webview');
        const container = webViewerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const label = `wv-${Date.now()}`;
        const webview = new Webview(getCurrentWindow(), label, {
          url,
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
        webview.once('tauri://error', (e: any) => {
          console.error('[WorkArea] Webview creation error:', e);
        });
        webviewInstances.current.set(tabId, webview);
      } catch (error) {
        console.error('[WorkArea] Failed to create embedded webview:', error);
      }
    }, 150);

    return () => clearTimeout(createTimer);
  }, [activeTab?.id, activeTab?.fileType, activeTab?.path, syncWebviewPosition]);

  // ResizeObserver to keep webview in sync with container
  useEffect(() => {
    if (!isTauri()) return;
    const container = webViewerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (activeTab?.fileType !== 'web' || !activeTab?.id) return;
      const wv = webviewInstances.current.get(activeTab.id);
      if (wv) syncWebviewPosition(wv);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeTab?.id, activeTab?.fileType, syncWebviewPosition]);

  // Clean up webviews when tabs are closed
  useEffect(() => {
    const openTabIds = new Set(tabs.filter((t) => t.fileType === 'web').map((t) => t.id));
    for (const [id, wv] of webviewInstances.current.entries()) {
      if (!openTabIds.has(id)) {
        try { wv.close(); } catch {}
        webviewInstances.current.delete(id);
      }
    }
  }, [tabs]);

  // Clean up all webviews when WorkArea unmounts (e.g. switching to settings page)
  useEffect(() => {
    const instances = webviewInstances.current;
    return () => {
      for (const [, wv] of instances.entries()) {
        try { wv.close(); } catch {}
      }
      instances.clear();
    };
  }, []);

  // Pane resize (editor vs preview split ratio)
  const [editorFlex, setEditorFlex] = useState(1);
  const [previewFlex, setPreviewFlex] = useState(1);
  const splitDragging = useRef(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!splitDragging.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      const clamped = Math.max(0.2, Math.min(0.8, ratio));
      setEditorFlex(clamped);
      setPreviewFlex(1 - clamped);
    };
    const handleMouseUp = () => {
      if (splitDragging.current) {
        splitDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Outline resize
  useEffect(() => {
    const handleOutlineMove = (e: MouseEvent) => {
      if (!outlineDragging.current || !prevBodyRef.current) return;
      const container = prevBodyRef.current.closest('.pane-prev');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newWidth = Math.max(120, Math.min(400, rect.right - e.clientX));
      setOutlineWidth(newWidth);
    };
    const handleOutlineUp = () => {
      if (outlineDragging.current) {
        outlineDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    document.addEventListener('mousemove', handleOutlineMove);
    document.addEventListener('mouseup', handleOutlineUp);
    return () => {
      document.removeEventListener('mousemove', handleOutlineMove);
      document.removeEventListener('mouseup', handleOutlineUp);
    };
  }, []);

  const scrollToHeading = useCallback((headingText: string) => {
    // Scroll preview pane to the heading
    const container = prevBodyRef.current;
    if (container) {
      const headingId = headingText.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '');
      const target = container.querySelector(`#${CSS.escape(headingId)}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    // Scroll editor to the corresponding heading line
    const view = editorRef.current?.getView();
    if (!view) return;
    const doc = view.state.doc;
    for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
      const line = doc.line(lineNum);
      const headingMatch = line.text.match(/^(#{1,6})\s+(.*)/);
      if (headingMatch && headingMatch[2].trim() === headingText.trim()) {
        view.dispatch({
          effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
        });
        break;
      }
    }
  }, []);

  const getView = useCallback(() => editorRef.current?.getView() ?? null, []);

  const handleCodeBlockMenuChange = useCallback((state: CodeBlockMenuState) => {
    setCodeBlockMenu(state);
    if (state.visible) {
      // Defer position calculation to next frame to ensure view is fully updated
      requestAnimationFrame(() => {
        const view = getView();
        if (!view) return;
        try {
          const pos = view.state.selection.main.head;
          const safePos = Math.min(pos, view.state.doc.length);
          const coords = view.coordsAtPos(safePos);
          if (coords) {
            setCodeBlockMenuPosition({ top: coords.bottom + 4, left: coords.left });
          }
        } catch {
          // Position may be invalid during rapid edits, ignore
        }
      });
    }
  }, [getView]);

  const handleSlashMenuChange = useCallback((state: SlashMenuState) => {
    setSlashMenu(state);
    if (state.visible) {
      const view = getView();
      if (view) {
        const coords = view.coordsAtPos(state.pos);
        if (coords) {
          setSlashMenuPosition({ top: coords.bottom + 4, left: coords.left });
        }
      }
    }
  }, [getView]);

  const handleSlashSelect = useCallback((plugin: ContainerPlugin) => {
    const view = getView();
    if (!view) return;

    const menuState = slashMenu;
    const line = view.state.doc.lineAt(menuState.pos);
    const slashStart = line.from;

    view.dispatch({
      changes: { from: slashStart, to: menuState.pos, insert: plugin.template },
    });
    hideSlashMenu(view);
    view.focus();
  }, [getView, slashMenu]);

  const handleSlashClose = useCallback(() => {
    const view = getView();
    if (view) hideSlashMenu(view);
  }, [getView]);

  // Toolbar actions
  const toolbarAction = useCallback((action: string) => {
    const view = getView();
    if (!view) return;

    switch (action) {
      case 'h1': insertLinePrefix(view, '# '); break;
      case 'h2': insertLinePrefix(view, '## '); break;
      case 'h3': insertLinePrefix(view, '### '); break;
      case 'bold': wrapSelection(view, '**', '**'); break;
      case 'italic': wrapSelection(view, '*', '*'); break;
      case 'strike': wrapSelection(view, '~~', '~~'); break;
      case 'link': wrapSelection(view, '[', '](url)'); break;
      case 'image': insertLinePrefix(view, '![alt](url)'); break;
      case 'code': wrapSelection(view, '`', '`'); break;
      case 'quote': insertLinePrefix(view, '> '); break;
      case 'ul': insertLinePrefix(view, '- '); break;
      case 'ol': insertLinePrefix(view, '1. '); break;
      case 'task': insertLinePrefix(view, '- [ ] '); break;
      case 'hr': {
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);
        view.dispatch({
          changes: { from: line.from, to: line.from, insert: '---\n' },
          selection: { anchor: line.from + 4 },
        });
        view.focus();
        break;
      }
      case 'codeblock': {
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);
        const block = '```\n\n```';
        view.dispatch({
          changes: { from: line.from, to: line.to, insert: block },
          selection: { anchor: line.from + 4 },
        });
        view.focus();
        break;
      }
      case 'table': {
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);
        const table = '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |';
        view.dispatch({
          changes: { from: line.from, to: line.to, insert: table },
          selection: { anchor: line.from + 2 },
        });
        view.focus();
        break;
      }
    }
  }, [getView]);

  return (
    <div className="work-area" ref={splitContainerRef}>
      {/* File tabs — always visible as a standalone bar */}
      {tabs.length > 0 && (
        <div className="file-tabs">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`ftab ${activeTabId === tab.id ? 'on' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.isDirty && <span className="ftab-dot" />}
              {tab.fileType === 'web' && <span className="ftab-icon">🌐</span>}
              <span className="ftab-name">{tab.name}</span>
              <span
                className="ftab-x"
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                ✕
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Content area: editor + resizer + preview / image viewer */}
      <div className="work-area-content">

      {/* Editor pane */}
      {activeTab?.fileType !== 'image' && activeTab?.fileType !== 'web' && (activeTab?.fileType === 'code' || viewMode === 'split' || viewMode === 'edit') && (
        <div className="pane-src" style={activeTab?.fileType === 'text' && viewMode === 'split' ? { flex: editorFlex } : undefined}>
          {/* Markdown toolbar — only for markdown files */}
          {activeTab?.fileType === 'text' && (
          <div className="ed-tb">
            <button className="etb-btn" onClick={() => toolbarAction('h1')} data-tip="一级标题">H1</button>
            <button className="etb-btn" onClick={() => toolbarAction('h2')} data-tip="二级标题">H2</button>
            <button className="etb-btn" onClick={() => toolbarAction('h3')} data-tip="三级标题">H3</button>
            <span className="etb-div" />
            <button className="etb-btn" onClick={() => toolbarAction('bold')} data-tip="加粗"><b>B</b></button>
            <button className="etb-btn" onClick={() => toolbarAction('italic')} data-tip="斜体"><i>I</i></button>
            <button className="etb-btn" onClick={() => toolbarAction('strike')} data-tip="删除线"><s>S</s></button>
            <span className="etb-div" />
            <button className="etb-btn" onClick={() => toolbarAction('quote')} data-tip="引用">❝</button>
            <button className="etb-btn" onClick={() => toolbarAction('ul')} data-tip="无序列表">⁃</button>
            <button className="etb-btn" onClick={() => toolbarAction('ol')} data-tip="有序列表">1.</button>
            <button className="etb-btn etb-icon" onClick={() => toolbarAction('task')} data-tip="任务列表">☑</button>
            <span className="etb-div" />
            <button className="etb-btn" onClick={() => toolbarAction('link')} data-tip="链接">🔗</button>
            <button className="etb-btn" onClick={() => toolbarAction('image')} data-tip="图片">🖼</button>
            <button className="etb-btn" onClick={() => toolbarAction('code')} data-tip="行内代码">{'</>'}</button>
            <button className="etb-btn" onClick={() => toolbarAction('codeblock')} data-tip="代码块">{'{ }'}</button>
            <button className="etb-btn etb-icon" onClick={() => toolbarAction('table')} data-tip="表格">▦</button>
            <button className="etb-btn" onClick={() => toolbarAction('hr')} data-tip="分割线">―</button>
          </div>
          )}
          <div className="ed-body">
            {isFileLoading && (
              <div className="ed-loading-overlay">
                <span className="ft-spinner" /> 加载文件中…
              </div>
            )}
            <QuillEditor
              key={`${activeTabId}-${showLineNumbers}-${settingsTabSize}-${wrapColumn}-${editorFont}-${editorFontSize}`}
              ref={editorRef}
              filePath={activeTab?.path ?? ''}
              initialContent={activeTab?.content ?? ''}
              onChange={(content) => {
                if (activeTab) updateTabContent(activeTab.id, content);
              }}
              onSave={() => {
                if (activeTab) markTabDirty(activeTab.id, false);
              }}
              onSlashMenuChange={handleSlashMenuChange}
              onCodeBlockMenuChange={handleCodeBlockMenuChange}
              onImagePaste={(file, previewUrl) => {
                setImagePasteFile(file);
                setImagePastePreviewUrl(previewUrl);
                setImagePasteVisible(true);
              }}
            />
            {/* Slash command menu */}
            <SlashMenu
              visible={slashMenu.visible}
              filter={slashMenu.filter}
              position={slashMenuPosition}
              onSelect={handleSlashSelect}
              onClose={handleSlashClose}
            />
            {/* Code block language picker */}
            <CodeBlockLangMenu
              visible={codeBlockMenu.visible}
              menuState={codeBlockMenu}
              position={codeBlockMenuPosition}
              getView={getView}
            />
            {/* Image paste dialog */}
            <ImagePasteDialog
              visible={imagePasteVisible}
              previewUrl={imagePastePreviewUrl}
              currentFilePath={activeTab?.path ?? ''}
              vaultRoot={vaultRoot}
              onConfirm={async (config: ImageSaveConfig) => {
                if (!imagePasteFile) return;
                try {
                  const strategy = getStrategy(config.target);
                  const originalFormat = imagePasteFile.type.split('/')[1] as string;
                  const needsConversion = config.format !== originalFormat;
                  const base64 = needsConversion
                    ? await convertImageFormat(imagePasteFile, config.format)
                    : await fileToBase64(imagePasteFile);
                  const result = await strategy.upload(base64, config, vaultRoot);
                  // Insert markdown image at cursor
                  const view = editorRef.current?.getView();
                  if (view) {
                    const pos = view.state.selection.main.head;
                    const hasCustomSize = config.width || config.height;
                    const encodedUrl = result.markdownUrl.split('/').map(encodeURIComponent).join('/');
                    const imageMarkdown = hasCustomSize
                      ? `<img src="${encodedUrl}" alt="${config.fileName}"${config.width ? ` width="${config.width}"` : ''}${config.height ? ` height="${config.height}"` : ''} />`
                      : `![${config.fileName}](${encodedUrl})`;
                    view.dispatch({
                      changes: { from: pos, to: pos, insert: imageMarkdown },
                      selection: { anchor: pos + imageMarkdown.length },
                    });
                    view.focus();
                  }
                } catch (error) {
                  console.error('[ImageUpload] Failed:', error);
                } finally {
                  URL.revokeObjectURL(imagePastePreviewUrl);
                  setImagePasteVisible(false);
                  setImagePasteFile(null);
                  setImagePastePreviewUrl('');
                }
              }}
              onCancel={() => {
                URL.revokeObjectURL(imagePastePreviewUrl);
                setImagePasteVisible(false);
                setImagePasteFile(null);
                setImagePastePreviewUrl('');
              }}
            />
          </div>
        </div>
      )}

      {/* Split resizer — only for markdown files */}
      {activeTab?.fileType === 'text' && viewMode === 'split' && (
        <div
          className="split-resizer"
          onMouseDown={() => {
            splitDragging.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
        />
      )}

      {/* Image viewer — full area when active tab is an image */}
      {activeTab?.fileType === 'image' && (
        <div className="image-viewer">
          <div className="image-viewer-inner">
            <img
              src={(() => {
                const imagePath = activeTab.path;
                const apiBase = getSidecarOrigin();
                let url = `${apiBase}/quill/api/vault/image?path=${encodeURIComponent(imagePath)}`;
                if (vaultRoot) url += `&root=${encodeURIComponent(vaultRoot)}`;
                return url;
              })()}
              alt={activeTab.name}
            />
            <div className="image-viewer-info">
              <span>📄 {activeTab.path}</span>
            </div>
          </div>
        </div>
      )}


      {/* Web viewer — embedded Tauri Webview placeholder */}
      <div
        className="web-viewer-container"
        style={{ display: activeTab?.fileType === 'web' ? 'flex' : 'none' }}
      >
        <div className="web-viewer-bar">
          <span className="web-viewer-url" title={activeTab?.path}>🌐 {activeTab?.fileType === 'web' ? activeTab.path : ''}</span>
          <button
            className="web-viewer-open-btn"
            title="在外部浏览器打开"
            onClick={() => {
              if (!activeTab?.path) return;
              if (isTauri()) {
                import('@tauri-apps/plugin-shell').then(({ open }) => {
                  open(activeTab.path);
                });
              } else {
                window.open(activeTab.path, '_blank', 'noopener,noreferrer');
              }
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4" />
              <path d="M9 2h5v5" />
              <line x1="14" y1="2" x2="7" y2="9" />
            </svg>
          </button>
        </div>
        <div ref={webViewerRef} className="web-viewer-body" />
      </div>

      {/* Preview pane — only for markdown files */}
      {activeTab?.fileType === 'text' && (viewMode === 'split' || viewMode === 'preview') && (
        <div className="pane-prev" style={{ ...(viewMode === 'split' ? { flex: previewFlex } : {}), position: 'relative' }}>
          <div className="prev-outline-toggle">
            <button
              className={`prev-outline-btn ${outlineVisible ? 'on' : ''}`}
              onClick={() => setOutlineVisible((v) => !v)}
              title="大纲"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                <line x1="2" y1="3.5" x2="14" y2="3.5" />
                <line x1="4" y1="6.5" x2="14" y2="6.5" />
                <line x1="4" y1="9.5" x2="14" y2="9.5" />
                <line x1="2" y1="12.5" x2="14" y2="12.5" />
              </svg>
            </button>
          </div>
          <div className="prev-content-row">
            <div className="prev-body" ref={prevBodyRef}>
              <MarkdownPreview content={activeTab?.content ?? ''} currentFilePath={activeTab?.path ?? ''} vaultRoot={vaultRoot} />
            </div>
            {outlineVisible && (
              <div className="prev-outline" style={{ width: `${outlineWidth}px` }}>
                <div
                  className="prev-outline-resizer"
                  onMouseDown={() => {
                    outlineDragging.current = true;
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';
                  }}
                />
                <div className="prev-outline-header">大纲</div>
                <div className="prev-outline-body">
                  {(() => {
                    const headings = extractHeadings(activeTab?.content ?? '');
                    if (headings.length === 0) {
                      return <p className="prev-outline-empty">暂无标题</p>;
                    }
                    return headings.map((heading, index) => (
                      <div
                        key={index}
                        className="prev-outline-item"
                        style={{ paddingLeft: `${8 + (heading.level - 1) * 12}px` }}
                        title={`Ln ${heading.line}`}
                        onClick={() => scrollToHeading(heading.text)}
                      >
                        {heading.text}
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      </div>{/* end .work-area-content */}
    </div>
  );
}
