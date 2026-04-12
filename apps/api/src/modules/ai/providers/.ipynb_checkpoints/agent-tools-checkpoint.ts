import { Type, type TSchema } from '@mariozechner/pi-ai';
import type { DocumentContext } from './Provider.js';

/**
 * Writing-focused Agent tools for Quill.
 * Tools receive document context via closure so they can read/edit the current document.
 */

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}

export interface WritingTool {
  name: string;
  description: string;
  parameters: TSchema;
  execute: (args: any) => Promise<ToolResult>;
}

/**
 * Mutable document holder shared across tools within a single agent session.
 * Tools read from / write to this holder; the final content is sent back to the frontend.
 */
export interface DocumentHolder {
  path: string;
  content: string;
  vaultRoot?: string;
  modified: boolean;
}

/**
 * Create writing tools bound to the given document context.
 * If no document context is provided, tools will report that no document is open.
 */
export function createWritingTools(docCtx?: DocumentContext): {
  tools: WritingTool[];
  documentHolder: DocumentHolder;
} {
  const documentHolder: DocumentHolder = {
    path: docCtx?.path || '',
    content: docCtx?.content || '',
    vaultRoot: docCtx?.vaultRoot,
    modified: false,
  };

  const noDocError = (): ToolResult => ({
    content: [{ type: 'text' as const, text: '错误：没有打开的文档。请先在编辑器中打开一个文档，然后再使用此工具。' }],
    isError: true,
  });

  const readDocumentTool: WritingTool = {
    name: 'read_document',
    description: 'Read the content of the currently open document in the editor. Use this to understand the document before making changes.',
    parameters: Type.Object({}),
    async execute() {
      if (!documentHolder.content) return noDocError();
      return {
        content: [{
          type: 'text' as const,
          text: `文件: ${documentHolder.path}\n内容长度: ${documentHolder.content.length} 字符\n\n---\n${documentHolder.content}`,
        }],
        isError: false,
      };
    },
  };

  const replaceDocumentTool: WritingTool = {
    name: 'replace_document',
    description: 'Replace the entire content of the currently open document with new content. Use this after polishing, translating, or rewriting the full document.',
    parameters: Type.Object({
      newContent: Type.String({ description: 'The new full content to replace the document with' }),
    }),
    async execute(args: { newContent: string }) {
      if (!documentHolder.path) return noDocError();
      documentHolder.content = args.newContent;
      documentHolder.modified = true;
      return {
        content: [{ type: 'text' as const, text: `文档已更新 (${args.newContent.length} 字符)。更改将同步到编辑器。` }],
        isError: false,
      };
    },
  };

  const editDocumentTool: WritingTool = {
    name: 'edit_document',
    description: 'Find and replace a specific section of the document. Provide the exact text to find and the new text to replace it with. Use this for targeted edits instead of replacing the entire document.',
    parameters: Type.Object({
      findText: Type.String({ description: 'The exact text to find in the document' }),
      replaceWith: Type.String({ description: 'The new text to replace the found text with' }),
    }),
    async execute(args: { findText: string; replaceWith: string }) {
      if (!documentHolder.content) return noDocError();
      if (!documentHolder.content.includes(args.findText)) {
        return {
          content: [{ type: 'text' as const, text: `未找到要替换的文本。请确认文本内容完全匹配（包括空格和换行）。` }],
          isError: true,
        };
      }
      documentHolder.content = documentHolder.content.replace(args.findText, args.replaceWith);
      documentHolder.modified = true;
      return {
        content: [{ type: 'text' as const, text: `已替换文本。文档已更新 (${documentHolder.content.length} 字符)。` }],
        isError: false,
      };
    },
  };

  const appendDocumentTool: WritingTool = {
    name: 'append_to_document',
    description: 'Append text to the end of the currently open document. Use this for continuing writing or adding new sections.',
    parameters: Type.Object({
      text: Type.String({ description: 'The text to append to the end of the document' }),
    }),
    async execute(args: { text: string }) {
      if (!documentHolder.path) return noDocError();
      documentHolder.content += args.text;
      documentHolder.modified = true;
      return {
        content: [{ type: 'text' as const, text: `已追加 ${args.text.length} 字符到文档末尾。文档总长度: ${documentHolder.content.length} 字符。` }],
        isError: false,
      };
    },
  };

  const tools: WritingTool[] = [
    readDocumentTool,
    replaceDocumentTool,
    editDocumentTool,
    appendDocumentTool,
  ];

  return { tools, documentHolder };
}
