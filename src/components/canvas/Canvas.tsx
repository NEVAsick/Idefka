import { useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { beginGesture, commit, endGesture, getState, select, setState, toast, useStore, type Tool } from '../../store';
import { computeGeometry } from '../../model/geometry';
import { projectOnPath } from '../../model/path';
import { AREA, GRID, SHEET_H, SHEET_W } from '../../model/sheet';
import type { Diagram, Endpoint, Pt, Side } from '../../model/types';
import { addBox } from '../../model/ops';
import { dependents, isContext } from '../../model/query';
import { connectable, isLifeline, KINDS, lifelineHead } from '../../model/notation';
import { canBranch } from '../../model/links';
import { decomposeSelected, openDiagram } from '../../actions';
import { SheetContent } from '../sheet/Sheet';
import { Crumbs } from '../TopBar';
import { hoverBox, lifelineOf, nearestSide, resolveEnd, type End, type HitContext } from './hitTest';
import {
  dragSegment,
  finishNewArrow,
  finishSegmentDrag,
  moveBoxes,
  moveLabel,
  moveMessage,
  newArrowFrom,
  newArrowTo,
  newMessage,
  reconnectEnd,
  resizeBox,
  selectInMarquee,
  startMove,
  startSegmentDrag,
  withPreviewEnd,
  type Gesture,
} from './gestures';
import { useSpaceHeld, useViewport } from './useViewport';
import { Overlay } from './Overlay';
import { InlineEditor } from './InlineEditor';
import { Hint, ToolDock } from './ToolDock';

export { canvasApi } from './useViewport';

const A0_LIMIT = 'На контекстной диаграмме A-0 только одна работа. Декомпозируйте её, чтобы добавить работы.';

function dragStarted(gesture: { moved: boolean }, far: boolean) {
  if (gesture.moved) return true;
  if (!far) return false;
  beginGesture();
  gesture.moved = true;
  return true;
}

function releasePointer(element: HTMLElement | null, pointerId: number) {
  if (element?.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
}

function selectArrowUnder(clientX: number, clientY: number) {
  const under = document.elementsFromPoint(clientX, clientY).find((el) => el.getAttribute('data-k') === 'arrow');
  const id = under?.getAttribute('data-id');
  if (id) select({ arrows: [id] });
}

function toggled(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

function placeNode(at: Pt) {
  const { diagramId, nodeKind } = getState();
  const id = commit((draft) => addBox(draft, diagramId, nodeKind, at.x, at.y) ?? false);
  if (!id) {
    toast(A0_LIMIT);
    return;
  }
  select({ boxes: [id] });
  const info = KINDS[nodeKind];
  const named = !info.noName && info.defaultName !== '';
  setState({ editing: named ? { kind: 'box', id } : null, tool: 'select' });
}

function cursorFor(gesture: Gesture | null, space: boolean, tool: Tool) {
  if (gesture?.kind === 'pan') return 'grabbing';
  if (space || tool === 'hand') return 'grab';
  if (tool === 'node') return 'copy';
  if (tool === 'arrow') return 'crosshair';
  return 'default';
}

export function Canvas() {
  const { model, diagramId, sel, tool, editing, showGrid, showFrame, nodeKind } = useStore();
  const diagram = model.diagrams[diagramId];
  const wrapRef = useRef<HTMLDivElement>(null);
  const { view, viewRef, setView, toWorld } = useViewport(wrapRef, diagramId);
  const [space, spaceRef] = useSpaceHeld();
  const [gesture, setGestureState] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const setGesture = (next: Gesture | null) => {
    gestureRef.current = next;
    setGestureState(next);
  };

  const drawing = gesture?.kind === 'new-arrow' && gesture.moved ? gesture : null;
  const baseGeom = useMemo(() => computeGeometry(model, diagram), [model, diagram]);
  const shown = useMemo<Diagram>(() => (drawing ? { ...diagram, arrows: [...diagram.arrows, drawing.arrow] } : diagram), [diagram, drawing]);
  const geom = useMemo(() => (shown === diagram ? baseGeom : computeGeometry(model, shown)), [model, shown, diagram, baseGeom]);
  const geomById = useMemo(() => new Map(geom.map((g) => [g.id, g])), [geom]);
  const geomRef = useRef(baseGeom);
  geomRef.current = baseGeom;

  const hitContext = (): HitContext => {
    const state = getState();
    return { diagram: state.model.diagrams[state.diagramId], geom: geomRef.current, zoom: viewRef.current.z };
  };

  const startFromHandle = (current: Diagram, boxId: string, side: Side, at: Pt) => {
    const end: Endpoint = { t: 'box', box: boxId, side };
    const incoming = current.notation === 'idef0' && side !== 'right';
    setGesture(incoming ? newArrowTo(end, at, boxId) : newArrowFrom(end, at, boxId));
  };

  const pressLabel = (current: Diagram, arrowId: string, at: Pt) => {
    const arrow = current.arrows.find((a) => a.id === arrowId)!;
    select({ arrows: [arrowId] });
    setGesture({ kind: 'label', arrowId, start: at, dx: arrow.labelDx ?? 0, dy: arrow.labelDy ?? 0, moved: false });
  };

  const pressArrow = (e: ReactPointerEvent, current: Diagram, arrowId: string, at: Pt) => {
    const { tool, sel } = getState();
    const arrow = current.arrows.find((a) => a.id === arrowId);

    if (arrow?.seqY !== undefined && !e.shiftKey) {
      select({ arrows: [arrowId] });
      setGesture({ kind: 'message-move', arrowId, startY: arrow.seqY, start: at, moved: false });
      return;
    }

    if ((e.altKey || tool === 'arrow') && canBranch(current.notation)) {
      const g = geomRef.current.find((x) => x.id === arrowId);
      if (!g) return;
      const tap = projectOnPath(g.points, at).point;
      setGesture(newArrowFrom({ t: 'tap', arrow: arrowId, x: tap.x, y: tap.y }, at, undefined, new Set([arrowId])));
      return;
    }

    if (e.shiftKey) {
      select({ boxes: sel.boxes, arrows: toggled(sel.arrows, arrowId) });
      return;
    }

    select({ arrows: [arrowId] });
    setGesture({ kind: 'arrow-press', arrowId, start: at });
  };

  const pressBox = (e: ReactPointerEvent, current: Diagram, boxId: string, at: Pt) => {
    const { tool, sel } = getState();
    const box = current.boxes.find((b) => b.id === boxId);
    const sequence = current.notation === 'sequence';

    if (sequence && box?.kind === 'activation' && tool === 'select' && !e.shiftKey) {
      select({ boxes: [box.id] });
      setGesture({ kind: 'activation-press', boxId: box.id, start: at });
      return;
    }

    if (sequence && box && !e.shiftKey && (tool === 'select' || tool === 'arrow')) {
      const lifeline = isLifeline(box.kind) ? box : box.kind === 'activation' && tool === 'arrow' ? lifelineOf(current, box) : undefined;
      const belowHead = lifeline && at.y > lifeline.y + lifelineHead(lifeline.kind);
      if (lifeline && (box.kind === 'activation' || belowHead)) {
        setGesture(newMessage(lifeline, at, at));
        return;
      }
    }

    if (tool === 'arrow' && box && connectable(box.kind)) {
      const side: Side = current.notation === 'idef0' ? 'right' : nearestSide(box, at);
      setGesture(newArrowFrom({ t: 'box', box: boxId, side }, at, boxId));
      return;
    }

    let boxes = sel.boxes;
    if (e.shiftKey) boxes = toggled(boxes, boxId);
    else if (!boxes.includes(boxId)) boxes = [boxId];
    select({ boxes, arrows: e.shiftKey ? sel.arrows : [] });
    setGesture(startMove(current, boxes, at));
  };

  const startFreeArrow = (at: Pt) => {
    const from = resolveEnd(hitContext(), 'from', at, undefined, new Set());
    const exclude = from.t === 'box' ? from.box : undefined;
    const skipArrows = from.t === 'tap' ? new Set([from.arrow]) : undefined;
    setGesture(newArrowFrom(from, at, exclude, skipArrows));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('.no-canvas')) return;
    const state = getState();
    const current = state.model.diagrams[state.diagramId];
    const at = toWorld(e.clientX, e.clientY);
    wrapRef.current!.setPointerCapture(e.pointerId);

    if (e.button === 1 || e.button === 2 || spaceRef.current || state.tool === 'hand') {
      e.preventDefault();
      const { x, y } = viewRef.current;
      setGesture({ kind: 'pan', startX: e.clientX, startY: e.clientY, viewX: x, viewY: y });
      return;
    }
    if (e.button !== 0) return;
    if (state.editing) (document.activeElement as HTMLElement | null)?.blur?.();

    const target = (e.target as Element).closest('[data-k]');
    const kind = target?.getAttribute('data-k');
    const id = target?.getAttribute('data-id') ?? '';

    if (kind === 'open') {
      const child = current.boxes.find((b) => b.id === id)?.child;
      if (child) openDiagram(child);
      return;
    }
    if (kind === 'resize') {
      const box = current.boxes.find((b) => b.id === id)!;
      setGesture({ kind: 'resize', boxId: id, start: at, width: box.w, height: box.h, moved: false });
      return;
    }
    if (kind === 'handle') return startFromHandle(current, id, target!.getAttribute('data-side') as Side, at);
    if (state.tool === 'node') {
      e.preventDefault();
      return placeNode(at);
    }
    if (kind === 'end') return setGesture({ kind: 'reconnect', arrowId: id, end: target!.getAttribute('data-end') as End, moved: false });
    if (kind === 'label') return pressLabel(current, id, at);
    if (kind === 'arrow') return pressArrow(e, current, id, at);
    if (kind === 'box') return pressBox(e, current, id, at);
    if (state.tool === 'arrow') return startFreeArrow(at);

    if (!e.shiftKey) select({});
    setGesture({ kind: 'marquee', start: at, current: at, additive: e.shiftKey });
  };

  const updateHover = (e: ReactPointerEvent, current: Diagram, at: Pt, zoom: number) => {
    const handleOwner = (e.target as Element).closest?.('[data-k="handle"]')?.getAttribute('data-id');
    const id = handleOwner ?? hoverBox(current, at, 18 / Math.max(zoom, 0.5))?.id ?? null;
    if (id !== hover) setHover(id);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const active = gestureRef.current;
    const state = getState();
    const current = state.model.diagrams[state.diagramId];
    const at = toWorld(e.clientX, e.clientY);
    const zoom = viewRef.current.z;

    if (!active) {
      if (state.tool === 'select' || state.tool === 'arrow') updateHover(e, current, at, zoom);
      return;
    }

    const start = 'start' in active ? active.start : at;
    const delta = { x: at.x - start.x, y: at.y - start.y };
    const far = Math.abs(delta.x) + Math.abs(delta.y) > 5 / zoom;

    switch (active.kind) {
      case 'pan':
        setView({ ...viewRef.current, x: active.viewX + e.clientX - active.startX, y: active.viewY + e.clientY - active.startY });
        break;

      case 'arrow-press': {
        if (!far) return;
        const g = geomRef.current.find((x) => x.id === active.arrowId);
        const segment = g && startSegmentDrag(active.arrowId, g.points, active.start);
        if (!segment) return;
        beginGesture();
        setGesture(segment);
        break;
      }

      case 'segment':
        dragSegment(active, delta, zoom);
        break;

      case 'move':
        if (dragStarted(active, far)) moveBoxes(active, delta);
        break;

      case 'activation-press': {
        if (!far) return;
        const activation = current.boxes.find((b) => b.id === active.boxId);
        const lifeline = activation && lifelineOf(current, activation);
        if (activation && lifeline && Math.abs(delta.x) >= Math.abs(delta.y)) {
          setGesture(newMessage(lifeline, active.start, at, true));
        } else if (activation) {
          beginGesture();
          setGesture({ kind: 'move', start: active.start, origin: { [activation.id]: { x: activation.x, y: activation.y } }, messageY: {}, moved: true });
        }
        break;
      }

      case 'message-move':
        if (dragStarted(active, far)) moveMessage(active, delta.y);
        break;

      case 'resize':
        dragStarted(active, true);
        resizeBox(active, delta);
        break;

      case 'new-arrow':
        setGesture(withPreviewEnd(active, current, at, hitContext(), far));
        break;

      case 'reconnect': {
        const arrow = current.arrows.find((a) => a.id === active.arrowId);
        if (!arrow) return;
        dragStarted(active, true);
        reconnectEnd(active, current, at, hitContext(), dependents(current, arrow.id));
        break;
      }

      case 'label':
        if (dragStarted(active, far)) moveLabel(active, delta);
        break;

      case 'marquee':
        setGesture({ ...active, current: at });
        break;
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const active = gestureRef.current;
    releasePointer(wrapRef.current, e.pointerId);
    if (!active) return;
    setGesture(null);
    const state = getState();
    const current = state.model.diagrams[state.diagramId];

    switch (active.kind) {
      case 'move':
      case 'resize':
      case 'reconnect':
      case 'label':
      case 'message-move':
        if (active.moved) endGesture();
        break;

      case 'segment':
        finishSegmentDrag(active);
        endGesture();
        break;

      case 'new-arrow':
        if (active.moved) finishNewArrow(active, current, toWorld(e.clientX, e.clientY), hitContext());
        else selectArrowUnder(e.clientX, e.clientY);
        break;

      case 'marquee':
        selectInMarquee(active, current, geomRef.current);
        break;
    }
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    const active = gestureRef.current;
    releasePointer(wrapRef.current, e.pointerId);
    if (!active) return;
    setGesture(null);
    if (active.kind === 'segment') {
      finishSegmentDrag(active);
      endGesture();
    } else if ('moved' in active && active.moved && active.kind !== 'new-arrow') {
      endGesture();
    }
  };

  const onDoubleClick = (e: ReactMouseEvent) => {
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    if (hit?.closest('.no-canvas')) return;
    const target = hit?.closest('[data-k]');
    const kind = target?.getAttribute('data-k');
    const id = target?.getAttribute('data-id') ?? '';

    if (kind === 'box' || kind === 'handle') {
      const box = diagram.boxes.find((b) => b.id === id);
      if (!box) return;
      if (e.ctrlKey) return decomposeSelected(box.id);
      select({ boxes: [box.id] });
      if (!KINDS[box.kind].noName) setState({ editing: { kind: 'box', id: box.id } });
    } else if (kind === 'arrow' || kind === 'label') {
      select({ arrows: [id] });
      setState({ editing: { kind: 'arrow', id } });
    }
  };

  const zoom = view.z;

  return (
    <div
      className="canvas"
      ref={wrapRef}
      style={{ cursor: cursorFor(gesture, space, tool) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={() => !gestureRef.current && setHover(null)}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg className="canvas-svg" width="100%" height="100%">
        <defs>
          <pattern id="dots" width={GRID * 2} height={GRID * 2} patternUnits="userSpaceOnUse" x={AREA.x} y={AREA.y}>
            <circle cx={0.8} cy={0.8} r={0.8} fill="#c5cbd3" />
          </pattern>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${zoom})`}>
          <rect className="sheet-shadow" x={0} y={0} width={SHEET_W} height={SHEET_H} />
          <SheetContent model={model} diagram={shown} geom={geom} showFrame={showFrame} interactive hiddenLabel={editing?.kind === 'arrow' ? editing.id : null} />
          {showGrid && (
            <rect x={AREA.x} y={AREA.y} width={AREA.w} height={AREA.h} fill="url(#dots)" pointerEvents="none" opacity={0.9} style={{ mixBlendMode: 'multiply' }} />
          )}
          <Overlay diagram={diagram} geom={geom} baseGeom={baseGeom} geomById={geomById} sel={sel} tool={tool} zoom={zoom} hover={hover} gesture={gesture} />
        </g>
      </svg>

      {editing && <InlineEditor key={editing.kind + editing.id} editing={editing} model={model} diagram={diagram} view={view} geomById={geomById} />}

      <ToolDock tool={tool} notation={diagram.notation} nodeKind={nodeKind} canGoUp={!!diagram.parent} />
      <Crumbs />
      {diagram.arrows.length === 0 && !gesture && <Hint notation={diagram.notation} root={isContext(diagram)} empty={diagram.boxes.length === 0} />}
    </div>
  );
}
