import { useEditorStore, type ViewMode } from '@/store/editorStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/hooks/useTheme';

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'split', label: '分屏' },
  { key: 'edit', label: '编辑' },
  { key: 'preview', label: '预览' },
];

export function Topbar() {
  const viewMode = useEditorStore((state) => state.viewMode);
  const setViewMode = useEditorStore((state) => state.setViewMode);
  const toggleOutline = useEditorStore((state) => state.toggleOutline);
  const toggleAiPanel = useEditorStore((state) => state.toggleAiPanel);
  const setCurrentPage = useSettingsStore((state) => state.setCurrentPage);
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="topbar">
      {/* Left: Logo */}
      <div className="tb-left">
        <div className="logo" onClick={() => setCurrentPage('editor')}>
          <img src="/quill.svg" alt="Quill" width="24" height="24" style={{ borderRadius: 5 }} />
          <span className="logo-name">
            Qu<em>ill</em>
          </span>
        </div>
      </div>

      {/* Right: View mode + Action buttons */}
      <div className="tb-right">
        {/* View mode segment */}
        <div className="view-seg">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode.key}
              className={`vseg ${viewMode === mode.key ? 'on' : ''}`}
              onClick={() => setViewMode(mode.key)}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div className="top-div" />

        <button className="tb-btn" onClick={toggleOutline} title="大纲">
          ☰
        </button>
        <button className="tb-btn" onClick={toggleAiPanel} title="AI 面板">
          ✦
        </button>
        <button className="tb-btn" title="导出">
          ↗
        </button>
        <button className="tb-btn" onClick={toggleTheme} title="切换主题">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>

      </div>
    </header>
  );
}
