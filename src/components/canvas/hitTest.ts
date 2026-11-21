import type { Box, Diagram, Endpoint, Pt, Side } from '../../model/types';
import type { ArrowGeom } from '../../model/geometry';
import { projectOnPath } from '../../model/path';
import { AREA, snap } from '../../model/sheet';
import { clamp } from '../../model/ops';
import { isContext } from '../../model/query';
import { connectable, isContainer, isLifeline, lifelineHead } from '../../model/notation';

export type End = 'from' | 'to';

export interface HitContext {
  diagram: Diagram;
  geom: ArrowGeom[];
  zoom: number;
}

const ALL_SIDES: Side[] = ['left', 'top', 'right', 'bottom'];
const BORDER_SNAP = 28;

const inBox = (p: Pt, b: Box, pad = 0) => p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;

function inside(p: Pt, box: Box, pad = 0): boolean {
  if (!inBox(p, box, pad)) return false;
  if (isLifeline(box.kind)) {
    const onHead = p.y <= box.y + lifelineHead(box.kind) + pad;
    const onLine = Math.abs(p.x - (box.x + box.w / 2)) <= 12 + pad;
    return onHead || onLine;
  }
  if (box.kind === 'fragment') {
    const edge = 6 + pad;
    return p.x - box.x < edge || box.x + box.w - p.x < edge || p.y - box.y < 22 + pad || box.y + box.h - p.y < edge;
  }
  return true;
}

export function carries(container: Box, box: Box): boolean {
  if (isContainer(box.kind)) {
    return box.x >= container.x && box.y >= container.y && box.x + box.w <= container.x + container.w && box.y + box.h <= container.y + container.h;
  }
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return cx > container.x && cy > container.y && cx < container.x + container.w && cy < container.y + container.h;
}

export function lifelineOf(diagram: Diagram, activation: Box): Box | undefined {
  const cx = activation.x + activation.w / 2;
  return diagram.boxes.find((l) => isLifeline(l.kind) && Math.abs(l.x + l.w / 2 - cx) <= l.w / 2);
}

function hitBox(diagram: Diagram, p: Pt, pad = 0, exclude?: string, onlyConnectable = false): Box | undefined {
  const allowed = (b: Box) => b.id !== exclude && (!onlyConnectable || connectable(b.kind));
  const insideConnectableNode = onlyConnectable && diagram.boxes.some((c) => allowed(c) && isContainer(c.kind) && inBox(p, c, -2));
  const margin = insideConnectableNode ? 0 : pad;

  for (let i = diagram.boxes.length - 1; i >= 0; i--) {
    const box = diagram.boxes[i];
    if (!isContainer(box.kind) && allowed(box) && inside(p, box, margin)) return box;
  }

  let smallest: Box | undefined;
  for (const box of diagram.boxes) {
    if (!isContainer(box.kind) || !allowed(box) || !inside(p, box)) continue;
    if (!smallest || box.w * box.h < smallest.w * smallest.h) smallest = box;
  }
  return smallest;
}

export function hoverBox(diagram: Diagram, p: Pt, pad: number): Box | undefined {
  let best: Box | undefined;
  let bestDistance = Infinity;
  for (const box of diagram.boxes) {
    const container = isContainer(box.kind);
    if (container && !connectable(box.kind)) continue;
    if (isLifeline(box.kind) && !inside(p, box, pad)) continue;

    const outside = Math.hypot(Math.max(box.x - p.x, 0, p.x - box.x - box.w), Math.max(box.y - p.y, 0, p.y - box.y - box.h));
    const toEdge = Math.min(p.x - box.x, box.x + box.w - p.x, p.y - box.y, box.y + box.h - p.y) + 0.5;
    const distance = container && outside === 0 ? toEdge : outside;
    if (distance <= pad && (distance < bestDistance || (distance === bestDistance && !container))) {
      bestDistance = distance;
      best = box;
    }
  }
  return best ?? hitBox(diagram, p);
}

export function nearestSide(box: Box, p: Pt, allowed: Side[] = ALL_SIDES): Side {
  const distance: Record<Side, number> = {
    left: Math.abs(p.x - box.x),
    right: Math.abs(p.x - (box.x + box.w)),
    top: Math.abs(p.y - box.y),
    bottom: Math.abs(p.y - (box.y + box.h)),
  };
  return allowed.slice().sort((a, b) => distance[a] - distance[b])[0];
}

function arrowNear({ geom, zoom }: HitContext, p: Pt, skip: Set<string>): Endpoint | null {
  let best: { id: string; point: Pt; distance: number } | null = null;
  for (const g of geom) {
    if (skip.has(g.id) || g.points.length < 2) continue;
    const hit = projectOnPath(g.points, p);
    if (hit.distance <= 8 / Math.min(zoom, 1.5) && (!best || hit.distance < best.distance)) best = { id: g.id, point: hit.point, distance: hit.distance };
  }
  return best && { t: 'tap', arrow: best.id, x: best.point.x, y: best.point.y };
}

export function borderEndAt(side: Side, coordinate: number): Extract<Endpoint, { t: 'border' }> {
  const vertical = side === 'left' || side === 'right';
  const start = vertical ? AREA.y : AREA.x;
  const length = vertical ? AREA.h : AREA.w;
  return { t: 'border', side, at: clamp(coordinate, start + 12, start + length - 12) };
}

function borderNear(p: Pt, allowed: Side[]): Endpoint | null {
  const right = AREA.x + AREA.w;
  const bottom = AREA.y + AREA.h;
  const withinRows = p.y > AREA.y - BORDER_SNAP && p.y < bottom + BORDER_SNAP;
  const withinColumns = p.x > AREA.x - BORDER_SNAP && p.x < right + BORDER_SNAP;
  const candidates: [Side, number, boolean][] = [
    ['left', Math.abs(p.x - AREA.x), withinRows],
    ['right', Math.abs(p.x - right), withinRows],
    ['top', Math.abs(p.y - AREA.y), withinColumns],
    ['bottom', Math.abs(p.y - bottom), withinColumns],
  ];
  const nearest = candidates
    .filter(([side, distance, within]) => allowed.includes(side) && within && distance <= BORDER_SNAP)
    .sort((a, b) => a[1] - b[1])[0];
  if (!nearest) return null;

  const side = nearest[0];
  return borderEndAt(side, snap(side === 'left' || side === 'right' ? p.y : p.x));
}

export function resolveEnd(context: HitContext, role: End, p: Pt, exclude: string | undefined, skipArrows: Set<string>): Endpoint {
  const idef0 = context.diagram.notation === 'idef0';
  const contextDiagram = isContext(context.diagram);
  const box = hitBox(context.diagram, p, contextDiagram ? Math.max(8, 16 / context.zoom) : 8, contextDiagram ? undefined : exclude, true);
  if (box) {
    if (!idef0 || contextDiagram) return { t: 'box', box: box.id, side: nearestSide(box, p) };
    if (role === 'from') return { t: 'box', box: box.id, side: 'right' };
    return { t: 'box', box: box.id, side: nearestSide(box, p, ['left', 'top', 'bottom']) };
  }

  const tap = arrowNear(context, p, skipArrows);
  if (tap) return tap;

  const borderSides: Side[] = !idef0 || contextDiagram ? ALL_SIDES : role === 'to' ? ['right'] : ['left', 'top', 'bottom'];
  return borderNear(p, borderSides) ?? { t: 'free', x: snap(p.x), y: snap(p.y) };
}

export function resolveMessageEnd(diagram: Diagram, p: Pt, y: number): Endpoint {
  let best: Box | undefined;
  let bestDistance = Infinity;
  for (const box of diagram.boxes) {
    if (!isLifeline(box.kind) || p.y < box.y - 24 || p.y > box.y + box.h + 24) continue;
    const distance = Math.abs(p.x - (box.x + box.w / 2));
    if (distance <= box.w / 2 + 8 && distance < bestDistance) {
      bestDistance = distance;
      best = box;
    }
  }
  return best ? { t: 'box', box: best.id, side: 'left' } : { t: 'free', x: snap(p.x), y };
}
