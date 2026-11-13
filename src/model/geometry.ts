import type { Arrow, Box, Diagram, Endpoint, Model, Pt, Rect, Side } from './types';
import { AREA } from './sheet';
import { labelInherited, labelOf, ROLE_BY_SIDE, type Role } from './query';
import { centerAnchored, isContainer } from './notation';
import { canBranch, linkStyle } from './links';
import { measure } from './text';
import { DOWN, isHorizontal, LEFT, LineUsage, opposite, removeJogs, RIGHT, route, STUB, UP, type Dir } from './router';
import { projectOnPath, type Bounds } from './path';

export const LABEL_SIZE = 11.5;
export const LABEL_LH = 14;

export interface ArrowGeom {
  id: string;
  points: Pt[];
  startDir: Dir;
  endDir: Dir;
  label: string;
  lines: string[];
  showLabel: boolean;
  labelAt: Pt;
  labelAnchor: 'start' | 'middle' | 'end';
  labelBox: Bounds;
  labelFar: boolean;
  danglingFrom: boolean;
  danglingTo: boolean;
  headless: boolean;
  branch: boolean;
  manual: boolean;
  tunnelAt?: { point: Pt; dir: Dir };
  icom?: { text: string; at: Pt; anchor: 'start' | 'end' };
}

type End = 'from' | 'to';
export type Anchors = Map<string, { from?: Pt; to?: Pt }>;

const OUTWARD: Record<Side, Dir> = { right: RIGHT, bottom: DOWN, left: LEFT, top: UP };
const isVerticalSide = (side: Side) => side === 'left' || side === 'right';
const center = (box: Box): Pt => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

export function borderPoint(side: Side, at: number): Pt {
  switch (side) {
    case 'left':
      return { x: AREA.x, y: at };
    case 'right':
      return { x: AREA.x + AREA.w, y: at };
    case 'top':
      return { x: at, y: AREA.y };
    case 'bottom':
      return { x: at, y: AREA.y + AREA.h };
  }
}

function sidePoint(box: Box, side: Side, ratio: number): Pt {
  switch (side) {
    case 'left':
      return { x: box.x, y: Math.round(box.y + box.h * ratio) };
    case 'right':
      return { x: box.x + box.w, y: Math.round(box.y + box.h * ratio) };
    case 'top':
      return { x: Math.round(box.x + box.w * ratio), y: box.y };
    case 'bottom':
      return { x: Math.round(box.x + box.w * ratio), y: box.y + box.h };
  }
}

interface SideItem {
  arrow: Arrow;
  end: End;
  group: string;
  otherCoord: number;
}

export function computeAnchors(model: Model, diagram: Diagram): Anchors {
  const boxes = new Map(diagram.boxes.map((b) => [b.id, b]));
  const positionOf = (end: Endpoint): Pt => {
    if (end.t === 'box') {
      const box = boxes.get(end.box);
      return box ? center(box) : { x: 0, y: 0 };
    }
    if (end.t === 'border') return borderPoint(end.side, end.at);
    return { x: end.x, y: end.y };
  };

  const itemsBySide = new Map<string, SideItem[]>();
  for (const arrow of diagram.arrows) {
    for (const end of ['from', 'to'] as End[]) {
      const endpoint = arrow[end];
      if (endpoint.t !== 'box' || !boxes.has(endpoint.box)) continue;

      const other = positionOf(end === 'from' ? arrow.to : arrow.from);
      const otherCoord = isVerticalSide(endpoint.side) ? other.y : other.x;
      // Одноимённые стрелки на одной стороне блока — ветви одного потока, у них общая точка входа или выхода.
      const label = canBranch(diagram.notation) ? labelOf(model, arrow).trim().toLowerCase() : '';
      const group = `${end}|${label || '#' + arrow.id}`;

      const key = `${endpoint.box}|${endpoint.side}`;
      const items = itemsBySide.get(key) ?? [];
      items.push({ arrow, end, group, otherCoord });
      itemsBySide.set(key, items);
    }
  }

  const anchors: Anchors = new Map();
  for (const [key, items] of itemsBySide) {
    const [boxId, side] = key.split('|') as [string, Side];
    const box = boxes.get(boxId)!;

    const groups = new Map<string, SideItem[]>();
    for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);

    const ordered = [...groups.entries()]
      .map(([group, members]) => ({ group, members, coord: members.reduce((sum, m) => sum + m.otherCoord, 0) / members.length }))
      .sort((p, q) => p.coord - q.coord || (p.group < q.group ? -1 : 1));

    ordered.forEach(({ members }, i) => {
      const ratio = centerAnchored(box.kind) ? 0.5 : (i + 1) / (ordered.length + 1);
      const point = sidePoint(box, side, ratio);
      for (const { arrow, end } of members) anchors.set(arrow.id, { ...anchors.get(arrow.id), [end]: point });
    });
  }
  return anchors;
}

function endInfo(end: Endpoint, role: End, anchor: Pt | undefined): { point: Pt; dir: Dir | null } {
  if (end.t === 'box') {
    const out = OUTWARD[end.side];
    return { point: anchor ?? { x: 0, y: 0 }, dir: role === 'from' ? out : opposite(out) };
  }
  if (end.t === 'border') {
    const out = OUTWARD[end.side];
    return { point: borderPoint(end.side, end.at), dir: role === 'from' ? opposite(out) : out };
  }
  return { point: { x: end.x, y: end.y }, dir: null };
}

function guessDir(from: Pt, to: Pt): Dir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? RIGHT : LEFT;
  return dy >= 0 ? DOWN : UP;
}

function icomCodes(model: Model, diagram: Diagram): Map<string, string> {
  const codes = new Map<string, string>();
  const parentDiagram = diagram.parent && model.diagrams[diagram.parent.diagram];
  if (!parentDiagram || parentDiagram.notation !== 'idef0') return codes;

  const boxId = diagram.parent!.box;
  const anchors = computeAnchors(model, parentDiagram);
  const byRole: Record<Role, { id: string; position: number }[]> = { I: [], C: [], O: [], M: [] };

  for (const arrow of parentDiagram.arrows) {
    const anchor = anchors.get(arrow.id);
    if (arrow.to.t === 'box' && arrow.to.box === boxId && anchor?.to) {
      const role = ROLE_BY_SIDE[arrow.to.side];
      byRole[role].push({ id: arrow.id, position: role === 'I' || role === 'O' ? anchor.to.y : anchor.to.x });
    } else if (arrow.from.t === 'box' && arrow.from.box === boxId && anchor?.from) {
      byRole.O.push({ id: arrow.id, position: anchor.from.y });
    }
  }

  for (const role of ['I', 'C', 'O', 'M'] as Role[]) {
    byRole[role].sort((p, q) => p.position - q.position).forEach((item, i) => codes.set(item.id, `${role}${i + 1}`));
  }
  return codes;
}

function effectiveEnds(arrow: Arrow, anchor: { from?: Pt; to?: Pt } | undefined): { from: Endpoint; to: Endpoint } {
  let { from, to } = arrow;
  const limit = (side: Side, value: number) =>
    isVerticalSide(side) ? Math.max(AREA.y + 8, Math.min(AREA.y + AREA.h - 8, value)) : Math.max(AREA.x + 8, Math.min(AREA.x + AREA.w - 8, value));
  const facing = (side: Side, point: Pt) => limit(side, isVerticalSide(side) ? point.y : point.x);

  if (from.t === 'border' && !from.fixed && to.t === 'box' && anchor?.to && to.side === from.side) from = { ...from, at: facing(from.side, anchor.to) };
  if (to.t === 'border' && !to.fixed && from.t === 'box' && anchor?.from && from.side === to.side) to = { ...to, at: facing(to.side, anchor.from) };
  return { from, to };
}

function applyRoute(start: Pt, startDir: Dir, bends: Pt[], end: Pt, endDir: Dir): Pt[] | null {
  const n = bends.length;
  if (!n) return null;

  const firstHorizontal = isHorizontal(startDir);
  const lastHorizontal = n % 2 === 0 ? firstHorizontal : !firstHorizontal;
  if (lastHorizontal !== isHorizontal(endDir)) return null;

  const points = bends.map((p) => ({ x: p.x, y: p.y }));
  for (let i = 0; i + 1 < n; i++) {
    const segmentHorizontal = (i + 1) % 2 === 0 ? firstHorizontal : !firstHorizontal;
    const misaligned = segmentHorizontal ? Math.abs(points[i].y - points[i + 1].y) > 0.5 : Math.abs(points[i].x - points[i + 1].x) > 0.5;
    if (misaligned) return null;
  }

  if (firstHorizontal) points[0].y = start.y;
  else points[0].x = start.x;
  if (isHorizontal(endDir)) points[n - 1].y = end.y;
  else points[n - 1].x = end.x;

  const MIN_STUB = 10;
  const axis = (dir: Dir) => (isHorizontal(dir) ? 'x' : 'y');
  const sign = (dir: Dir) => (dir === RIGHT || dir === DOWN ? 1 : -1);
  if (n >= 2) {
    const startAxis = axis(startDir);
    const startLimit = start[startAxis] + sign(startDir) * MIN_STUB;
    if (sign(startDir) * (points[0][startAxis] - startLimit) < 0) {
      points[0][startAxis] = startLimit;
      points[1][startAxis] = startLimit;
    }
    const endAxis = axis(endDir);
    const endLimit = end[endAxis] - sign(endDir) * MIN_STUB;
    if (sign(endDir) * (endLimit - points[n - 1][endAxis]) < 0) {
      points[n - 1][endAxis] = endLimit;
      points[n - 2][endAxis] = endLimit;
    }
  }

  const result = removeJogs([start, ...points, end]);
  const backwards = (a: Pt, b: Pt, dir: Dir) => sign(dir) * (b[axis(dir)] - a[axis(dir)]) < 0;
  const last = result.length - 1;
  if (result.length >= 2 && (backwards(result[0], result[1], startDir) || backwards(result[last - 1], result[last], endDir))) return null;
  return result;
}

const atLeastTwo = (points: Pt[]) => (points.length >= 2 ? points : [points[0], { ...points[0] }]);

function routingOrder(diagram: Diagram): Arrow[] {
  const ids = new Set(diagram.arrows.map((a) => a.id));
  const done = new Set<string>();
  const ordered: Arrow[] = [];
  const dependsOn = (arrow: Arrow) => [arrow.from, arrow.to].flatMap((end) => (end.t === 'tap' && ids.has(end.arrow) ? [end.arrow] : []));

  let pending = diagram.arrows.slice();
  while (pending.length) {
    const waiting: Arrow[] = [];
    for (const arrow of pending) {
      if (dependsOn(arrow).every((id) => done.has(id))) {
        ordered.push(arrow);
        done.add(arrow.id);
      } else {
        waiting.push(arrow);
      }
    }
    if (waiting.length === pending.length) {
      ordered.push(...waiting);
      break;
    }
    pending = waiting;
  }
  return ordered;
}

interface Course {
  points: Pt[];
  startDir: Dir;
  endDir: Dir;
}

function messageCourse(diagram: Diagram, arrow: Arrow, boxById: Map<string, Box>): Course | null {
  if (arrow.seqY === undefined || arrow.from.t !== 'box') return null;
  const source = boxById.get(arrow.from.box);
  if (!source) return null;
  const target = arrow.to.t === 'box' ? boxById.get(arrow.to.box) : undefined;
  const y = arrow.seqY;

  const edgeX = (box: Box, atY: number, towardX: number): number => {
    const cx = box.x + box.w / 2;
    if (box.kind === 'activation') return towardX >= cx ? box.x + box.w : box.x;
    const activations = diagram.boxes.filter(
      (a) => a.kind === 'activation' && Math.abs(a.x + a.w / 2 - cx) <= box.w / 2 && atY >= a.y - 0.5 && atY <= a.y + a.h + 0.5,
    );
    if (!activations.length) return cx;
    return towardX >= cx ? Math.max(...activations.map((a) => a.x + a.w)) : Math.min(...activations.map((a) => a.x));
  };

  if (target?.id === source.id) {
    const out = edgeX(source, y, Infinity);
    const back = edgeX(source, y + 24, Infinity);
    const loopX = Math.max(out, back) + 36;
    return {
      points: [
        { x: out, y },
        { x: loopX, y },
        { x: loopX, y: y + 24 },
        { x: back, y: y + 24 },
      ],
      startDir: RIGHT,
      endDir: LEFT,
    };
  }

  const sourceX = source.x + source.w / 2;
  const targetX = target ? target.x + target.w / 2 : arrow.to.t === 'free' ? arrow.to.x : sourceX + 80;
  const startX = edgeX(source, y, targetX);
  const endX = target ? edgeX(target, y, sourceX) : targetX;
  const dir = endX >= startX ? RIGHT : LEFT;
  return { points: [{ x: startX, y }, { x: endX, y }], startDir: dir, endDir: dir };
}

function placeLabel(points: Pt[], lines: string[], textWidth: number, arrow: Arrow) {
  let longest = 0;
  let segment = 1;
  for (let i = 1; i < points.length; i++) {
    const length = Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
    if (length > longest) {
      longest = length;
      segment = i;
    }
  }

  const a = points[segment - 1];
  const b = points[segment];
  const extraLines = lines.length - 1;
  const right = AREA.x + AREA.w - 4;
  const left = AREA.x + 4;

  let at: Pt;
  let anchor: 'start' | 'middle' | 'end';
  if (Math.abs(a.y - b.y) < 0.5) {
    const x = Math.max(left + textWidth / 2, Math.min(right - textWidth / 2, (a.x + b.x) / 2));
    at = { x, y: a.y - 6 - extraLines * LABEL_LH };
    anchor = 'middle';
  } else {
    at = { x: a.x + 6, y: (a.y + b.y) / 2 + 4 - (extraLines * LABEL_LH) / 2 };
    anchor = 'start';
    if (at.x + textWidth > right) {
      at = { x: a.x - 6, y: at.y };
      anchor = 'end';
    }
  }
  at = { x: at.x + (arrow.labelDx ?? 0), y: at.y + (arrow.labelDy ?? 0) };

  const boxLeft = anchor === 'start' ? at.x : anchor === 'end' ? at.x - textWidth : at.x - textWidth / 2;
  const box: Bounds = { x1: boxLeft - 2, y1: at.y - 11, x2: boxLeft + textWidth + 2, y2: at.y + extraLines * LABEL_LH + 4 };
  const boxCenter = { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
  const far = !!(arrow.labelDx || arrow.labelDy) && projectOnPath(points, boxCenter).distance > 26;
  return { at, anchor, box, far };
}

function icomLabel(code: string, ends: { from: Endpoint; to: Endpoint }): ArrowGeom['icom'] {
  const border = ends.from.t === 'border' ? ends.from : ends.to.t === 'border' ? ends.to : null;
  if (!border) return undefined;
  const p = borderPoint(border.side, border.at);
  switch (border.side) {
    case 'left':
      return { text: code, at: { x: p.x + 4, y: p.y + 14 }, anchor: 'start' };
    case 'right':
      return { text: code, at: { x: p.x - 4, y: p.y + 14 }, anchor: 'end' };
    case 'top':
      return { text: code, at: { x: p.x + 5, y: p.y + 13 }, anchor: 'start' };
    default:
      return { text: code, at: { x: p.x + 5, y: p.y - 6 }, anchor: 'start' };
  }
}

function tunnelMark(arrow: Arrow, points: Pt[], boxById: Map<string, Box>): ArrowGeom['tunnelAt'] {
  if (!arrow.tunnel || points.length < 2) return undefined;
  const hasChild = (end: Endpoint) => end.t === 'box' && !!boxById.get(end.box)?.child;
  const atEnd = hasChild(arrow.to) || (arrow.to.t === 'border' && !arrow.parent && !hasChild(arrow.from));

  const last = points.length - 1;
  const [from, to] = atEnd ? [points[last - 1], points[last]] : [points[1], points[0]];
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const k = Math.min(atEnd ? 16 : 10, length / 2) / length;
  const dir = Math.abs(from.y - to.y) < 0.5 ? (to.x >= from.x ? RIGHT : LEFT) : to.y >= from.y ? DOWN : UP;
  return { point: { x: to.x - (to.x - from.x) * k, y: to.y - (to.y - from.y) * k }, dir };
}

export function computeGeometry(model: Model, diagram: Diagram): ArrowGeom[] {
  const anchors = computeAnchors(model, diagram);
  const boxById = new Map(diagram.boxes.map((b) => [b.id, b]));
  const rectOf = (b: Box): Rect => ({ x: b.x, y: b.y, w: b.w, h: b.h });
  const obstacles = diagram.boxes.filter((b) => b.kind !== 'text' && !isContainer(b.kind)).map(rectOf);

  const nodes = diagram.boxes.filter((b) => b.kind === 'deployNode' || b.kind === 'device');
  const holds = (outer: Box, inner: Box) => {
    const c = center(inner);
    return c.x > outer.x && c.x < outer.x + outer.w && c.y > outer.y && c.y < outer.y + outer.h;
  };
  const obstaclesFor = (arrow: Arrow): Rect[] => {
    if (!nodes.length) return obstacles;
    const ends = [arrow.from, arrow.to].flatMap((e) => (e.t === 'box' && boxById.get(e.box) ? [boxById.get(e.box)!] : []));
    const foreignNodes = nodes.filter((node) => !ends.some((e) => e.id === node.id || holds(node, e)));
    return obstacles.concat(foreignNodes.map(rectOf));
  };

  const usage = new LineUsage();
  const codes = icomCodes(model, diagram);
  const shownForkLabels = new Set<string>();
  const routes = new Map<string, Pt[]>();
  const result = new Map<string, ArrowGeom>();

  for (const arrow of routingOrder(diagram)) {
    const anchor = anchors.get(arrow.id);
    const ends = effectiveEnds(arrow, anchor);
    let from = endInfo(ends.from, 'from', anchor?.from);
    let to = endInfo(ends.to, 'to', anchor?.to);
    let startStub = STUB;
    let endStub = STUB;
    let branch = false;
    let headless = false;

    if (ends.from.t === 'tap' && routes.has(ends.from.arrow)) {
      const hit = projectOnPath(routes.get(ends.from.arrow)!, ends.from);
      from = { point: hit.point, dir: hit.dir };
      startStub = 0;
      branch = true;
    }

    if (ends.to.t === 'tap' && routes.has(ends.to.arrow)) {
      const hit = projectOnPath(routes.get(ends.to.arrow)!, ends.to);
      const dir = isHorizontal(hit.dir) ? (from.point.y <= hit.point.y ? DOWN : UP) : from.point.x <= hit.point.x ? RIGHT : LEFT;
      to = { point: hit.point, dir };
      endStub = 0;
      headless = true;
    }

    let startDir = from.dir ?? to.dir ?? guessDir(from.point, to.point);
    let endDir = to.dir ?? from.dir ?? startDir;

    const label = labelOf(model, arrow) || linkStyle(arrow.link).stereotype || '';
    const labelKey = canBranch(diagram.notation) ? label.trim().toLowerCase() : '';
    const group = labelKey ? `L:${labelKey}` : `A:${arrow.id}`;

    const message = messageCourse(diagram, arrow, boxById);
    if (message) {
      startDir = message.startDir;
      endDir = message.endDir;
    }
    const manual = !message && arrow.route?.length ? applyRoute(from.point, startDir, arrow.route, to.point, endDir) : null;
    const points = atLeastTwo(
      message?.points ??
        manual ??
        route({ start: from.point, startDir, end: to.point, endDir, obstacles: obstaclesFor(arrow), usage, group, startStub, endStub }),
    );
    if (!message) usage.add(points, group);
    routes.set(arrow.id, points);

    const lines = label.split('\n').map((l) => l.trim());
    const textWidth = Math.max(0, ...lines.map((l) => measure(l, LABEL_SIZE)));
    const placed = placeLabel(points, lines, textWidth, arrow);

    const forkKey = labelKey ? `${labelKey}@${Math.round(points[0].x)},${Math.round(points[0].y)}` : '';
    const showLabel = !!label.trim() && !labelInherited(model, arrow) && (!forkKey || !shownForkLabels.has(forkKey));
    if (forkKey) shownForkLabels.add(forkKey);

    const code = arrow.parent ? codes.get(arrow.parent) : undefined;

    result.set(arrow.id, {
      id: arrow.id,
      points,
      startDir,
      endDir,
      label,
      lines,
      showLabel,
      labelAt: placed.at,
      labelAnchor: placed.anchor,
      labelBox: placed.box,
      labelFar: placed.far,
      danglingFrom: arrow.from.t === 'free' || (arrow.from.t === 'tap' && !branch),
      danglingTo: arrow.to.t === 'free' || (arrow.to.t === 'tap' && !headless),
      headless,
      branch,
      manual: !!manual,
      tunnelAt: tunnelMark(arrow, points, boxById),
      icom: code ? icomLabel(code, ends) : undefined,
    });
  }

  return diagram.arrows.map((a) => result.get(a.id)!).filter(Boolean);
}
