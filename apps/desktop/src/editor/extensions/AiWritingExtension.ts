import { EditorView } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';

export const triggerAiWrite = StateEffect.define<{ from: number; to: number; text: string }>();

export function getSelectedText(view: EditorView): string {
  const { from, to } = view.state.selection.main;
  return view.state.doc.sliceString(from, to);
}

export function replaceSelection(view: EditorView, text: string) {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
  });
}

export function insertAtCursor(view: EditorView, text: string) {
  const pos = view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, insert: text },
  });
}
