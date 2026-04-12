import type { ComponentType } from 'react';

/** Props passed to every container component */
export interface ContainerProps {
  /** Raw children content from the directive */
  children?: React.ReactNode;
  /** Directive attributes (e.g., type="info") */
  attributes?: Record<string, string>;
  /** Container name (e.g., "callout") */
  name?: string;
}

/** Category for organizing plugins in the slash menu */
export type ContainerCategory = 'layout' | 'media' | 'ai' | 'data' | 'custom';

/**
 * Interface that all container plugins must implement.
 * Registered plugins appear in the `/` slash command menu
 * and render inside the preview pane.
 */
export interface ContainerPlugin {
  /** Unique name matching the directive (e.g., "callout") */
  name: string;
  /** Emoji or icon for the slash menu */
  icon: string;
  /** Human-readable label */
  label: string;
  /** Category for grouping in the slash menu */
  category: ContainerCategory;
  /** React component that renders this container */
  component: ComponentType<ContainerProps>;
  /** Markdown template inserted when selected from slash menu */
  template: string;
  /** Optional description shown in the slash menu */
  description?: string;
}
