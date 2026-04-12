import { Children } from 'react';
import type { ContainerPlugin, ContainerProps } from '../ContainerPlugin';

function StepsComponent({ children }: ContainerProps) {
  const items = Children.toArray(children);

  return (
    <div className="docmd-steps" style={{
      position: 'relative',
      paddingLeft: '3rem',
      margin: '1.5rem 0',
      counterReset: 'step-counter 0',
    }}>
      {/* Vertical connector line */}
      <div style={{
        position: 'absolute',
        left: '1.15rem',
        top: '1rem',
        bottom: '1rem',
        width: '2px',
        backgroundColor: 'var(--brd, #e4e4e7)',
      }} />
      {items.map((child, index) => (
        <div key={index} style={{
          position: 'relative',
          marginBottom: '2.5rem',
        }}>
          {/* Step number */}
          <span style={{
            position: 'absolute',
            left: '-3rem',
            top: '-0.15rem',
            fontWeight: 700,
            fontSize: '2rem',
            lineHeight: 1,
            color: 'var(--acc, #068ad5)',
            zIndex: 1,
            backgroundColor: 'var(--panel, #fff)',
            padding: '0 0.25rem',
          }}>
            {index + 1}.
          </span>
          <div style={{ lineHeight: 1.7, color: 'var(--t2, #3f3f46)' }}>
            {child}
          </div>
        </div>
      ))}
    </div>
  );
}

export const stepsPlugin: ContainerPlugin = {
  name: 'steps',
  icon: '📋',
  label: '步骤',
  category: 'layout',
  component: StepsComponent,
  template: ':::steps\n**准备工作** 安装依赖和配置环境\n\n**开始实施** 编写核心代码\n\n**完成验证** 运行测试确认结果\n:::',
  description: '编号步骤时间线',
};
