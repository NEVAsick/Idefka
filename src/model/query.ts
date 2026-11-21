import type { Arrow, Diagram, Endpoint, Model, NodeKind, Notation, Side } from './types';
import { NOTATION_LIST } from './notation';

const NUMBERED: NodeKind[] = ['activity', 'process', 'uow', 'task', 'epcFunction', 'action'];
const PREFIXES: Partial<Record<NodeKind, string>> = { external: 'E', store: 'D', junction: 'J' };
const MAX_DEPTH = 50;

export const isContext = (diagram: Diagram | undefined) => !!diagram && !diagram.parent && diagram.notation === 'idef0';

export function nodeOf(model: Model, diagramId: string): string {
  const diagram = model.diagrams[diagramId];
  if (!diagram) return '?';
  if (!diagram.parent) return diagram.notation === 'idef0' ? 'A-0' : '0';
  return boxNumber(model, diagram.parent.diagram, diagram.parent.box);
}

export function boxNumber(model: Model, diagramId: string, boxId: string, depth = 0): string {
  const diagram = model.diagrams[diagramId];
  const box = diagram?.boxes.find((b) => b.id === boxId);
  if (!diagram || !box || depth > MAX_DEPTH) return '?';

  if (!NUMBERED.includes(box.kind)) {
    const prefix = PREFIXES[box.kind];
    if (!prefix) return '';
    const sameKind = diagram.boxes.filter((b) => b.kind === box.kind);
    return prefix + (sameKind.indexOf(box) + 1);
  }

  const index = diagram.boxes.filter((b) => NUMBERED.includes(b.kind)).indexOf(box) + 1;
  const parent = diagram.parent;

  if (diagram.notation === 'idef0') {
    if (!parent) return 'A0';
    const parentNumber = boxNumber(model, parent.diagram, parent.box, depth + 1);
    return parentNumber === 'A0' ? `A${index}` : `${parentNumber}${index}`;
  }

  if (!parent) return String(index);
  return `${boxNumber(model, parent.diagram, parent.box, depth + 1)}.${index}`;
}

export function diagramTitle(model: Model, diagramId: string): string {
  const parent = model.diagrams[diagramId]?.parent;
  if (!parent) return model.meta.name;
  const parentBox = model.diagrams[parent.diagram]?.boxes.find((b) => b.id === parent.box);
  return parentBox?.name ?? '';
}

export function diagramPath(model: Model, diagramId: string): string[] {
  const path: string[] = [];
  let current: string | undefined = diagramId;
  while (current && path.length < MAX_DEPTH) {
    path.unshift(current);
    current = model.diagrams[current]?.parent?.diagram;
  }
  return path;
}

export function diagramOrder(model: Model, notation?: Notation): string[] {
  const order: string[] = [];
  const visit = (id: string) => {
    const diagram = model.diagrams[id];
    if (!diagram || order.includes(id)) return;
    order.push(id);
    for (const box of diagram.boxes) if (box.child) visit(box.child);
  };
  for (const n of notation ? [notation] : NOTATION_LIST) visit(model.roots[n]);
  return order;
}

export function rootOf(model: Model, diagramId: string): string {
  return diagramPath(model, diagramId)[0];
}

type ArrowIndex = Map<string, { arrow: Arrow; diagram: string }>;
const indexes = new WeakMap<Model, ArrowIndex>();

function arrowIndex(model: Model): ArrowIndex {
  let index = indexes.get(model);
  if (!index) {
    index = new Map();
    for (const diagram of Object.values(model.diagrams)) {
      for (const arrow of diagram.arrows) index.set(arrow.id, { arrow, diagram: diagram.id });
    }
    indexes.set(model, index);
  }
  return index;
}

export function invalidateIndex(model: Model) {
  indexes.delete(model);
}

// Название граничной стрелки хранится у стрелки родителя, поэтому переименование видно на всех уровнях сразу.
export function labelOwner(model: Model, arrow: Arrow): Arrow {
  let current = arrow;
  for (let depth = 0; current.parent && depth < MAX_DEPTH; depth++) {
    const parent = arrowIndex(model).get(current.parent);
    if (!parent) break;
    current = parent.arrow;
  }
  return current;
}

export function labelOf(model: Model, arrow: Arrow, depth = 0): string {
  const own = labelOwner(model, arrow).label;
  if (own.trim() || depth > MAX_DEPTH) return own;

  const tap = arrow.from.t === 'tap' ? arrow.from : arrow.to.t === 'tap' ? arrow.to : null;
  const source = tap && arrowIndex(model).get(tap.arrow);
  return source ? labelOf(model, source.arrow, depth + 1) : own;
}

export function labelInherited(model: Model, arrow: Arrow): boolean {
  const branchOrJoin = arrow.from.t === 'tap' || arrow.to.t === 'tap';
  return branchOrJoin && !labelOwner(model, arrow).label.trim();
}

export type Role = 'I' | 'C' | 'O' | 'M';

export const ROLE_BY_SIDE: Record<Side, Role> = { left: 'I', top: 'C', right: 'O', bottom: 'M' };

export const CONTEXT_ROLE_HINT = 'На A-0 вход соединяется слева, управление сверху, механизм снизу, выход справа. У рамки и работы роль стрелки должна совпадать, в том числе у ветвей.';

export function contextEndDirection(end: Extract<Endpoint, { t: 'box' | 'border' }>): 'from' | 'to' {
  const source = end.t === 'box' ? end.side === 'right' : end.side !== 'right';
  return source ? 'from' : 'to';
}

// На A-0 каждая связанная группа стрелок (с учётом ветвей и слияний) несёт одну роль ICOM.
export function contextArrowRoles(diagram: Diagram, proposed?: Arrow): Map<string, Role | 'conflict'> {
  const roles = new Map<string, Role | 'conflict'>();
  if (!isContext(diagram)) return roles;
  const arrows = new Map(diagram.arrows.map((a) => [a.id, a]));
  if (proposed) arrows.set(proposed.id, proposed);

  const branches = new Map<string, Arrow[]>();
  for (const arrow of arrows.values()) {
    for (const end of [arrow.from, arrow.to]) {
      if (end.t !== 'tap') continue;
      const list = branches.get(end.arrow);
      if (list) list.push(arrow);
      else branches.set(end.arrow, [arrow]);
    }
  }

  const seen = new Set<string>();
  for (const first of arrows.values()) {
    if (seen.has(first.id)) continue;
    const pending = [first];
    const group: Arrow[] = [];
    let role: Role | 'conflict' | undefined;
    while (pending.length) {
      const arrow = pending.pop()!;
      if (seen.has(arrow.id)) continue;
      seen.add(arrow.id);
      group.push(arrow);
      for (const branch of branches.get(arrow.id) ?? []) pending.push(branch);
      for (const direction of ['from', 'to'] as const) {
        const end = arrow[direction];
        if (end.t === 'tap') {
          const trunk = arrows.get(end.arrow);
          if (trunk) pending.push(trunk);
        } else if (end.t !== 'free') {
          const atEnd = ROLE_BY_SIDE[end.side];
          role = contextEndDirection(end) !== direction || (role && role !== atEnd) ? 'conflict' : atEnd;
        }
      }
    }
    if (role) for (const arrow of group) roles.set(arrow.id, role);
  }
  return roles;
}

export function arrowRole(arrow: Arrow, contextRole?: Role | 'conflict'): Role {
  if (contextRole && contextRole !== 'conflict') return contextRole;
  if (arrow.to.t === 'box') return ROLE_BY_SIDE[arrow.to.side];
  if (arrow.from.t === 'border') return ROLE_BY_SIDE[arrow.from.side];
  return 'O';
}

export const ROLE_NAME: Record<Role, string> = { I: 'Вход', C: 'Управление', O: 'Выход', M: 'Механизм' };

export function dependents(diagram: Diagram, arrowId: string): Set<string> {
  const result = new Set<string>([arrowId]);
  const startsOrEndsOnResult = (arrow: Arrow) =>
    (arrow.from.t === 'tap' && result.has(arrow.from.arrow)) || (arrow.to.t === 'tap' && result.has(arrow.to.arrow));

  let grew = true;
  while (grew) {
    grew = false;
    for (const arrow of diagram.arrows) {
      if (!result.has(arrow.id) && startsOrEndsOnResult(arrow)) {
        result.add(arrow.id);
        grew = true;
      }
    }
  }
  return result;
}
