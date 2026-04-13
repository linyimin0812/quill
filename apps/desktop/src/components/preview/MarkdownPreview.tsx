import { useMemo, useRef, useEffect, useCallback, createElement, Fragment } from 'react';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkDirective from 'remark-directive';
import remarkDirectiveRehype from 'remark-directive-rehype';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeReact from 'rehype-react';
import { jsx, jsxs } from 'react/jsx-runtime';
import { ContainerRegistry, registerBuiltinPlugins } from '@quill/container-plugins';
import type { ContainerProps } from '@quill/container-plugins';

// Ensure built-in plugins are registered once
registerBuiltinPlugins();

/**
 * Build a component map from the ContainerRegistry for rehype-react.
 * remark-directive-rehype converts :::name{attrs} into <name ...attrs> hast nodes.
 * We map each registered plugin name to its React component.
 */
function buildComponentMap(): Record<string, React.ComponentType<any>> {
  const registry = ContainerRegistry.getInstance();
  const componentMap: Record<string, React.ComponentType<any>> = {};

  for (const plugin of registry.getAll()) {
    const PluginComponent = plugin.component;
    // Wrapper that adapts hast element props to ContainerProps
    componentMap[plugin.name] = function DirectiveWrapper(props: any) {
      const { children, node, ...rest } = props;
      // Merge hast node properties to ensure directive attributes like "type" are preserved
      // (some attributes like "type" may be consumed by rehype as HTML-native props)
      const nodeProperties = node?.properties ?? {};
      const mergedAttributes = { ...nodeProperties, ...rest };
      const containerProps: ContainerProps = {
        children,
        attributes: mergedAttributes,
        name: plugin.name,
      };
      return createElement(PluginComponent, containerProps);
    };
  }

  return componentMap;
}

/** Recursively extract plain text from React children */
function extractTextContent(children: any): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractTextContent).join('');
  if (children?.props?.children) return extractTextContent(children.props.children);
  return '';
}

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const componentMap = useMemo(() => {
    const map = buildComponentMap();
    // Add heading components with auto-generated id anchors for outline navigation
    const headingLevels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
    for (const tag of headingLevels) {
      map[tag] = function HeadingWithId(props: any) {
        const { children, ...rest } = props;
        const textContent = extractTextContent(children);
        const headingId = textContent.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '');
        return createElement(tag, { ...rest, id: headingId }, children);
      };
    }
    return map;
  }, []);

  const reactContent = useMemo(() => {
    try {
      const result = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkBreaks)
        .use(remarkDirective)
        .use(remarkDirectiveRehype)
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeHighlight, { ignoreMissing: true } as any)
        .use(rehypeReact, {
          jsx,
          jsxs,
          Fragment,
          components: componentMap,
        } as any)
        .processSync(content);

      return result.result as React.ReactElement;
    } catch (error) {
      console.error('[MarkdownPreview] render error:', error);
      return createElement('p', null, '渲染错误');
    }
  }, [content, componentMap]);

  const handleCopyClick = useCallback((event: MouseEvent) => {
    const button = (event.target as HTMLElement).closest('.code-copy-btn');
    if (!button) return;
    const pre = button.closest('pre');
    if (!pre) return;
    const codeElement = pre.querySelector('code');
    const text = codeElement?.textContent ?? pre.textContent ?? '';
    const copySvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    const checkSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    navigator.clipboard.writeText(text).then(() => {
      button.innerHTML = checkSvg;
      button.classList.add('copied');
      setTimeout(() => {
        button.innerHTML = copySvg;
        button.classList.remove('copied');
      }, 1500);
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const preBlocks = container.querySelectorAll('pre');
    preBlocks.forEach((pre) => {
      if (pre.querySelector('.code-copy-btn')) return;

      pre.classList.add('code-block-enhanced');

      const copyButton = document.createElement('button');
      copyButton.className = 'code-copy-btn';
      copyButton.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      copyButton.type = 'button';
      pre.appendChild(copyButton);

      const codeElement = pre.querySelector('code');
      if (codeElement) {
        const lines = codeElement.textContent?.split('\n') ?? [];
        if (lines.length > 0 && lines[lines.length - 1] === '') {
          lines.pop();
        }
        const lineNumbersContainer = document.createElement('span');
        lineNumbersContainer.className = 'code-line-numbers';
        lineNumbersContainer.setAttribute('aria-hidden', 'true');
        lineNumbersContainer.innerHTML = lines
          .map((_, index) => `<span class="code-ln">${index + 1}</span>`)
          .join('');
        pre.insertBefore(lineNumbersContainer, codeElement);
      }
    });

    container.addEventListener('click', handleCopyClick);
    return () => container.removeEventListener('click', handleCopyClick);
  }, [reactContent, handleCopyClick]);

  return (
    <div className="md-preview" ref={containerRef}>
      {reactContent}
    </div>
  );
}
