import { EditorView } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';

const setIMEComposing = StateEffect.define<boolean>();

export const imeStateField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setIMEComposing)) return effect.value;
    }
    return value;
  },
});

export const suppressPreviewEffect = StateEffect.define<boolean>();

export const imeExtension = [
  imeStateField,
  EditorView.domEventHandlers({
    compositionstart(_event, view) {
      view.dispatch({ effects: setIMEComposing.of(true) });
    },
    compositionend(_event, view) {
      view.dispatch({ effects: setIMEComposing.of(false) });
    },
  }),
];
