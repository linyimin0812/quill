import { useCallback } from 'react';
import { useEditorStore } from '@/store/editorStore';

export type ExportFormat = 'markdown' | 'html' | 'pdf';

export function useExport() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);

  const getActiveContent = useCallback(() => {
    const tab = tabs.find((t) => t.id === activeTabId);
    return { name: tab?.name ?? 'untitled.md', content: tab?.content ?? '' };
  }, [tabs, activeTabId]);

  const exportMarkdown = useCallback(() => {
    const { name, content } = getActiveContent();
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, name);
  }, [getActiveContent]);

  const exportHtml = useCallback(() => {
    const { name, content } = getActiveContent();
    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name.replace(/\.md$/, '')}</title>
  <style>
    body {
      max-width: 800px; margin: 0 auto; padding: 40px 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.8; color: #1a1a2e;
    }
    h1 { font-size: 28px; border-bottom: 1px solid #dde2f0; padding-bottom: 8px; }
    h2 { font-size: 22px; }
    h3 { font-size: 18px; }
    code { background: #f0f2f8; padding: 2px 5px; border-radius: 3px; font-size: 13px; }
    pre { background: #f0f2f8; padding: 16px; border-radius: 8px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 3px solid #3a6ef0; padding: 4px 16px; margin: 12px 0; color: #4a5580; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #dde2f0; padding: 8px 12px; text-align: left; }
    th { background: #f0f2f8; }
    a { color: #3a6ef0; }
    img { max-width: 100%; }
  </style>
</head>
<body>
<pre>${escapeHtml(content)}</pre>
</body>
</html>`;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    downloadBlob(blob, name.replace(/\.md$/, '.html'));
  }, [getActiveContent]);

  const exportPdf = useCallback(async () => {
    // PDF export: open print dialog (browser/Tauri approach)
    const { name, content } = getActiveContent();
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${name.replace(/\.md$/, '')}</title>
  <style>
    body {
      max-width: 700px; margin: 0 auto; padding: 40px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.8; color: #1a1a2e; font-size: 14px;
    }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
<pre style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(content)}</pre>
<script>window.onload = function() { window.print(); window.close(); }</script>
</body>
</html>`);
    printWindow.document.close();
  }, [getActiveContent]);

  return { exportMarkdown, exportHtml, exportPdf };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
