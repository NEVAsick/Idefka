import type { Arrow, Box, Diagram, Endpoint, LinkKind, Model, NodeKind, Notation, Pt, Side } from './types';
import { FORMAT, VERSION } from './types';
import { AREA, snap, snapBox } from './sheet';
import { borderPoint, computeAnchors, type Anchors } from './geometry';
import { invalidateIndex, isContext, labelOf } from './query';
import { isContainer, isLifeline, KINDS, lifelineHead, NOTATIONS, NOTATION_LIST } from './notation';

let counter = 0;

export function uid(prefix: string) {
  const time = Date.now().toString(36);
  const sequence = (counter++).toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return prefix + time + sequence + random;
}

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const emptyDiagram = (notation: Notation): Diagram => ({ id: uid('d'), notation, status: 'working', boxes: [], arrows: [] });

export function newModel(name = 'Новая модель', author = ''): Model {
  const roots = {} as Record<Notation, string>;
  const diagrams: Record<string, Diagram> = {};
  for (const notation of NOTATION_LIST) {
    const diagram = emptyDiagram(notation);
    roots[notation] = diagram.id;
    diagrams[diagram.id] = diagram;
  }

  const width = 248;
  const height = 136;
  diagrams[roots.idef0].boxes.push({
    id: uid('b'),
    kind: 'activity',
    name: 'Основная работа',
    note: '',
    x: snap(AREA.x + AREA.w / 2 - width / 2),
    y: snap(AREA.y + AREA.h / 2 - height / 2 - 24),
    w: width,
    h: height,
  });

  const now = new Date().toISOString();
  return {
    format: FORMAT,
    version: VERSION,
    meta: { name, author, purpose: '', viewpoint: '', created: now, modified: now },
    abc: { currency: '₽', timeUnit: 'ч', centers: [], show: false },
    roots,
    diagrams,
  };
}

function placeOnSheet(kind: NodeKind, center: number, size: number, areaStart: number, areaSize: number) {
  const start = clamp(center - size / 2, areaStart + 16, areaStart + areaSize - size - 16);
  return isContainer(kind) ? snap(start) : snapBox(start, size);
}

function makeBox(kind: NodeKind, cx: number, cy: number, name?: string): Box {
  const info = KINDS[kind];
  const box: Box = {
    id: uid('b'),
    kind,
    name: name ?? info.defaultName,
    note: '',
    w: info.w,
    h: info.h,
    x: placeOnSheet(kind, cx, info.w, AREA.x, AREA.w),
    y: placeOnSheet(kind, cy, info.h, AREA.y, AREA.h),
  };

  switch (kind) {
    case 'junction':
      box.junction = 'xor';
      box.sync = false;
      break;
    case 'startEvent':
    case 'intermediateEvent':
    case 'endEvent':
      box.trigger = 'none';
      break;
    case 'gateway':
      box.gateway = 'xor';
      break;
    case 'epcConnector':
      box.junction = 'xor';
      break;
    case 'fragment':
      box.stereotype = 'alt';
      break;
    case 'entity':
      box.keys = 'id';
      break;
    case 'class':
      box.attrs = '';
      box.ops = '';
      break;
  }
  return box;
}

function connect(from: Box, fromSide: Side, to: Box, toSide: Side, link: LinkKind): Arrow {
  return {
    id: uid('a'),
    label: '',
    note: '',
    link,
    from: { t: 'box', box: from.id, side: fromSide },
    to: { t: 'box', box: to.id, side: toSide },
  };
}

function layOutInColumns(items: Box[], link: LinkKind): Arrow[] {
  const gap = 28;
  const top = AREA.y + 32;
  const bottom = AREA.y + AREA.h - 32;

  const columns: Box[][] = [[]];
  let y = top;
  for (const box of items) {
    const column = columns[columns.length - 1];
    if (column.length && y + box.h > bottom) {
      columns.push([]);
      y = top;
    }
    columns[columns.length - 1].push(box);
    y += box.h + gap;
  }

  const widest = Math.max(...items.map((b) => b.w));
  const columnWidth = widest + 120;
  const left = AREA.x + (AREA.w - (columns.length * columnWidth - 120)) / 2;

  const columnOf = new Map<string, number>();
  columns.forEach((column, index) => {
    const centerX = left + index * columnWidth + widest / 2;
    const columnHeight = column.reduce((sum, b) => sum + b.h, 0) + gap * (column.length - 1);
    let boxTop = top + Math.max(0, (bottom - top - columnHeight) / 2);
    for (const box of column) {
      box.x = snapBox(centerX - box.w / 2, box.w);
      box.y = snapBox(boxTop, box.h);
      boxTop += box.h + gap;
      columnOf.set(box.id, index);
    }
  });

  const arrows: Arrow[] = [];
  for (let i = 0; i + 1 < items.length; i++) {
    const sameColumn = columnOf.get(items[i].id) === columnOf.get(items[i + 1].id);
    arrows.push(sameColumn ? connect(items[i], 'bottom', items[i + 1], 'top', link) : connect(items[i], 'right', items[i + 1], 'left', link));
  }
  return arrows;
}

function layOutInRow(items: Box[], link: LinkKind): Arrow[] {
  const centerY = AREA.y + AREA.h / 2;
  const totalWidth = items.reduce((sum, b) => sum + b.w, 0);
  const gap = clamp((AREA.w - 120 - totalWidth) / (items.length - 1), 32, 90);
  let x = AREA.x + (AREA.w - totalWidth - gap * (items.length - 1)) / 2;
  for (const box of items) {
    box.x = snapBox(x, box.w);
    box.y = snap(centerY) - box.h / 2;
    x += box.w + gap;
  }
  return items.slice(1).map((box, i) => connect(items[i], 'right', box, 'left', link));
}

const inside = (point: Pt, box: Box, extraBottom = 0) =>
  point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h + extraBottom;

function fitLaneIntoPool(diagram: Diagram, lane: Box, click: Pt) {
  const pool = diagram.boxes.find((p) => p.kind === 'pool' && inside(click, p));
  if (!pool) return;
  lane.x = pool.x + 32;
  lane.w = pool.w - 32;
  lane.h = Math.min(lane.h, pool.h);
  lane.y = snap(clamp(click.y - lane.h / 2, pool.y, pool.y + pool.h - lane.h));
}

function putActivationOnLifeline(diagram: Diagram, activation: Box, click: Pt) {
  const lifeline = diagram.boxes.find((l) => isLifeline(l.kind) && inside(click, l, 40));
  if (!lifeline) return;
  activation.x = lifeline.x + lifeline.w / 2 - activation.w / 2;
  activation.y = Math.max(lifeline.y + lifelineHead(lifeline.kind) + 8, activation.y);
}

function alignLifelineTop(diagram: Diagram, lifeline: Box) {
  const other = diagram.boxes.find((l) => isLifeline(l.kind));
  lifeline.y = other ? other.y : AREA.y + 24;
}

export function addBox(model: Model, diagramId: string, kind: NodeKind, cx: number, cy: number): string | null {
  const diagram = model.diagrams[diagramId];
  const contextAlreadyHasActivity = isContext(diagram) && kind === 'activity' && diagram.boxes.some((b) => b.kind === 'activity');
  if (contextAlreadyHasActivity) return null;
  if (!NOTATIONS[diagram.notation].kinds.includes(kind)) return null;

  const box = makeBox(kind, cx, cy);
  const click = { x: cx, y: cy };
  if (kind === 'lane') fitLaneIntoPool(diagram, box, click);
  if (kind === 'activation') putActivationOnLifeline(diagram, box, click);
  if (isLifeline(kind)) alignLifelineTop(diagram, box);

  if (isContainer(kind)) diagram.boxes.unshift(box);
  else diagram.boxes.push(box);
  return box.id;
}

function epcChain(count: number): Box[] {
  const items = [makeBox('epcEvent', 0, 0, 'Начальное событие')];
  for (let i = 1; i <= count; i++) {
    items.push(makeBox('epcFunction', 0, 0, `Функция ${i}`));
    items.push(makeBox('epcEvent', 0, 0, i === count ? 'Конечное событие' : `Событие ${i}`));
  }
  return items;
}

function activityChain(count: number): Box[] {
  const actions = Array.from({ length: count }, (_, i) => makeBox('action', 0, 0, `Действие ${i + 1}`));
  return [makeBox('initialNode', 0, 0), ...actions, makeBox('finalNode', 0, 0)];
}

function bpmnChain(count: number): Box[] {
  const tasks = Array.from({ length: count }, (_, i) => makeBox('task', 0, 0, `Задача ${i + 1}`));
  return [makeBox('startEvent', 0, 0), ...tasks, makeBox('endEvent', 0, 0)];
}

const CHILD_KIND: Partial<Record<Notation, NodeKind>> = { idef0: 'activity', dfd: 'process', idef3: 'uow' };

function staircase(notation: Notation, count: number): Box[] {
  const kind = CHILD_KIND[notation] ?? 'uow';
  const info = KINDS[kind];
  const left = AREA.x + 120;
  const top = AREA.y + 60;
  const right = AREA.x + AREA.w - 120 - info.w;
  const bottom = AREA.y + AREA.h - 70 - info.h;

  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const cx = left + (right - left) * t + info.w / 2;
    const cy = notation === 'idef3' ? AREA.y + AREA.h / 2 : top + (bottom - top) * t + info.h / 2;
    return makeBox(kind, cx, cy, `${info.title} ${i + 1}`);
  });
}

function childContent(notation: Notation, count: number): { boxes: Box[]; arrows: Arrow[] } {
  switch (notation) {
    case 'epc': {
      const boxes = epcChain(count);
      return { boxes, arrows: layOutInColumns(boxes, 'control') };
    }
    case 'activity': {
      const boxes = activityChain(count);
      return { boxes, arrows: layOutInColumns(boxes, 'flow') };
    }
    case 'bpmn': {
      const boxes = bpmnChain(count);
      return { boxes, arrows: layOutInRow(boxes, 'sequence') };
    }
    default:
      return { boxes: staircase(notation, count), arrows: [] };
  }
}

export function decompose(model: Model, diagramId: string, boxId: string, count: number): string | null {
  const diagram = model.diagrams[diagramId];
  const box = diagram?.boxes.find((b) => b.id === boxId);
  if (!box) return null;
  if (box.child) return box.child;

  const { boxes, arrows } = childContent(diagram.notation, clamp(Math.round(count), 1, 9));
  const child: Diagram = {
    id: uid('d'),
    notation: diagram.notation,
    parent: { diagram: diagramId, box: boxId },
    status: 'working',
    boxes,
    arrows,
  };
  model.diagrams[child.id] = child;
  box.child = child.id;
  return child.id;
}

function deleteDiagram(model: Model, id: string) {
  const diagram = model.diagrams[id];
  if (!diagram) return;
  delete model.diagrams[id];
  for (const box of diagram.boxes) if (box.child) deleteDiagram(model, box.child);
}

export function removeDecomposition(model: Model, diagramId: string, boxId: string) {
  const box = model.diagrams[diagramId]?.boxes.find((b) => b.id === boxId);
  if (!box?.child) return;
  deleteDiagram(model, box.child);
  delete box.child;
}

const freeAt = (point?: Pt): Endpoint => ({ t: 'free', x: point?.x ?? AREA.x + 40, y: point?.y ?? AREA.y + 40 });

const endsAt = (end: Endpoint, ids: Set<string>) => end.t === 'box' && ids.has(end.box);

function branchesOf(diagram: Diagram, roots: Set<string>): Set<string> {
  const found = new Set(roots);
  const tapsFound = (end: Endpoint) => end.t === 'tap' && found.has(end.arrow);
  for (let grew = true; grew; ) {
    grew = false;
    for (const arrow of diagram.arrows) {
      if (found.has(arrow.id) || arrow.parent || !(tapsFound(arrow.from) || tapsFound(arrow.to))) continue;
      found.add(arrow.id);
      grew = true;
    }
  }
  return found;
}

export function deleteItems(model: Model, diagramId: string, boxIds: string[], arrowIds: string[]): string | null {
  const diagram = model.diagrams[diagramId];
  let warning: string | null = null;

  if (isContext(diagram)) {
    const isActivity = (id: string) => diagram.boxes.find((b) => b.id === id)?.kind === 'activity';
    if (boxIds.some(isActivity)) {
      warning = 'На контекстной диаграмме A-0 всегда одна работа — её нельзя удалить.';
      boxIds = boxIds.filter((id) => !isActivity(id));
    }
  }

  const removedArrows = new Set<string>();
  const tunneled = new Set<string>();
  const tunneledNames: string[] = [];
  for (const id of arrowIds) {
    const arrow = diagram.arrows.find((a) => a.id === id);
    if (!arrow) continue;
    if (!arrow.parent) {
      removedArrows.add(id);
      continue;
    }
    const parentArrow = diagram.parent && model.diagrams[diagram.parent.diagram]?.arrows.find((a) => a.id === arrow.parent);
    if (diagram.notation === 'idef0' && parentArrow) {
      parentArrow.tunnel = true;
      tunneled.add(id);
      tunneledNames.push(labelOf(model, parentArrow).trim());
    } else {
      warning = 'Граничная стрелка приходит с родительской диаграммы — удалите её там.';
    }
  }
  if (tunneledNames.length) {
    for (const branch of branchesOf(diagram, tunneled)) removedArrows.add(branch);
    const named = tunneledNames.filter(Boolean).map((name) => `«${name}»`);
    const what = tunneledNames.length > 1 ? 'Стрелки убраны' : named.length ? `Стрелка ${named[0]} убрана` : 'Стрелка убрана';
    warning = `${what} в туннель: на родительской диаграмме у блока появились скобки. Вернуть — Ctrl+Z или снять «В туннель» у стрелки на родительской диаграмме.`;
  }

  const anchors = computeAnchors(model, diagram);
  const removedBoxes = new Set(boxIds);
  for (const box of diagram.boxes) if (removedBoxes.has(box.id) && box.child) deleteDiagram(model, box.child);
  diagram.boxes = diagram.boxes.filter((b) => !removedBoxes.has(b.id));

  const kept: Arrow[] = [];
  for (const arrow of diagram.arrows) {
    if (removedArrows.has(arrow.id)) continue;
    const touchesRemoved = endsAt(arrow.from, removedBoxes) || endsAt(arrow.to, removedBoxes);
    if (arrow.seqY !== undefined && touchesRemoved) continue;

    const anchor = anchors.get(arrow.id);
    if (endsAt(arrow.from, removedBoxes)) arrow.from = freeAt(anchor?.from);
    if (endsAt(arrow.to, removedBoxes)) arrow.to = freeAt(anchor?.to);
    if (arrow.from.t === 'free' && arrow.to.t === 'free' && !arrow.parent) continue;
    kept.push(arrow);
  }
  diagram.arrows = kept;
  return warning;
}

const BOUNDARY_NOTATIONS: Notation[] = ['idef0', 'dfd', 'idef3'];
const INWARD: Record<Side, Pt> = { left: { x: 90, y: 0 }, right: { x: -90, y: 0 }, top: { x: 0, y: 70 }, bottom: { x: 0, y: -70 } };
const isVertical = (side: Side) => side === 'left' || side === 'right';

type BorderEnd = Extract<Endpoint, { t: 'border' }>;

function borderEndFor(box: Box, side: Side, anchor: Pt | undefined): BorderEnd {
  let ratio = 0.5;
  if (anchor) ratio = isVertical(side) ? (anchor.y - box.y) / box.h : (anchor.x - box.x) / box.w;
  ratio = clamp(ratio, 0.05, 0.95);
  const at = snap(isVertical(side) ? AREA.y + AREA.h * ratio : AREA.x + AREA.w * ratio);
  return { t: 'border', side, at };
}

// Граничные стрелки дочерней диаграммы — зеркало стрелок родительского блока, связаны через arrow.parent.
// Недостающие создаются, у существующих меняется только конец на рамке: трассировку пользователя не трогаем.
function syncChildBoundaries(model: Model, diagram: Diagram, box: Box, getAnchors: () => Anchors) {
  const child = model.diagrams[box.child!];
  const touchesBox = (a: Arrow) => (a.to.t === 'box' && a.to.box === box.id) || (a.from.t === 'box' && a.from.box === box.id);
  const touching = diagram.arrows.filter((a) => !a.tunnel && touchesBox(a));
  const touchingIds = new Set(touching.map((a) => a.id));
  const tunneled = new Set(diagram.arrows.filter((a) => a.tunnel).map((a) => a.id));

  child.arrows = child.arrows.filter((a) => !(a.parent && tunneled.has(a.parent) && (a.from.t === 'free' || a.to.t === 'free')));
  for (const arrow of child.arrows) if (arrow.parent && !touchingIds.has(arrow.parent)) delete arrow.parent;

  for (const parentArrow of touching) {
    const incoming = parentArrow.to.t === 'box' && parentArrow.to.box === box.id;
    const side: Side = !incoming ? 'right' : diagram.notation === 'idef0' && parentArrow.to.t === 'box' ? parentArrow.to.side : 'left';

    let childArrow = child.arrows.find((a) => a.parent === parentArrow.id);
    const childBorderEnd = childArrow && (incoming ? childArrow.from : childArrow.to);
    if (childBorderEnd?.t === 'border' && childBorderEnd.side === side) continue;

    const anchor = getAnchors().get(parentArrow.id);
    const border = borderEndFor(box, side, incoming ? anchor?.to : anchor?.from);
    const borderPt = borderPoint(side, border.at);
    const free: Endpoint = { t: 'free', x: borderPt.x + INWARD[side].x, y: borderPt.y + INWARD[side].y };

    if (!childArrow) {
      childArrow = { id: uid('a'), label: '', note: '', parent: parentArrow.id, from: incoming ? border : free, to: incoming ? free : border };
      child.arrows.push(childArrow);
    } else if (incoming) {
      childArrow.from = border;
    } else {
      childArrow.to = border;
    }
  }
}

function syncBoundaries(model: Model) {
  for (const diagram of Object.values(model.diagrams)) {
    if (!BOUNDARY_NOTATIONS.includes(diagram.notation)) continue;
    const decomposed = diagram.boxes.filter((b) => b.child && model.diagrams[b.child]);
    if (!decomposed.length) continue;

    let anchors: Anchors | null = null;
    const getAnchors = () => (anchors ??= computeAnchors(model, diagram));
    for (const box of decomposed) syncChildBoundaries(model, diagram, box, getAnchors);
  }
}

function detachMissingEnds(diagram: Diagram) {
  const boxIds = new Set(diagram.boxes.map((b) => b.id));
  const arrowIds = new Set(diagram.arrows.map((a) => a.id));

  for (const arrow of diagram.arrows) {
    const detach = (end: Endpoint): Endpoint => {
      if (end.t === 'box' && !boxIds.has(end.box)) return freeAt();
      if (end.t === 'tap' && (!arrowIds.has(end.arrow) || end.arrow === arrow.id)) return { t: 'free', x: end.x, y: end.y };
      return end;
    };
    arrow.from = detach(arrow.from);
    arrow.to = detach(arrow.to);
  }
}

export function normalize(model: Model) {
  for (const diagram of Object.values(model.diagrams)) {
    for (const box of diagram.boxes) if (box.child && !model.diagrams[box.child]) delete box.child;
    detachMissingEnds(diagram);
  }
  invalidateIndex(model);
  syncBoundaries(model);
  invalidateIndex(model);
}
