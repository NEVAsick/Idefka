import type { Arrow, Box, Diagram, Endpoint, Pt } from '../../model/types';
import { computeAnchors, layoutArrowLabel, type ArrowGeom } from '../../model/geometry';
import { projectOnPath } from '../../model/path';
import { removeJogs } from '../../model/router';
import { AREA, GRID, snap, snapBox } from '../../model/sheet';
import { clamp, uid } from '../../model/ops';
import { carriesContent, isContainer, isLifeline, KINDS, lifelineHead } from '../../model/notation';
import { defaultLink } from '../../model/links';
import { CONTEXT_ROLE_HINT, contextArrowRoles, dependents } from '../../model/query';
import { commit, getState, live, select, setState, toast } from '../../store';
import { borderEndAt, carries, lifelineOf, resolveEnd, resolveMessageEnd, type End, type HitContext } from './hitTest';

export type Gesture =
  | { kind: 'pan'; startX: number; startY: number; viewX: number; viewY: number }
  | { kind: 'move'; start: Pt; origin: Record<string, Pt>; messageY: Record<string, number>; moved: boolean }
  | { kind: 'resize'; boxId: string; start: Pt; width: number; height: number; moved: boolean }
  | { kind: 'arrow-press'; arrowId: string; start: Pt }
  | { kind: 'segment'; arrowId: string; points: Pt[]; index: number; horizontal: boolean; start: Pt }
  | { kind: 'new-arrow'; role: End; arrow: Arrow; exclude?: string; skipArrows: Set<string>; start: Pt; moved: boolean; message?: boolean; reconnect?: boolean; invalidRole?: boolean }
  | { kind: 'reconnect'; arrowId: string; end: End; moved: boolean }
  | { kind: 'label'; arrowId: string; start: Pt; dx: number; dy: number; moved: boolean }
  | { kind: 'label-resize'; geometry: ArrowGeom; start: Pt; moved: boolean }
  | { kind: 'message-move'; arrowId: string; startY: number; start: Pt; moved: boolean }
  | { kind: 'activation-press'; boxId: string; start: Pt }
  | { kind: 'marquee'; start: Pt; current: Pt; additive: boolean };

export type NewArrowGesture = Extract<Gesture, { kind: 'new-arrow' }>;
type MoveGesture = Extract<Gesture, { kind: 'move' }>;

const NO_ARROWS = new Set<string>();

const draftArrow = (from: Endpoint, to: Endpoint): Arrow => ({ id: uid('a'), label: '', note: '', from, to });

const currentDiagram = (draft: { diagrams: Record<string, Diagram> }) => draft.diagrams[getState().diagramId];
const findArrow = (diagram: Diagram, id: string) => diagram.arrows.find((a) => a.id === id);

export function newArrowFrom(from: Endpoint, start: Pt, exclude?: string, skipArrows = NO_ARROWS): NewArrowGesture {
  return { kind: 'new-arrow', role: 'to', exclude, skipArrows, start, moved: false, arrow: draftArrow(from, { t: 'free', x: start.x, y: start.y }) };
}

export function newArrowTo(to: Endpoint, start: Pt, exclude?: string): NewArrowGesture {
  return { kind: 'new-arrow', role: 'from', exclude, skipArrows: NO_ARROWS, start, moved: false, arrow: draftArrow({ t: 'free', x: start.x, y: start.y }, to) };
}

export function newMessage(lifeline: Box, start: Pt, pointer: Pt, moved = false): NewArrowGesture {
  const y = clamp(snap(start.y), lifeline.y + lifelineHead(lifeline.kind) + 8, lifeline.y + lifeline.h - 8);
  const arrow: Arrow = { ...draftArrow({ t: 'box', box: lifeline.id, side: 'right' }, { t: 'free', x: pointer.x, y }), seqY: y };
  return { kind: 'new-arrow', role: 'to', skipArrows: NO_ARROWS, start, moved, arrow, message: true };
}

export function startContextReconnect(diagram: Diagram, arrow: Arrow, role: End, start: Pt): NewArrowGesture {
  return { kind: 'new-arrow', role, arrow: { ...arrow, route: undefined }, start, skipArrows: dependents(diagram, arrow.id), moved: false, reconnect: true };
}

function arrowAtPointer(gesture: NewArrowGesture, point: Pt, context: HitContext) {
  const { arrow, role, skipArrows } = gesture;
  let end: Endpoint;
  if (gesture.message) end = resolveMessageEnd(context.diagram, point, arrow.seqY!);
  else if (gesture.reconnect) end = reconnectedEnd(arrow, role, point, context, skipArrows);
  else end = resolveEnd(context, role, point, gesture.exclude, skipArrows);
  const candidate: Arrow = { ...arrow, [role]: end };
  // Старую схему с несколькими конфликтами можно исправлять, отсоединяя по одному концу.
  const detaching = gesture.reconnect && end.t === 'free';
  const invalidRole = !detaching && contextArrowRoles(context.diagram, candidate).get(candidate.id) === 'conflict';
  return { arrow: candidate, invalidRole };
}

export function withPreviewEnd(gesture: NewArrowGesture, point: Pt, context: HitContext, far: boolean): NewArrowGesture {
  const { arrow, invalidRole } = arrowAtPointer(gesture, point, context);
  if (invalidRole || arrow[gesture.role].t === 'free') arrow[gesture.role] = { t: 'free', x: point.x, y: gesture.message ? arrow.seqY! : point.y };
  return { ...gesture, moved: gesture.moved || far, arrow, invalidRole };
}

export function startMove(diagram: Diagram, selectedIds: string[], start: Pt): MoveGesture {
  const origin: Record<string, Pt> = {};
  const add = (box: Box) => (origin[box.id] ??= { x: box.x, y: box.y });

  for (const box of diagram.boxes) if (selectedIds.includes(box.id)) add(box);

  for (const container of diagram.boxes.filter((b) => selectedIds.includes(b.id) && carriesContent(b.kind))) {
    for (const box of diagram.boxes) if (box.id !== container.id && carries(container, box)) add(box);
  }

  const movingLifelines = diagram.boxes.filter((b) => origin[b.id] && isLifeline(b.kind));
  for (const lifeline of movingLifelines) {
    for (const box of diagram.boxes) if (box.kind === 'activation' && lifelineOf(diagram, box)?.id === lifeline.id) add(box);
  }

  const messageY: Record<string, number> = {};
  for (const arrow of diagram.arrows) {
    const bothEndsMove = arrow.from.t === 'box' && arrow.to.t === 'box' && origin[arrow.from.box] && origin[arrow.to.box];
    if (arrow.seqY !== undefined && bothEndsMove) messageY[arrow.id] = arrow.seqY;
  }
  return { kind: 'move', start, origin, messageY, moved: false };
}

function keepOnSheet(diagram: Diagram, gesture: MoveGesture, delta: Pt): Pt {
  let { x, y } = delta;
  for (const box of diagram.boxes) {
    const from = gesture.origin[box.id];
    if (!from) continue;
    x = clamp(x, AREA.x + 4 - from.x, AREA.x + AREA.w - box.w - 4 - from.x);
    y = clamp(y, AREA.y + 4 - from.y, AREA.y + AREA.h - box.h - 4 - from.y);
  }
  return { x, y };
}

function shiftBoxes(diagram: Diagram, gesture: MoveGesture, wanted: Pt) {
  const delta = keepOnSheet(diagram, gesture, wanted);
  for (const box of diagram.boxes) {
    const from = gesture.origin[box.id];
    if (!from) continue;
    const x = isContainer(box.kind) ? snap(from.x + delta.x) : snapBox(from.x + delta.x, box.w);
    const y = isContainer(box.kind) ? snap(from.y + delta.y) : snapBox(from.y + delta.y, box.h);
    box.x = clamp(x, AREA.x + 4, AREA.x + AREA.w - box.w - 4);
    box.y = clamp(y, AREA.y + 4, AREA.y + AREA.h - box.h - 4);

    if (box.kind === 'activation') {
      const lifeline = lifelineOf(diagram, box);
      if (lifeline && !gesture.origin[lifeline.id]) box.x = lifeline.x + lifeline.w / 2 - box.w / 2;
    }
  }

  for (const arrow of diagram.arrows) {
    const startY = gesture.messageY[arrow.id];
    if (startY === undefined || arrow.from.t !== 'box') continue;
    const sourceId = arrow.from.box;
    const source = diagram.boxes.find((b) => b.id === sourceId);
    if (source && gesture.origin[source.id]) arrow.seqY = startY + (source.y - gesture.origin[source.id].y);
  }
}

export function moveBoxes(gesture: MoveGesture, delta: Pt) {
  live((draft) => shiftBoxes(currentDiagram(draft), gesture, delta));
}

export function nudgeBoxes(selectedIds: string[], delta: Pt) {
  const { model, diagramId } = getState();
  const gesture = startMove(model.diagrams[diagramId], selectedIds, { x: 0, y: 0 });
  commit((draft) => shiftBoxes(currentDiagram(draft), gesture, delta), 'nudge');
}

function stepFit(start: number, change: number, min: number, max: number, step: number) {
  let value = start + Math.round(change / step) * step;
  while (value < min) value += step;
  while (value > max && value - step >= min) value -= step;
  return value;
}

export function resizeBox(gesture: Extract<Gesture, { kind: 'resize' }>, delta: Pt) {
  live((draft) => {
    const box = currentDiagram(draft).boxes.find((b) => b.id === gesture.boxId);
    if (!box) return false;
    const minWidth = KINDS[box.kind].minW ?? 72;
    const minHeight = KINDS[box.kind].minH ?? 32;
    const maxWidth = AREA.x + AREA.w - box.x - 4;
    const maxHeight = AREA.y + AREA.h - box.y - 4;
    if (isContainer(box.kind)) {
      box.w = clamp(snap(gesture.width + delta.x), minWidth, maxWidth);
      box.h = clamp(snap(gesture.height + delta.y), minHeight, maxHeight);
    } else {
      box.w = stepFit(gesture.width, delta.x, minWidth, maxWidth, GRID * 2);
      box.h = stepFit(gesture.height, delta.y, minHeight, maxHeight, GRID * 2);
    }
  });
}

function stubPoint(from: Pt, toward: Pt): Pt {
  const length = Math.hypot(toward.x - from.x, toward.y - from.y) || 1;
  const t = Math.min(18, length / 3) / length;
  return { x: Math.round(from.x + (toward.x - from.x) * t), y: Math.round(from.y + (toward.y - from.y) * t) };
}

export function startSegmentDrag(arrowId: string, path: Pt[], at: Pt): Extract<Gesture, { kind: 'segment' }> | null {
  if (path.length < 2) return null;

  let index = 0;
  let nearest = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const hit = projectOnPath([path[i], path[i + 1]], at);
    if (hit.distance < nearest) {
      nearest = hit.distance;
      index = i;
    }
  }
  const horizontal = Math.abs(path[index].y - path[index + 1].y) < 0.5;

  let points = path.map((p) => ({ ...p }));
  const last = points.length - 1;
  if (points.length === 2) {
    const a = stubPoint(points[0], points[1]);
    const b = stubPoint(points[1], points[0]);
    points = [points[0], a, { ...a }, { ...b }, b, points[1]];
    index = 2;
  } else if (index === 0) {
    const a = stubPoint(points[0], points[1]);
    points = [points[0], a, { ...a }, ...points.slice(1)];
    index = 2;
  } else if (index === last - 1) {
    const b = stubPoint(points[last], points[last - 1]);
    points = [...points.slice(0, last), { ...b }, b, points[last]];
  }
  return { kind: 'segment', arrowId, points, index, horizontal, start: at };
}

export function dragSegment(gesture: Extract<Gesture, { kind: 'segment' }>, delta: Pt, zoom: number) {
  const { points, index, horizontal } = gesture;
  const axis = horizontal ? 'y' : 'x';
  const wanted = points[index][axis] + (horizontal ? delta.y : delta.x);

  const parallels: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    if (i === index) continue;
    const segmentHorizontal = Math.abs(points[i].y - points[i + 1].y) < 0.5;
    if (segmentHorizontal === horizontal) parallels.push(points[i][axis]);
  }

  let value = snap(wanted);
  let closest = 10 / zoom;
  for (const candidate of parallels) {
    if (Math.abs(candidate - wanted) < closest) {
      closest = Math.abs(candidate - wanted);
      value = candidate;
    }
  }
  value = horizontal ? clamp(value, AREA.y + 4, AREA.y + AREA.h - 4) : clamp(value, AREA.x + 4, AREA.x + AREA.w - 4);

  const moved = points.map((p) => ({ ...p }));
  moved[index][axis] = value;
  moved[index + 1][axis] = value;
  live((draft) => {
    const arrow = findArrow(currentDiagram(draft), gesture.arrowId);
    if (!arrow) return false;
    arrow.route = moved.slice(1, -1);
  });
}

export function finishSegmentDrag(gesture: Extract<Gesture, { kind: 'segment' }>) {
  live((draft) => {
    const arrow = findArrow(currentDiagram(draft), gesture.arrowId);
    if (!arrow?.route) return false;
    const { points } = gesture;
    const bends = removeJogs([points[0], ...arrow.route, points[points.length - 1]]).slice(1, -1);
    if (bends.length) arrow.route = bends;
    else delete arrow.route;
  });
}

export function moveMessage(gesture: Extract<Gesture, { kind: 'message-move' }>, dy: number) {
  live((draft) => {
    const diagram = currentDiagram(draft);
    const arrow = findArrow(diagram, gesture.arrowId);
    if (!arrow) return false;
    const from = arrow.from;
    const source = from.t === 'box' ? diagram.boxes.find((b) => b.id === from.box) : undefined;
    const top = source ? source.y + lifelineHead(source.kind) + 8 : AREA.y + 8;
    const bottom = source ? source.y + source.h - 8 : AREA.y + AREA.h - 8;
    arrow.seqY = clamp(snap(gesture.startY + dy), top, bottom);
  });
}

export function moveLabel(gesture: Extract<Gesture, { kind: 'label' }>, delta: Pt) {
  live((draft) => {
    const arrow = findArrow(currentDiagram(draft), gesture.arrowId);
    if (!arrow) return false;
    arrow.labelDx = Math.round(gesture.dx + delta.x);
    arrow.labelDy = Math.round(gesture.dy + delta.y);
  });
}

export function resizeLabel(geometry: ArrowGeom, delta: Pt) {
  const { labelBox, id, points, label } = geometry;
  live((draft) => {
    const arrow = findArrow(currentDiagram(draft), id);
    if (!arrow) return false;
    arrow.labelWidth = Math.max(1, labelBox.x2 - labelBox.x1 + delta.x);
    arrow.labelHeight = Math.max(1, labelBox.y2 - labelBox.y1 + delta.y);
    // Угол напротив маркера остаётся на месте даже при переносе строк и смене выравнивания.
    const layout = layoutArrowLabel(points, label, { ...arrow, labelDx: 0, labelDy: 0 });
    arrow.labelDx = labelBox.x1 - layout.labelBox.x1;
    arrow.labelDy = labelBox.y1 - layout.labelBox.y1;
  });
}

function reconnectedEnd(arrow: Arrow, role: End, point: Pt, context: HitContext, skipArrows: Set<string>): Endpoint {
  const diagram = context.diagram;
  const otherRole = role === 'from' ? 'to' : 'from';
  const other = arrow[otherRole];
  let end =
    arrow.seqY !== undefined
      ? resolveMessageEnd(diagram, point, arrow.seqY)
      : resolveEnd(context, role, point, other.t === 'box' ? other.box : undefined, skipArrows);

  const current = arrow[role];
  if (arrow.parent && current.t === 'border') {
    const vertical = current.side === 'left' || current.side === 'right';
    const along = vertical ? point.y : point.x;
    end = borderEndAt(current.side, snap(along));
  }
  if (end.t !== 'border') return end;
  let at = end.at;
  if (other.t === 'box' && other.side === end.side) {
    // Перестановка двух стрелок на рамке может поменять их порты на блоке.
    const arrows = diagram.arrows.map((a) => a.id === arrow.id ? { ...a, [role]: end } : a);
    const port = computeAnchors(getState().model, { ...diagram, arrows }).get(arrow.id)?.[otherRole];
    const axis = end.side === 'left' || end.side === 'right' ? 'y' : 'x';
    if (port && Math.abs(port[axis] - point[axis]) <= GRID) at = port[axis];
  }
  return { ...borderEndAt(end.side, at), fixed: true };
}

function replaceEnd(diagram: Diagram, id: string, role: End, end: Endpoint) {
  const target = findArrow(diagram, id);
  if (!target) return false;
  target[role] = end;
  delete target.route;
}

export function reconnectEnd(gesture: Extract<Gesture, { kind: 'reconnect' }>, diagram: Diagram, point: Pt, context: HitContext, skipArrows: Set<string>) {
  const arrow = findArrow(diagram, gesture.arrowId);
  if (!arrow) return;
  const end = reconnectedEnd(arrow, gesture.end, point, context, skipArrows);
  live((draft) => replaceEnd(currentDiagram(draft), arrow.id, gesture.end, end));
}

function addMessage(diagram: Diagram, gesture: NewArrowGesture, point: Pt) {
  const arrow = gesture.arrow;
  const { from } = arrow;
  const target = resolveMessageEnd(diagram, point, arrow.seqY!);
  const source = from.t === 'box' ? diagram.boxes.find((b) => b.id === from.box) : undefined;
  const receiver = target.t === 'box' ? diagram.boxes.find((b) => b.id === target.box) : undefined;
  if (!source || !receiver) {
    toast('Отпустите сообщение на пунктире линии жизни.');
    return;
  }

  const rightward = receiver.x + receiver.w / 2 >= source.x + source.w / 2;
  const id = uid('a');
  commit((draft) => {
    currentDiagram(draft).arrows.push({
      ...arrow,
      id,
      from: { t: 'box', box: source.id, side: rightward ? 'right' : 'left' },
      to: { t: 'box', box: receiver.id, side: rightward ? 'left' : 'right' },
      link: 'sync',
    });
  });
  select({ arrows: [id] });
  setState({ editing: { kind: 'arrow', id } });
}

function refusal(arrow: Arrow): string | null {
  const { from, to } = arrow;
  if (from.t === 'free' && to.t === 'free') return 'Начните или закончите стрелку на работе, на другой стрелке или на границе диаграммы.';
  if (from.t === 'box' && to.t === 'box' && from.box === to.box) return 'Стрелка не может выходить из узла и входить в него же.';
  if (from.t === 'tap' && to.t === 'tap') return 'Ветвь должна вести к работе или к границе диаграммы.';
  return null;
}

function asksForLabel(diagram: Diagram, arrow: Arrow) {
  const from = arrow.from;
  const fromKind = from.t === 'box' ? diagram.boxes.find((b) => b.id === from.box)?.kind : undefined;
  const fromChoice = (diagram.notation === 'bpmn' && fromKind === 'gateway') || (diagram.notation === 'activity' && fromKind === 'decision');
  return diagram.notation === 'idef0' || diagram.notation === 'dfd' || fromChoice;
}

export function finishNewArrow(gesture: NewArrowGesture, diagram: Diagram, point: Pt, context: HitContext) {
  if (gesture.message) {
    addMessage(diagram, gesture, point);
    return;
  }

  const { arrow, invalidRole } = arrowAtPointer(gesture, point, context);
  const problem = invalidRole ? CONTEXT_ROLE_HINT : refusal(arrow);
  if (problem) {
    toast(problem);
    return;
  }

  if (gesture.reconnect) {
    commit((draft) => replaceEnd(currentDiagram(draft), arrow.id, gesture.role, arrow[gesture.role]));
    return;
  }
  const link = defaultLink(diagram, arrow);
  if (link) arrow.link = link;
  commit((draft) => {
    currentDiagram(draft).arrows.push(arrow);
  });
  select({ arrows: [arrow.id] });

  const branch = arrow.from.t === 'tap';
  const join = arrow.to.t === 'tap';
  if (!arrow.label && !branch && !join && asksForLabel(diagram, arrow)) setState({ editing: { kind: 'arrow', id: arrow.id } });
  if (branch) toast('Ветвь создана. Название берётся от основной стрелки — его можно изменить.');
  else if (join) toast('Стрелки слиты.');
}

export function selectInMarquee(gesture: Extract<Gesture, { kind: 'marquee' }>, diagram: Diagram, geom: ArrowGeom[]) {
  const left = Math.min(gesture.start.x, gesture.current.x);
  const right = Math.max(gesture.start.x, gesture.current.x);
  const top = Math.min(gesture.start.y, gesture.current.y);
  const bottom = Math.max(gesture.start.y, gesture.current.y);
  if (right - left < 3 && bottom - top < 3) return;

  const boxes = diagram.boxes.filter((b) => b.x < right && b.x + b.w > left && b.y < bottom && b.y + b.h > top).map((b) => b.id);
  const arrows = geom.filter((g) => g.points.every((p) => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom)).map((g) => g.id);
  const previous = gesture.additive ? getState().sel : { boxes: [], arrows: [] };
  select({ boxes: [...new Set([...previous.boxes, ...boxes])], arrows: [...new Set([...previous.arrows, ...arrows])] });
}
