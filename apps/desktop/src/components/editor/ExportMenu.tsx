import { useState, useRef, useEffect, useCallback } from 'react';
import { useExport, hasContainerSyntax } from '@/hooks/useExport';

export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const [containerWarning, setContainerWarning] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { exportMarkdown, exportHtml, exportPdf, getActiveContent } = useExport();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleExportMarkdown = useCallback(() => {
    const { content } = getActiveContent();
    if (hasContainerSyntax(content)) {
      setContainerWarning(true);
      setOpen(false);
    } else {
      exportMarkdown();
      setOpen(false);
    }
  }, [getActiveContent, exportMarkdown]);

  const confirmExportMarkdown = useCallback(() => {
    exportMarkdown();
    setContainerWarning(false);
  }, [exportMarkdown]);

  return (
    <>
      <div className="export-wrap" ref={menuRef}>
        <button className="tb-btn" onClick={() => setOpen(!open)} title="导出">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M8 2v8" /><path d="M4.5 5.5L8 2l3.5 3.5" />
            <path d="M2.5 10v2.5a1 1 0 001 1h9a1 1 0 001-1V10" />
          </svg>
        </button>
        {open && (
          <div className="export-menu">
            <div className="export-item" onClick={handleExportMarkdown}>
              <span className="export-icon">📝</span>
              <div className="export-info">
                <span className="export-label">Markdown</span>
                <span className="export-desc">导出 .md 源文件</span>
              </div>
            </div>
            <div
              className="export-item"
              onClick={() => { exportHtml(); setOpen(false); }}
            >
              <span className="export-icon">🌐</span>
              <div className="export-info">
                <span className="export-label">HTML</span>
                <span className="export-desc">导出为渲染后的网页</span>
              </div>
            </div>
            <div
              className="export-item"
              onClick={() => { exportPdf(); setOpen(false); }}
            >
              <span className="export-icon">📄</span>
              <div className="export-info">
                <span className="export-label">PDF</span>
                <span className="export-desc">通过打印对话框导出</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Container syntax warning dialog */}
      {containerWarning && (
        <div className="dlg-overlay" onClick={() => setContainerWarning(false)}>
          <div className="dlg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="dlg-hd">
              <h3>⚠️ 兼容性提示</h3>
              <button className="dlg-close" onClick={() => setContainerWarning(false)}>✕</button>
            </div>
            <div className="dlg-body">
              <p style={{ margin: '8px 0', lineHeight: 1.7 }}>
                当前文档使用了 Quill 容器语法（如提示框、标签页、折叠面板等），
                这些语法是 Quill 的扩展功能，<strong>在其他 Markdown 编辑器中打开预览可能无法正常渲染</strong>。
              </p>
              <p style={{ margin: '8px 0', lineHeight: 1.7, fontSize: 13, color: 'var(--t3)' }}>
                如需在其他编辑器中查看，建议导出为 HTML 格式。
              </p>
            </div>
            <div className="dlg-ft">
              <button className="btn btn-g btn-sm" onClick={() => setContainerWarning(false)}>取消</button>
              <button className="btn btn-p btn-sm" onClick={confirmExportMarkdown}>仍然导出</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
