import type { Pt, Rect } from './types';
import { AREA } from './sheet';

export type Dir = 0 | 1 | 2 | 3;

export const RIGHT: Dir = 0;
export const DOWN: Dir = 1;
export const LEFT: Dir = 2;
export const UP: Dir = 3;

export const STEP: Record<Dir, Pt> = {
  0: { x: 1, y: 0 },
  1: { x: 0, y: 1 },
  2: { x: -1, y: 0 },
  3: { x: 0, y: -1 },
};

export const opposite = (dir: Dir) => ((dir + 2) % 4) as Dir;
export const isHorizontal = (dir: Dir) => dir === RIGHT || dir === LEFT;

export const STUB = 18;
const BOX_MARGIN = 14;
const TURN_PENALTY = 42;
const OVERLAP_PENALTY = 60;
const EPS = 0.5;

interface Span {
  from: number;
  to: number;
  group: string;
}

export class LineUsage {
  private horizontal = new Map<number, Span[]>();
  private vertical = new Map<number, Span[]>();

  add(points: Pt[], group: string) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (a.y === b.y) this.remember(this.horizontal, a.y, a.x, b.x, group);
      else if (a.x === b.x) this.remember(this.vertical, a.x, a.y, b.y, group);
    }
  }

  penalty(horizontal: boolean, line: number, from: number, to: number, group: string): number {
    const spans = (horizontal ? this.horizontal : this.vertical).get(Math.round(line)) ?? [];
    const overlaps = spans.some((s) => s.group !== group && Math.min(to, s.to) - Math.max(from, s.from) > 1);
    return overlaps ? OVERLAP_PENALTY : 0;
  }

  private remember(map: Map<number, Span[]>, line: number, a: number, b: number, group: string) {
    const key = Math.round(line);
    const spans = map.get(key) ?? [];
    spans.push({ from: Math.min(a, b), to: Math.max(a, b), group });
    map.set(key, spans);
  }
}

class MinHeap {
  private keys: number[] = [];
  private priorities: number[] = [];

  get size() {
    return this.keys.length;
  }

  push(key: number, priority: number) {
    const { keys, priorities } = this;
    let i = keys.length;
    keys.push(key);
    priorities.push(priority);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (priorities[parent] <= priority) break;
      keys[i] = keys[parent];
      priorities[i] = priorities[parent];
      i = parent;
    }
    keys[i] = key;
    priorities[i] = priority;
  }

  pop(): [key: number, priority: number] {
    const { keys, priorities } = this;
    const top: [number, number] = [keys[0], priorities[0]];
    const lastKey = keys.pop()!;
    const lastPriority = priorities.pop()!;
    if (!keys.length) return top;

    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= keys.length) break;
      if (child + 1 < keys.length && priorities[child + 1] < priorities[child]) child++;
      if (priorities[child] >= lastPriority) break;
      keys[i] = keys[child];
      priorities[i] = priorities[child];
      i = child;
    }
    keys[i] = lastKey;
    priorities[i] = lastPriority;
    return top;
  }
}

const sortedUnique = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);

function gridLines(values: number[], min: number, max: number, keep: number[]): number[] {
  const base = sortedUnique(values.filter((v) => (v >= min && v <= max) || keep.includes(v)));
  const midpoints = base.slice(1).map((v, i) => (base[i] + v) / 2);
  return sortedUnique([...base, ...midpoints]);
}

const same = (a: number, b: number) => Math.abs(a - b) < 0.01;

function simplify(points: Pt[]): Pt[] {
  const result: Pt[] = [];
  for (const p of points) {
    const last = result[result.length - 1];
    if (last && same(last.x, p.x) && same(last.y, p.y)) continue;
    result.push({ x: p.x, y: p.y });
    while (result.length >= 3) {
      const [a, b, c] = result.slice(-3);
      const straight = (same(a.x, b.x) && same(b.x, c.x)) || (same(a.y, b.y) && same(b.y, c.y));
      if (!straight) break;
      result.splice(result.length - 2, 1);
    }
  }
  return result;
}

export function removeJogs(points: Pt[], tolerance = 6): Pt[] {
  let result = simplify(points);
  for (let attempt = 0; attempt < 20; attempt++) {
    const last = result.length - 1;
    let changed = false;

    for (let i = 1; i + 2 <= last; i++) {
      const a = result[i];
      const b = result[i + 1];
      const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (length >= tolerance || length < 0.01) continue;

      const axis = Math.abs(a.x - b.x) < EPS ? 'y' : 'x';
      const startsAtEnd = i - 1 === 0;
      const endsAtEnd = i + 2 === last;
      if (startsAtEnd && endsAtEnd) continue;

      if (endsAtEnd) {
        result[i - 1][axis] = b[axis];
        result[i][axis] = b[axis];
      } else {
        result[i + 1][axis] = a[axis];
        result[i + 2][axis] = a[axis];
      }
      changed = true;
      break;
    }

    if (!changed) break;
    result = simplify(result);
  }
  return result;
}

function straightFallback(start: Pt, a: Pt, b: Pt, end: Pt, startDir: Dir): Pt[] {
  if (isHorizontal(startDir)) {
    const midX = (a.x + b.x) / 2;
    return simplify([start, a, { x: midX, y: a.y }, { x: midX, y: b.y }, b, end]);
  }
  const midY = (a.y + b.y) / 2;
  return simplify([start, a, { x: a.x, y: midY }, { x: b.x, y: midY }, b, end]);
}

interface Zone {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

class Grid {
  readonly xs: number[];
  readonly ys: number[];
  private blockedNodes: Uint8Array;
  private blockedRight: Uint8Array;
  private blockedDown: Uint8Array;

  constructor(xs: number[], ys: number[], zones: Zone[]) {
    this.xs = xs;
    this.ys = ys;
    const size = xs.length * ys.length;
    this.blockedNodes = new Uint8Array(size);
    this.blockedRight = new Uint8Array(size);
    this.blockedDown = new Uint8Array(size);

    const insideX = (x: number, z: Zone) => x > z.x1 + EPS && x < z.x2 - EPS;
    const insideY = (y: number, z: Zone) => y > z.y1 + EPS && y < z.y2 - EPS;
    const crossesX = (x1: number, x2: number, z: Zone) => x2 > z.x1 + EPS && x1 < z.x2 - EPS;
    const crossesY = (y1: number, y2: number, z: Zone) => y2 > z.y1 + EPS && y1 < z.y2 - EPS;

    for (let row = 0; row < ys.length; row++) {
      for (let col = 0; col < xs.length; col++) {
        const x = xs[col];
        const y = ys[row];
        const index = this.index(col, row);
        if (zones.some((z) => insideX(x, z) && insideY(y, z))) this.blockedNodes[index] = 1;
        if (col + 1 < xs.length && zones.some((z) => insideY(y, z) && crossesX(x, xs[col + 1], z))) this.blockedRight[index] = 1;
        if (row + 1 < ys.length && zones.some((z) => insideX(x, z) && crossesY(y, ys[row + 1], z))) this.blockedDown[index] = 1;
      }
    }
  }

  index(col: number, row: number) {
    return row * this.xs.length + col;
  }

  contains(col: number, row: number) {
    return col >= 0 && row >= 0 && col < this.xs.length && row < this.ys.length;
  }

  nodeBlocked(col: number, row: number) {
    return this.blockedNodes[this.index(col, row)] === 1;
  }

  stepBlocked(col: number, row: number, dir: Dir) {
    switch (dir) {
      case RIGHT:
        return this.blockedRight[this.index(col, row)] === 1;
      case LEFT:
        return this.blockedRight[this.index(col - 1, row)] === 1;
      case DOWN:
        return this.blockedDown[this.index(col, row)] === 1;
      default:
        return this.blockedDown[this.index(col, row - 1)] === 1;
    }
  }
}

export interface RouteRequest {
  start: Pt;
  startDir: Dir;
  end: Pt;
  endDir: Dir;
  obstacles: Rect[];
  usage: LineUsage | null;
  group: string;
  startStub?: number;
  endStub?: number;
}

// Дейкстра по разреженной сетке из линий, проходящих через края блоков. Состояние — узел плюс направление,
// поэтому каждый поворот штрафуется (TURN_PENALTY), а usage отталкивает стрелку от уже проложенных чужих линий.
export function route({ start, startDir, end, endDir, obstacles, usage, group, startStub = STUB, endStub = STUB }: RouteRequest): Pt[] {
  const a = { x: start.x + STEP[startDir].x * startStub, y: start.y + STEP[startDir].y * startStub };
  const b = { x: end.x - STEP[endDir].x * endStub, y: end.y - STEP[endDir].y * endStub };

  const zones: Zone[] = obstacles.map((r) => ({ x1: r.x - BOX_MARGIN, y1: r.y - BOX_MARGIN, x2: r.x + r.w + BOX_MARGIN, y2: r.y + r.h + BOX_MARGIN }));
  const min = { x: AREA.x + 6, y: AREA.y + 6 };
  const max = { x: AREA.x + AREA.w - 6, y: AREA.y + AREA.h - 6 };
  const xs = gridLines([a.x, b.x, min.x, max.x, ...zones.flatMap((z) => [z.x1, z.x2])], min.x, max.x, [a.x, b.x]);
  const ys = gridLines([a.y, b.y, min.y, max.y, ...zones.flatMap((z) => [z.y1, z.y2])], min.y, max.y, [a.y, b.y]);
  const grid = new Grid(xs, ys, zones);

  const startCol = xs.indexOf(a.x);
  const startRow = ys.indexOf(a.y);
  const goalCol = xs.indexOf(b.x);
  const goalRow = ys.indexOf(b.y);
  if (startCol < 0 || startRow < 0 || goalCol < 0 || goalRow < 0) return straightFallback(start, a, b, end, startDir);

  const stateOf = (col: number, row: number, dir: Dir) => grid.index(col, row) * 4 + dir;
  const states = xs.length * ys.length * 4;
  const cost = new Float64Array(states).fill(Infinity);
  const previous = new Int32Array(states).fill(-1);
  const queue = new MinHeap();

  const first = stateOf(startCol, startRow, startDir);
  cost[first] = 0;
  queue.push(first, 0);

  let goal = -1;
  while (queue.size) {
    const [state, stateCost] = queue.pop();
    if (stateCost > cost[state]) continue;
    const dir = (state & 3) as Dir;
    const node = state >> 2;
    const col = node % xs.length;
    const row = Math.floor(node / xs.length);
    if (col === goalCol && row === goalRow) {
      goal = state;
      break;
    }

    for (const nextDir of [RIGHT, DOWN, LEFT, UP]) {
      if (nextDir === opposite(dir)) continue;
      const nextCol = col + STEP[nextDir].x;
      const nextRow = row + STEP[nextDir].y;
      if (!grid.contains(nextCol, nextRow)) continue;
      const atGoal = nextCol === goalCol && nextRow === goalRow;
      if (!atGoal && grid.nodeBlocked(nextCol, nextRow)) continue;
      if (grid.stepBlocked(col, row, nextDir)) continue;
      if (atGoal && nextDir === opposite(endDir)) continue;

      const length = Math.abs(xs[nextCol] - xs[col]) + Math.abs(ys[nextRow] - ys[row]);
      let nextCost = stateCost + length + (nextDir !== dir ? TURN_PENALTY : 0);
      if (usage) {
        nextCost += isHorizontal(nextDir)
          ? usage.penalty(true, ys[row], Math.min(xs[col], xs[nextCol]), Math.max(xs[col], xs[nextCol]), group)
          : usage.penalty(false, xs[col], Math.min(ys[row], ys[nextRow]), Math.max(ys[row], ys[nextRow]), group);
      }
      if (atGoal && nextDir !== endDir) nextCost += TURN_PENALTY;

      const next = stateOf(nextCol, nextRow, nextDir);
      if (nextCost < cost[next]) {
        cost[next] = nextCost;
        previous[next] = state;
        queue.push(next, nextCost);
      }
    }
  }

  if (goal < 0) return straightFallback(start, a, b, end, startDir);

  const path: Pt[] = [];
  for (let state = goal; state >= 0; state = previous[state]) {
    const node = state >> 2;
    path.push({ x: xs[node % xs.length], y: ys[Math.floor(node / xs.length)] });
  }
  return simplify([start, ...path.reverse(), end]);
}
