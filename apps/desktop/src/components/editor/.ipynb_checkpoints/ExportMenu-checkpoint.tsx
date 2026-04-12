import { useState, useRef, useEffect } from 'react';
import { useExport } from '../../hooks/useExport';

export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { exportMarkdown, exportHtml, exportPdf } = useExport();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="export-wrap" ref={menuRef}>
      <button className="tb-btn" onClick={() => setOpen(!open)} title="导出">
        ⬇
      </button>
      {open && (
        <div className="export-menu">
          <div
            className="export-item"
            onClick={() => { exportMarkdown(); setOpen(false); }}
          >
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
              <span className="export-desc">导出为网页文件</span>
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
  );
}
