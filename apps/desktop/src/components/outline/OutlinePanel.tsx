import { useState } from 'react';
import { useEditorStore } from '../../store/editorStore';

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

export function OutlinePanel() {
  const outlineVisible = useEditorStore((s) => s.outlineVisible);
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const [collapsed, setCollapsed] = useState(false);

  if (!outlineVisible) return null;

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const headings = activeTab ? extractHeadings(activeTab.content) : [];

  return (
    <div className={`outline-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="ol-header">
        {!collapsed && <span className="ol-title">大纲</span>}
        <button className="ol-toggle" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '▸' : '◂'}
        </button>
      </div>
      {!collapsed && (
        <div className="ol-body">
          {headings.length === 0 ? (
            <p className="ol-empty">暂无标题</p>
          ) : (
            headings.map((h, i) => (
              <div
                key={i}
                className="ol-item"
                style={{ paddingLeft: `${8 + (h.level - 1) * 12}px` }}
                title={`Ln ${h.line}`}
              >
                {h.text}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
