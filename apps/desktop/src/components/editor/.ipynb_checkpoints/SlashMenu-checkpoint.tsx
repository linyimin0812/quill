import { useState, useEffect, useCallback } from 'react';
import { ContainerRegistry } from '@quill/container-plugins';
import type { ContainerPlugin, ContainerCategory } from '@quill/container-plugins';

const CATEGORY_LABELS: Record<ContainerCategory, string> = {
  layout: '布局',
  media: '媒体',
  ai: 'AI',
  data: '数据',
  custom: '自定义',
};

interface SlashMenuProps {
  visible: boolean;
  filter: string;
  position: { top: number; left: number };
  onSelect: (plugin: ContainerPlugin) => void;
  onClose: () => void;
}

export function SlashMenu({ visible, filter, position, onSelect, onClose }: SlashMenuProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const registry = ContainerRegistry.getInstance();

  const allPlugins = registry.getAll();
  const filtered = filter
    ? allPlugins.filter(
        (p) =>
          p.name.toLowerCase().includes(filter.toLowerCase()) ||
          p.label.includes(filter),
      )
    : allPlugins;

  // Group by category
  const grouped = new Map<ContainerCategory, ContainerPlugin[]>();
  for (const plugin of filtered) {
    const list = grouped.get(plugin.category) || [];
    list.push(plugin);
    grouped.set(plugin.category, list);
  }

  const flatList = filtered;

  useEffect(() => {
    setActiveIndex(0);
  }, [filter]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, flatList.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatList[activeIndex]) onSelect(flatList[activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [visible, flatList, activeIndex, onSelect, onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!visible || flatList.length === 0) return null;

  let itemIndex = 0;

  return (
    <div className="slash-menu" style={{ top: position.top, left: position.left }}>
      {Array.from(grouped.entries()).map(([category, plugins]) => (
        <div key={category} className="slash-menu-group">
          <div className="slash-menu-category">{CATEGORY_LABELS[category]}</div>
          {plugins.map((plugin) => {
            const currentIndex = itemIndex++;
            return (
              <div
                key={plugin.name}
                className={`slash-menu-item ${currentIndex === activeIndex ? 'active' : ''}`}
                onClick={() => onSelect(plugin)}
                onMouseEnter={() => setActiveIndex(currentIndex)}
              >
                <span className="slash-menu-icon">{plugin.icon}</span>
                <div className="slash-menu-info">
                  <span className="slash-menu-label">{plugin.label}</span>
                  {plugin.description && (
                    <span className="slash-menu-desc">{plugin.description}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
