import { EditorState, Transaction, Annotation, ChangeSet } from '@codemirror/state';

/**
 * Regex to match an ordered list item: optional leading whitespace, digits, a dot, then a space.
 */
const OL_ITEM_RE = /^(\s*)(\d+)\.\s/;

/** Annotation to mark renumber transactions so we don't re-process them */
const renumberAnnotation = Annotation.define<boolean>();

/**
 * Compute renumber changes for ordered list blocks affected by the given transaction.
 * Returns a ChangeSet if renumbering is needed, or null otherwise.
 */
function computeRenumberChanges(newDoc: EditorState['doc'], changes: ChangeSet): { from: number; to: number; insert: string }[] | null {
  const totalLines = newDoc.lines;

  // Collect changed line numbers
  const changedLines = new Set<number>();
  changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    const startLine = newDoc.lineAt(fromB).number;
    const endLine = newDoc.lineAt(Math.min(toB, newDoc.length)).number;
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      changedLines.add(lineNum);
    }
  });

  if (changedLines.size === 0) return null;

  const processedBlocks = new Set<number>();
  const renumberChanges: { from: number; to: number; insert: string }[] = [];

  for (const changedLine of changedLines) {
    let blockStart = changedLine;
    while (blockStart > 1) {
      const prevLine = newDoc.line(blockStart - 1);
      if (!OL_ITEM_RE.test(prevLine.text)) break;
      blockStart--;
    }

    const currentLineText = newDoc.line(Math.min(changedLine, totalLines)).text;
    if (!OL_ITEM_RE.test(currentLineText) && blockStart === changedLine) {
      if (changedLine < totalLines) {
        const nextLineText = newDoc.line(changedLine + 1).text;
        if (OL_ITEM_RE.test(nextLineText)) {
          blockStart = changedLine + 1;
        } else {
          continue;
        }
      } else {
        continue;
      }
    }

    if (processedBlocks.has(blockStart)) continue;
    processedBlocks.add(blockStart);

    let blockEnd = blockStart;
    while (blockEnd < totalLines) {
      const nextLine = newDoc.line(blockEnd + 1);
      if (!OL_ITEM_RE.test(nextLine.text)) break;
      blockEnd++;
    }

    let expectedNumber = 1;
    let needsRenumber = false;

    for (let lineNum = blockStart; lineNum <= blockEnd; lineNum++) {
      const line = newDoc.line(lineNum);
      const match = line.text.match(OL_ITEM_RE);
      if (!match) break;
      if (parseInt(match[2], 10) !== expectedNumber) {
        needsRenumber = true;
        break;
      }
      expectedNumber++;
    }

    if (!needsRenumber) continue;

    expectedNumber = 1;
    for (let lineNum = blockStart; lineNum <= blockEnd; lineNum++) {
      const line = newDoc.line(lineNum);
      const match = line.text.match(OL_ITEM_RE);
      if (!match) break;
      const currentNumber = parseInt(match[2], 10);
      if (currentNumber !== expectedNumber) {
        const indent = match[1];
        const numberStart = line.from + indent.length;
        const numberEnd = numberStart + match[2].length;
        renumberChanges.push({ from: numberStart, to: numberEnd, insert: String(expectedNumber) });
      }
      expectedNumber++;
    }
  }

  return renumberChanges.length > 0 ? renumberChanges : null;
}

/**
 * Transaction filter that appends renumber changes to the same transaction,
 * so Ctrl+Z undoes both the user edit and the renumbering in one step.
 */
const orderedListTransactionFilter = EditorState.transactionFilter.of((tr: Transaction) => {
  // Skip if this transaction is already a renumber, or has no doc changes
  if (!tr.docChanged || tr.annotation(renumberAnnotation)) return tr;

  const renumberChanges = computeRenumberChanges(tr.newDoc, tr.changes);
  if (!renumberChanges) return tr;

  return [tr, {
    changes: renumberChanges,
    annotations: renumberAnnotation.of(true),
  }];
});

export const orderedListExtension = [orderedListTransactionFilter];
