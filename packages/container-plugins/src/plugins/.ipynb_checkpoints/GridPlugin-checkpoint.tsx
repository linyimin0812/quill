import type { ContainerPlugin, ContainerProps } from '../ContainerPlugin';

function GridComponent({ children }: ContainerProps) {
  return (
    <div className="docmd-grid" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '1.5rem',
      margin: '1rem 0',
      width: '100%',
    }}>
      {children}
    </div>
  );
}

export const gridPlugin: ContainerPlugin = {
  name: 'grid',
  icon: '⊞',
  label: '网格布局',
  category: 'layout',
  component: GridComponent,
  template: ':::grid\n:::card{title="特性 1" icon="🚀"}\n描述内容\n:::\n:::card{title="特性 2" icon="⚡"}\n描述内容\n:::\n:::card{title="特性 3" icon="🔒"}\n描述内容\n:::\n:::',
  description: '自适应多列网格',
};
