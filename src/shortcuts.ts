import { getState, redo, select, setState, undo } from './store';
import { GRID } from './model/sheet';
import { NOTATIONS } from './model/notation';
import { decomposeSelected, deleteSelection, goUp, newFile, openDiagram, openFile, printModel, save } from './actions';
import { canvasApi } from './components/canvas/Canvas';
import { nudgeBoxes } from './components/canvas/gestures';

type Handler = (event: KeyboardEvent) => void;

const isTyping = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  return !!target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
};

const currentDiagram = () => {
  const { model, diagramId } = getState();
  return model.diagrams[diagramId];
};

const FILE_SHORTCUTS: Record<string, Handler> = {
  KeyS: (event) => save(event.shiftKey),
  KeyO: () => openFile(),
  KeyN: () => newFile(),
  KeyP: () => printModel(false),
};

const CTRL_SHORTCUTS: Record<string, Handler> = {
  KeyZ: (event) => (event.shiftKey ? redo() : undo()),
  KeyY: () => redo(),
  KeyA: () => {
    const diagram = currentDiagram();
    select({ boxes: diagram.boxes.map((b) => b.id), arrows: diagram.arrows.map((a) => a.id) });
  },
  Digit0: () => canvasApi.fit(),
  Numpad0: () => canvasApi.fit(),
  Equal: () => canvasApi.zoomBy(1.2),
  NumpadAdd: () => canvasApi.zoomBy(1.2),
  Minus: () => canvasApi.zoomBy(1 / 1.2),
  NumpadSubtract: () => canvasApi.zoomBy(1 / 1.2),
};

const ALT_SHORTCUTS: Record<string, Handler> = {
  ArrowUp: () => goUp(),
  ArrowDown: () => {
    const box = currentDiagram().boxes.find((b) => b.id === getState().sel.boxes[0]);
    if (box?.child) openDiagram(box.child);
  },
};

function pickNodeKind(code: string) {
  const kinds = NOTATIONS[currentDiagram().notation].kinds;
  const digit = code === 'KeyB' ? 1 : Number(code.slice(5));
  const kind = kinds[digit === 0 ? 9 : digit - 1];
  if (kind) setState({ tool: 'node', nodeKind: kind });
}

function startEditing() {
  const { sel } = getState();
  if (sel.boxes.length === 1 && !sel.arrows.length) setState({ editing: { kind: 'box', id: sel.boxes[0] } });
  else if (sel.arrows.length === 1 && !sel.boxes.length) setState({ editing: { kind: 'arrow', id: sel.arrows[0] } });
}

function nudgeSelection(code: string, fast: boolean) {
  const step = GRID * (fast ? 4 : 1);
  const dx = code === 'ArrowLeft' ? -step : code === 'ArrowRight' ? step : 0;
  const dy = code === 'ArrowUp' ? -step : code === 'ArrowDown' ? step : 0;
  nudgeBoxes(getState().sel.boxes, { x: dx, y: dy });
}

function plainKey(event: KeyboardEvent): boolean {
  const { code } = event;
  switch (code) {
    case 'Delete':
    case 'Backspace':
      deleteSelection();
      return true;
    case 'Escape':
      select({});
      setState({ tool: 'select' });
      return false;
    case 'KeyV':
      setState({ tool: 'select' });
      return false;
    case 'KeyA':
      setState({ tool: 'arrow' });
      return false;
    case 'KeyH':
      setState({ tool: 'hand' });
      return false;
    case 'KeyD':
      decomposeSelected();
      return false;
    case 'F1':
      setState({ dialog: { kind: 'shortcuts' } });
      return true;
    case 'F2':
    case 'Enter':
      startEditing();
      return true;
  }
  if (code === 'KeyB' || /^Digit\d$/.test(code)) {
    pickNodeKind(code);
    return false;
  }
  if (code.startsWith('Arrow') && getState().sel.boxes.length) {
    nudgeSelection(code, event.shiftKey);
    return true;
  }
  return false;
}

function run(event: KeyboardEvent, handler: Handler | undefined): boolean {
  if (!handler) return false;
  event.preventDefault();
  handler(event);
  return true;
}

function fileShortcut(event: KeyboardEvent, ctrl: boolean): Handler | undefined {
  if (event.code === 'KeyN') return ctrl || event.altKey ? FILE_SHORTCUTS.KeyN : undefined;
  return ctrl ? FILE_SHORTCUTS[event.code] : undefined;
}

export function handleKeyDown(event: KeyboardEvent) {
  const ctrl = event.ctrlKey || event.metaKey;
  const { code } = event;
  const { dialog } = getState();

  const fileAction = fileShortcut(event, ctrl);
  if (fileAction) {
    event.preventDefault();
    if (!dialog || code === 'KeyS') fileAction(event);
    return;
  }

  if (dialog) {
    if (event.key === 'Escape') {
      if (dialog.kind === 'unsaved') dialog.resolve('cancel');
      else setState({ dialog: null });
    }
    return;
  }
  if (isTyping(event)) return;

  if (ctrl && run(event, CTRL_SHORTCUTS[code])) return;
  if (event.altKey && run(event, ALT_SHORTCUTS[code])) return;
  if (ctrl || event.altKey) return;

  if (plainKey(event)) event.preventDefault();
}
