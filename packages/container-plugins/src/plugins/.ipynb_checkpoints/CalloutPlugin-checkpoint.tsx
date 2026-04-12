import type { ContainerPlugin, ContainerProps } from '../ContainerPlugin';

const CALLOUT_VARIANTS: Record<string, { border: string; bg: string; icon: string; label: string }> = {
  info:    { border: '#3498db', bg: 'rgba(52, 152, 219, 0.08)', icon: 'ℹ️', label: 'Info' },
  warning: { border: '#f39c12', bg: 'rgba(243, 156, 18, 0.08)', icon: '⚠️', label: 'Warning' },
  tip:     { border: '#2ecc71', bg: 'rgba(46, 204, 113, 0.08)', icon: '💡', label: 'Tip' },
  danger:  { border: '#e74c3c', bg: 'rgba(231, 76, 60, 0.08)',  icon: '❌', label: 'Danger' },
  note:    { border: '#9b59b6', bg: 'rgba(155, 89, 182, 0.08)', icon: '📝', label: 'Note' },
};

function CalloutComponent({ children, attributes }: ContainerProps) {
  const type = attributes?.type || 'info';
  const variant = CALLOUT_VARIANTS[type] || CALLOUT_VARIANTS.info;
  const title = attributes?.title || variant.label;

  return (
    <div className="docmd-callout" style={{
      padding: '1rem 1.5rem',
      marginBottom: '1.5rem',
      borderRadius: '8px',
      border: `1px solid ${variant.border}`,
      backgroundColor: variant.bg,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        fontWeight: 700, marginBottom: '0.5rem',
        color: variant.border,
      }}>
        <span>{variant.icon}</span>
        <span>{title}</span>
      </div>
      <div style={{ lineHeight: 1.7, color: 'var(--t2, #3f3f46)' }}>
        {children}
      </div>
    </div>
  );
}

export const calloutPlugin: ContainerPlugin = {
  name: 'callout',
  icon: '💡',
  label: '提示框',
  category: 'layout',
  component: CalloutComponent,
  template: ':::callout{type="info"}\n在此输入内容\n:::',
  description: 'info / warning / tip / danger / note',
};
