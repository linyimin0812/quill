import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldGutter,
  indentOnInput,
  indentUnit,
} from '@codemirror/language';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { lintKeymap } from '@codemirror/lint';
import { useEditorStore } from '@/store/editorStore';
import { useSettingsStore } from '@/store/settingsStore';
import {
  slashCommandExtension,
  slashMenuField,
  type SlashMenuState,
} from './extensions/SlashCommandPlugin';
import {
  codeBlockExtension,
  codeBlockMenuField,
  type CodeBlockMenuState,
} from './extensions/CodeBlockExtension';
import { orderedListExtension } from './extensions/OrderedListPlugin';
import type { ShortcutItem } from '@/store/settingsStore';

/** Convert display key symbols (⌘, Shift, etc.) to CodeMirror key format (Mod-Shift-s) */
function shortcutToCmKey(keys: string[]): string {
  const modMap: Record<string, string> = { '⌘': 'Mod', Ctrl: 'Ctrl', '⌥': 'Alt', Shift: 'Shift' };
  const mods: string[] = [];
  let mainKey = '';
  for (const k of keys) {
    if (modMap[k]) {
      mods.push(modMap[k]);
    } else {
      mainKey = k.toLowerCase();
    }
  }
  return [...mods, mainKey].join('-');
}

/** Build CodeMirror keymap entries from shortcut settings */
function buildMarkdownKeymap(
  shortcuts: ShortcutItem[],
  onSaveRef: React.MutableRefObject<(() => void) | undefined>,
): { key: string; run: (v: EditorView) => boolean }[] {
  const actionMap: Record<string, (v: EditorView) => boolean> = {
    save: () => { onSaveRef.current?.(); return true; },
    bold: (v) => {
      const { from, to } = v.state.selection.main;
      const sel = v.state.sliceDoc(from, to) || '文本';
      v.dispatch({ changes: { from, to, insert: `**${sel}**` }, selection: { anchor: from + 2, head: from + 2 + sel.length } });
      return true;
    },
    italic: (v) => {
      const { from, to } = v.state.selection.main;
      const sel = v.state.sliceDoc(from, to) || '文本';
      v.dispatch({ changes: { from, to, insert: `*${sel}*` }, selection: { anchor: from + 1, head: from + 1 + sel.length } });
      return true;
    },
    strikethrough: (v) => {
      const { from, to } = v.state.selection.main;
      const sel = v.state.sliceDoc(from, to) || '文本';
      v.dispatch({ changes: { from, to, insert: `~~${sel}~~` }, selection: { anchor: from + 2, head: from + 2 + sel.length } });
      return true;
    },
    code: (v) => {
      const { from, to } = v.state.selection.main;
      const sel = v.state.sliceDoc(from, to) || '代码';
      v.dispatch({ changes: { from, to, insert: `\`${sel}\`` }, selection: { anchor: from + 1, head: from + 1 + sel.length } });
      return true;
    },
    link: (v) => {
      const { from, to } = v.state.selection.main;
      const sel = v.state.sliceDoc(from, to) || '链接文本';
      v.dispatch({ changes: { from, to, insert: `[${sel}](url)` }, selection: { anchor: from + sel.length + 3, head: from + sel.length + 6 } });
      return true;
    },
  };

  return shortcuts
    .filter((s) => actionMap[s.id])
    .map((s) => ({ key: shortcutToCmKey(s.keys), run: actionMap[s.id] }));
}

export interface QuillEditorHandle {
  getView: () => EditorView | null;
  getScrollDOM: () => HTMLElement | null;
  setScrollRatio: (ratio: number) => void;
}

interface QuillEditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
  onSlashMenuChange?: (state: SlashMenuState) => void;
  onCodeBlockMenuChange?: (state: CodeBlockMenuState) => void;
  onSave?: () => void;
  onScrollRatioChange?: (ratio: number) => void;
  onImagePaste?: (file: File, previewUrl: string) => void;
}

export const QuillEditor = forwardRef<QuillEditorHandle, QuillEditorProps>(
  function QuillEditor({ initialContent = '', onChange, onSlashMenuChange, onCodeBlockMenuChange, onSave, onScrollRatioChange, onImagePaste }, ref) {
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const tabSizeCompartment = useRef(new Compartment());
    const markdownKeymapCompartment = useRef(new Compartment());
    const setCursorPosition = useEditorStore((s) => s.setCursorPosition);
    const setWordCount = useEditorStore((s) => s.setWordCount);
    const editorFont = useSettingsStore((s) => s.editorFont);
    const editorFontSize = useSettingsStore((s) => s.editorFontSize);
    const showLineNumbers = useSettingsStore((s) => s.showLineNumbers);
    const settingsTabSize = useSettingsStore((s) => s.tabSize);
    const shortcuts = useSettingsStore((s) => s.shortcuts);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onSlashMenuChangeRef = useRef(onSlashMenuChange);
    onSlashMenuChangeRef.current = onSlashMenuChange;
    const onCodeBlockMenuChangeRef = useRef(onCodeBlockMenuChange);
    onCodeBlockMenuChangeRef.current = onCodeBlockMenuChange;
    const onSaveRef = useRef(onSave);
    onSaveRef.current = onSave;
    const onScrollRatioChangeRef = useRef(onScrollRatioChange);
    onScrollRatioChangeRef.current = onScrollRatioChange;
    const onImagePasteRef = useRef(onImagePaste);
    onImagePasteRef.current = onImagePaste;
    const scrollSyncLock = useRef(false);

    useImperativeHandle(ref, () => ({
      getView: () => viewRef.current,
      getScrollDOM: () => viewRef.current?.scrollDOM ?? null,
      setScrollRatio: (ratio: number) => {
        const scrollEl = viewRef.current?.scrollDOM;
        if (!scrollEl) return;
        scrollSyncLock.current = true;
        const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
        scrollEl.scrollTop = ratio * maxScroll;
        setTimeout(() => { scrollSyncLock.current = false; }, 60);
      },
    }));

    const handleUpdate = useCallback(
      (update: any) => {
        try {
          if (update.docChanged) {
            const content = update.state.doc.toString();
            onChangeRef.current?.(content);
            const words = content.trim().split(/\s+/).filter(Boolean).length;
            setWordCount(words);
          }
          if (update.selectionSet) {
            const pos = update.state.selection.main.head;
            const line = update.state.doc.lineAt(pos);
            setCursorPosition(line.number, pos - line.from + 1);
          }
          // Notify parent about slash menu state changes
          const menuState = update.state.field(slashMenuField);
          onSlashMenuChangeRef.current?.(menuState);
          // Notify parent about code block menu state changes
          const cbMenuState = update.state.field(codeBlockMenuField);
          onCodeBlockMenuChangeRef.current?.(cbMenuState);
        } catch {
          // Ignore errors during rapid edits (e.g. coordsAtPos with invalid position)
        }
      },
      [setCursorPosition, setWordCount],
    );

    useEffect(() => {
      if (!editorRef.current) return;

      const state = EditorState.create({
        doc: initialContent,
        extensions: [
          EditorView.theme({
            '&': { fontSize: `${editorFontSize}px` },
            '.cm-scroller': { fontFamily: editorFont },
          }),
          ...(showLineNumbers ? [lineNumbers()] : []),
          highlightActiveLineGutter(),
          history(),
          foldGutter(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          tabSizeCompartment.current.of([
            EditorState.tabSize.of(settingsTabSize),
            indentUnit.of(' '.repeat(settingsTabSize)),
          ]),
          indentOnInput(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          markdownKeymapCompartment.current.of(
            keymap.of(buildMarkdownKeymap(shortcuts, onSaveRef)),
          ),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...completionKeymap,
            ...lintKeymap,
            indentWithTab,
          ]),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          ...slashCommandExtension,
          ...codeBlockExtension,
          ...orderedListExtension,
          EditorView.updateListener.of(handleUpdate),
          EditorView.lineWrapping,
          EditorView.domEventHandlers({
            paste(event) {
              const items = event.clipboardData?.items;
              if (!items) return false;
              for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                  event.preventDefault();
                  const file = item.getAsFile();
                  if (file) {
                    const previewUrl = URL.createObjectURL(file);
                    onImagePasteRef.current?.(file, previewUrl);
                  }
                  return true;
                }
              }
              return false;
            },
          }),
        ],
      });

      const view = new EditorView({
        state,
        parent: editorRef.current,
      });

      viewRef.current = view;

      // Scroll sync: listen on cm-scroller (the only scrollable container)
      const scrollEl = view.scrollDOM;
      const handleEditorScroll = () => {
        if (scrollSyncLock.current) return;
        const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
        if (maxScroll <= 0) return;
        const ratio = scrollEl.scrollTop / maxScroll;
        onScrollRatioChangeRef.current?.(ratio);
      };
      scrollEl.addEventListener('scroll', handleEditorScroll, { passive: true });

      // Initial word count
      const words = initialContent.trim().split(/\s+/).filter(Boolean).length;
      setWordCount(words);

      return () => {
        scrollEl.removeEventListener('scroll', handleEditorScroll);
        view.destroy();
      };
    }, []);

    // Dynamically update tabSize when settings change
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: tabSizeCompartment.current.reconfigure([
          EditorState.tabSize.of(settingsTabSize),
          indentUnit.of(' '.repeat(settingsTabSize)),
        ]),
      });
    }, [settingsTabSize]);

    // Dynamically update markdown shortcuts when settings change
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: markdownKeymapCompartment.current.reconfigure(
          keymap.of(buildMarkdownKeymap(shortcuts, onSaveRef)),
        ),
      });
    }, [shortcuts]);

    return (
      <div
        ref={editorRef}
        className="cm-wrapper"
        style={{ fontFamily: editorFont, fontSize: `${editorFontSize}px` }}
      />
    );
  },
);
