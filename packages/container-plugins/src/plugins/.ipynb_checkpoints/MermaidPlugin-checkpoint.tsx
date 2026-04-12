import type { ContainerPlugin, ContainerProps } from '../ContainerPlugin';

function MermaidComponent({ children }: ContainerProps) {
  return (
    <div style={{ padding: '16px', background: 'var(--surf, #f8f9fd)', borderRadius: '8px', border: '1px solid var(--brd, #dde2f0)', margin: '12px 0', textAlign: 'center' }}>
      <p style={{ color: 'var(--t3, #8892b0)', fontSize: '12px' }}>📊 Mermaid 图表渲染区域</p>
      <pre style={{ fontSize: '11px', color: 'var(--t2, #4a5580)', textAlign: 'left' }}>{children}</pre>
    </div>
  );
}

export const mermaidPlugin: ContainerPlugin = {
  name: 'mermaid',
  icon: '📊',
  label: '流程图',
  category: 'media',
  component: MermaidComponent,
  template: ':::mermaid\ngraph TD\n  A[开始] --> B{判断}\n  B -->|是| C[结果1]\n  B -->|否| D[结果2]\n:::',
  description: 'Mermaid 图表（流程图/序列图/甘特图）',
};
