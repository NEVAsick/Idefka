import type { Pt } from './types';
import { DOWN, LEFT, RIGHT, STEP, UP, type Dir } from './router';

export interface Bounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PathHit {
  point: Pt;
  dir: Dir;
  distance: number;
}

export function projectOnPath(points: Pt[], p: Pt): PathHit {
  let best: PathHit = { point: points[0], dir: RIGHT, distance: Infinity };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const horizontal = Math.abs(a.y - b.y) < 0.5;
    const closest = horizontal
      ? { x: Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), p.x)), y: a.y }
      : { x: a.x, y: Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), p.y)) };
    const distance = Math.hypot(closest.x - p.x, closest.y - p.y);
    if (distance < best.distance) {
      const dir = horizontal ? (b.x >= a.x ? RIGHT : LEFT) : b.y >= a.y ? DOWN : UP;
      best = { point: { x: Math.round(closest.x), y: Math.round(closest.y) }, dir, distance };
    }
  }
  return best;
}

export function nearestOnRect(rect: Bounds, p: Pt): Pt {
  return {
    x: Math.max(rect.x1, Math.min(rect.x2, p.x)),
    y: Math.max(rect.y1, Math.min(rect.y2, p.y)),
  };
}

export function squigglePoints(from: Pt, to: Pt): Pt[] | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 8) return null;
  const nx = (-dy / length) * 5;
  const ny = (dx / length) * 5;
  return [
    from,
    { x: from.x + dx * 0.42 + nx, y: from.y + dy * 0.42 + ny },
    { x: from.x + dx * 0.58 - nx, y: from.y + dy * 0.58 - ny },
    to,
  ];
}

function pullBack(tip: Pt, toward: Pt, distance: number) {
  const length = Math.hypot(tip.x - toward.x, tip.y - toward.y) || 1;
  const k = Math.min(distance, length - 0.5) / length;
  tip.x -= (tip.x - toward.x) * k;
  tip.y -= (tip.y - toward.y) * k;
}

export function pathD(points: Pt[], shortenEnd = 0, radius = 5, shortenStart = 0): string {
  if (points.length < 2) return '';
  const pts = points.map((p) => ({ ...p }));
  if (shortenStart) pullBack(pts[0], pts[1], shortenStart);
  if (shortenEnd) pullBack(pts[pts.length - 1], pts[pts.length - 2], shortenEnd);

  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const corner = pts[i];
    const next = pts[i + 1];
    const inLength = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const outLength = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    const inX = (corner.x - prev.x) / (inLength || 1);
    const inY = (corner.y - prev.y) / (inLength || 1);
    const outX = (next.x - corner.x) / (outLength || 1);
    const outY = (next.y - corner.y) / (outLength || 1);
    d += ` L${corner.x - inX * r} ${corner.y - inY * r} Q${corner.x} ${corner.y} ${corner.x + outX * r} ${corner.y + outY * r}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last.x} ${last.y}`;
}

export function arrowHead(tip: Pt, dir: Dir, length = 9, halfWidth = 3.6): string {
  const { x: dx, y: dy } = STEP[dir];
  const baseX = tip.x - dx * length;
  const baseY = tip.y - dy * length;
  return `${tip.x},${tip.y} ${baseX - dy * halfWidth},${baseY + dx * halfWidth} ${baseX + dy * halfWidth},${baseY - dx * halfWidth}`;
}

export function openHead(tip: Pt, dir: Dir, length = 9, halfWidth = 4): string {
  const { x: dx, y: dy } = STEP[dir];
  const baseX = tip.x - dx * length;
  const baseY = tip.y - dy * length;
  return `${baseX - dy * halfWidth},${baseY + dx * halfWidth} ${tip.x},${tip.y} ${baseX + dy * halfWidth},${baseY - dx * halfWidth}`;
}

export function diamondAt(start: Pt, dir: Dir): string {
  const { x: ux, y: uy } = STEP[dir];
  const nx = -uy;
  const ny = ux;
  const mid = { x: start.x + ux * 8.5, y: start.y + uy * 8.5 };
  return [
    `${start.x},${start.y}`,
    `${mid.x + nx * 5.5},${mid.y + ny * 5.5}`,
    `${start.x + ux * 17},${start.y + uy * 17}`,
    `${mid.x - nx * 5.5},${mid.y - ny * 5.5}`,
  ].join(' ');
}
