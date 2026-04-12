import { useState, Children, isValidElement } from 'react';
import type { ContainerPlugin, ContainerProps } from '../ContainerPlugin';

function extractTabs(children: React.ReactNode): Array<{ label: string; content: React.ReactNode }> {
  const items = Children.toArray(children);
  const tabs: Array<{ label: string; content: React.ReactNode }> = [];
  let currentLabel = '';
  let currentContent: React.ReactNode[] = [];

  for (const child of items) {
    if (isValidElement(child) && (child.type === 'h4' || (child.props as any)?.node?.tagName === 'h4')) {
      if (currentLabel || currentContent.length > 0) {
        tabs.push({ label: currentLabel || `Tab ${tabs.length + 1}`, content: currentContent });
      }
      currentLabel = typeof (child.props as any).children === 'string'
        ? (child.props as any).children
        : `Tab ${tabs.length + 1}`;
      currentContent = [];
    } else {
      currentContent.push(child);
    }
  }
  if (currentLabel || currentContent.length > 0) {
    tabs.push({ label: currentLabel || `Tab ${tabs.length + 1}`, content: currentContent });
  }
  if (tabs.length === 0) {
    tabs.push({ label: 'Tab 1', content: children });
  }
  return tabs;
}

function TabsComponent({ children }: ContainerProps) {
  const [activeTab, setActiveTab] = useState(0);
  const tabs = extractTabs(children);

  return (
    <div className="docmd-tabs" style={{
      border: '1px solid var(--brd, #e4e4e7)',
      borderRadius: '6px',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      margin: '1.5rem 0',
    }}>
      <div style={{
        display: 'flex',
        backgroundColor: 'var(--surf, #fafafa)',
        borderBottom: '1px solid var(--brd, #e4e4e7)',
        overflowX: 'auto',
      }}>
        {tabs.map((tab, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            style={{
              padding: '.75rem 1.25rem',
              cursor: 'pointer',
              border: 'none',
              borderBottom: `3px solid ${activeTab === i ? 'var(--acc, #068ad5)' : 'transparent'}`,
              marginBottom: '-1px',
              fontWeight: 500,
              fontSize: '14px',
              whiteSpace: 'nowrap',
              color: activeTab === i ? 'var(--acc, #068ad5)' : 'var(--t3, #71717a)',
              backgroundColor: activeTab === i ? 'var(--panel, #fff)' : 'transparent',
              transition: 'color .2s, border-color .2s, background-color .2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={{ padding: '1.5rem' }}>
        {tabs[activeTab]?.content}
      </div>
    </div>
  );
}

export const tabsPlugin: ContainerPlugin = {
  name: 'tabs',
  icon: '📑',
  label: '标签页',
  category: 'layout',
  component: TabsComponent,
  template: ':::tabs\n#### macOS\nmacOS 安装说明\n#### Windows\nWindows 安装说明\n#### Linux\nLinux 安装说明\n:::',
  description: '可切换的标签面板',
};
