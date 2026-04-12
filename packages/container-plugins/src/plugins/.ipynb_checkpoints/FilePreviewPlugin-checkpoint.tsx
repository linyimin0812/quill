import type { ContainerPlugin, ContainerProps } from '../ContainerPlugin';

function FilePreviewComponent({ children, attributes }: ContainerProps) {
  const src = attributes?.src || '';
  return (
    <div style={{ padding: '12px 16px', background: 'var(--surf, #f8f9fd)', borderRadius: '8px', border: '1px solid var(--brd, #dde2f0)', margin: '12px 0' }}>
      <div style={{ fontSize: '11px', color: 'var(--t3, #8892b0)', marginBottom: '8px' }}>📄 {src || '文件预览'}</div>
      <div>{children}</div>
    </div>
  );
}

export const filePreviewPlugin: ContainerPlugin = {
  name: 'file-preview',
  icon: '📄',
  label: '文件预览',
  category: 'media',
  component: FilePreviewComponent,
  template: ':::file-preview{src="path/to/file.md"}\n:::',
  description: '内联展示 Vault 中的文件内容',
};
