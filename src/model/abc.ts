import type { Box, Model } from './types';
import { boxNumber, diagramOrder } from './query';

export interface Cost {
  total: number;
  byCenter: Record<string, number>;
  duration: number;
  computed: boolean;
}

export interface AbcRow {
  diagram: string;
  box: Box;
  number: string;
  depth: number;
  cost: Cost;
}

function childActivities(model: Model, box: Box): Box[] {
  const child = box.child ? model.diagrams[box.child] : undefined;
  if (!child || child.notation !== 'idef0') return [];
  return child.boxes.filter((b) => b.kind === 'activity');
}

function ownCost(model: Model, box: Box): Cost {
  const byCenter: Record<string, number> = {};
  let total = 0;
  for (const center of model.abc.centers) {
    const value = box.costs?.[center.id] ?? 0;
    byCenter[center.id] = value;
    total += value;
  }
  return { total, byCenter, duration: box.duration ?? 0, computed: false };
}

export function costOf(model: Model, box: Box, depth = 0): Cost {
  const children = depth < 40 ? childActivities(model, box) : [];
  if (!children.length) return ownCost(model, box);

  const byCenter: Record<string, number> = {};
  let total = 0;
  let duration = 0;
  for (const child of children) {
    const frequency = child.frequency ?? 1;
    const cost = costOf(model, child, depth + 1);
    total += cost.total * frequency;
    duration += cost.duration * frequency;
    for (const [center, value] of Object.entries(cost.byCenter)) {
      byCenter[center] = (byCenter[center] ?? 0) + value * frequency;
    }
  }
  return { total, byCenter, duration, computed: true };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function formatMoney(value: number, currency: string) {
  const text = round2(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  return currency ? `${text} ${currency}` : text;
}

export function abcRows(model: Model): AbcRow[] {
  const rows: AbcRow[] = [];
  const depthOf = new Map<string, number>([[model.roots.idef0, 0]]);

  for (const diagramId of diagramOrder(model, 'idef0')) {
    const depth = depthOf.get(diagramId) ?? 0;
    for (const box of model.diagrams[diagramId].boxes) {
      if (box.kind !== 'activity') continue;
      if (box.child) depthOf.set(box.child, depth + 1);
      rows.push({ diagram: diagramId, box, number: boxNumber(model, diagramId, box.id), depth, cost: costOf(model, box) });
    }
  }
  return rows;
}

export function abcCsv(model: Model): string {
  const { centers, currency, timeUnit } = model.abc;
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
  // Excel выполняет ячейки, начинающиеся с = + - @, как формулы, поэтому такие названия экранируются апострофом.
  const asText = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
  const number = (value: number) => String(round2(value)).replace('.', ',');

  const header = ['Номер', 'Работа', 'Частота', `Длительность, ${timeUnit}`, ...centers.map((c) => asText(c.name)), `Итого, ${currency}`];
  const lines = [header.map(quote).join(';')];

  for (const row of abcRows(model)) {
    const cells = [
      quote(row.number),
      quote('  '.repeat(row.depth) + asText(row.box.name)),
      number(row.box.frequency ?? 1),
      number(row.cost.duration),
      ...centers.map((c) => number(row.cost.byCenter[c.id] ?? 0)),
      number(row.cost.total),
    ];
    lines.push(cells.join(';'));
  }

  const byteOrderMark = '﻿';
  return byteOrderMark + lines.join('\r\n');
}
