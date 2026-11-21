import type { Arrow, Box, Diagram, Endpoint, Model, NodeKind, Side } from './types';
import { FORMAT, VERSION } from './types';
import { normalize } from './ops';
import { KINDS, NOTATION_LIST } from './notation';
import { AREA } from './sheet';

export function serialize(model: Model): string {
  return JSON.stringify(model, null, 2);
}

type RawModel = any;
type Raw = Record<string, any>;

const SIDES: Side[] = ['left', 'top', 'right', 'bottom'];
const STATUSES = ['working', 'draft', 'recommended', 'publication'];

const isObject = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const asText = (value: unknown) => (typeof value === 'string' ? value : value == null ? '' : String(value));
const objects = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter(isObject) : []);

function addNotationToDiagrams(raw: RawModel) {
  for (const diagram of Object.values<any>(raw.diagrams)) {
    diagram.notation ??= 'idef0';
    for (const box of objects(diagram.boxes)) box.kind ??= 'activity';
  }
}

function splitRootByNotation(raw: RawModel) {
  const rootNotation = raw.diagrams[raw.root]?.notation ?? 'idef0';
  raw.roots = { [rootNotation]: raw.root };
  delete raw.root;
}

function addMissingRoots(raw: RawModel) {
  if (!isObject(raw.roots)) raw.roots = {};
  for (const notation of NOTATION_LIST) {
    if (raw.roots[notation] && raw.diagrams[raw.roots[notation]]) continue;
    const id = `root-${notation}-${Math.random().toString(36).slice(2, 8)}`;
    raw.diagrams[id] = { id, notation, status: 'working', boxes: [], arrows: [] };
    raw.roots[notation] = id;
  }
}

function repairEndpoint(end: unknown): Endpoint {
  const free: Endpoint = { t: 'free', x: AREA.x + 40, y: AREA.y + 40 };
  if (!isObject(end)) return free;
  if (end.t === 'box' && typeof end.box === 'string' && SIDES.includes(end.side)) return end as Endpoint;
  if (end.t === 'border' && SIDES.includes(end.side) && isNumber(end.at)) return end as Endpoint;
  if (end.t === 'tap' && typeof end.arrow === 'string' && isNumber(end.x) && isNumber(end.y)) return end as Endpoint;
  if (isNumber(end.x) && isNumber(end.y)) return { t: 'free', x: end.x, y: end.y };
  return free;
}

function repairBox(box: Raw, index: number): Box {
  if (typeof box.kind !== 'string' || !Object.hasOwn(KINDS, box.kind)) box.kind = 'activity';
  const info = KINDS[box.kind as NodeKind];
  if (typeof box.id !== 'string' || !box.id) box.id = `box-${index}-${Math.random().toString(36).slice(2, 8)}`;
  box.name = asText(box.name);
  box.note = asText(box.note);
  box.w = isNumber(box.w) && box.w > 0 ? box.w : info.w;
  box.h = isNumber(box.h) && box.h > 0 ? box.h : info.h;
  box.x = isNumber(box.x) ? box.x : AREA.x + 40;
  box.y = isNumber(box.y) ? box.y : AREA.y + 40;
  if (box.child !== undefined && typeof box.child !== 'string') delete box.child;
  if (box.fontSize !== undefined && (!isNumber(box.fontSize) || box.fontSize <= 0)) delete box.fontSize;
  return box as Box;
}

function repairArrow(arrow: Raw, index: number): Arrow {
  if (typeof arrow.id !== 'string' || !arrow.id) arrow.id = `arrow-${index}-${Math.random().toString(36).slice(2, 8)}`;
  arrow.label = asText(arrow.label);
  arrow.note = asText(arrow.note);
  arrow.from = repairEndpoint(arrow.from);
  arrow.to = repairEndpoint(arrow.to);
  if (arrow.parent !== undefined && typeof arrow.parent !== 'string') delete arrow.parent;
  if (arrow.route !== undefined && !(Array.isArray(arrow.route) && arrow.route.every((p: unknown) => isObject(p) && isNumber(p.x) && isNumber(p.y)))) delete arrow.route;
  if (arrow.offsetFrom !== undefined && !isNumber(arrow.offsetFrom)) delete arrow.offsetFrom;
  if (arrow.offsetTo !== undefined && !isNumber(arrow.offsetTo)) delete arrow.offsetTo;
  if (arrow.labelAnchorRatio !== undefined && (!isNumber(arrow.labelAnchorRatio) || arrow.labelAnchorRatio < 0 || arrow.labelAnchorRatio > 1)) {
    delete arrow.labelAnchorRatio;
  }
  if (arrow.fontSize !== undefined && (!isNumber(arrow.fontSize) || arrow.fontSize <= 0)) delete arrow.fontSize;
  if (arrow.labelWidth !== undefined && (!isNumber(arrow.labelWidth) || arrow.labelWidth <= 0)) delete arrow.labelWidth;
  if (arrow.labelHeight !== undefined && (!isNumber(arrow.labelHeight) || arrow.labelHeight <= 0)) delete arrow.labelHeight;
  return arrow as Arrow;
}

function repairDiagram(diagram: Raw, id: string): Diagram {
  diagram.id = id;
  if (!NOTATION_LIST.includes(diagram.notation)) diagram.notation = 'idef0';
  if (!STATUSES.includes(diagram.status)) diagram.status = 'working';
  if (diagram.parent !== undefined && !(isObject(diagram.parent) && typeof diagram.parent.diagram === 'string' && typeof diagram.parent.box === 'string')) {
    delete diagram.parent;
  }
  diagram.boxes = objects(diagram.boxes).map(repairBox);
  diagram.arrows = objects(diagram.arrows).map(repairArrow);
  return diagram as Diagram;
}

function repair(raw: RawModel) {
  const meta = isObject(raw.meta) ? raw.meta : {};
  raw.meta = { name: 'Модель', author: '', purpose: '', viewpoint: '', created: '', modified: '', ...meta };
  for (const key of Object.keys(raw.meta)) raw.meta[key] = asText(raw.meta[key]);

  const abc = isObject(raw.abc) ? raw.abc : {};
  raw.abc = { currency: '₽', timeUnit: 'ч', centers: [], show: false, ...abc };
  raw.abc.centers = objects(abc.centers);
  for (const center of raw.abc.centers) {
    center.id = asText(center.id);
    center.name = asText(center.name);
    center.note = asText(center.note);
  }

  for (const [id, diagram] of Object.entries<Raw>(raw.diagrams)) repairDiagram(diagram, id);
  unlinkBrokenDecompositions(raw);
}

function unlinkBrokenDecompositions(raw: RawModel) {
  const diagrams: Record<string, Diagram> = raw.diagrams;
  const roots = new Set<string>(Object.values(raw.roots));
  const reached = new Set<string>();

  const visit = (id: string) => {
    reached.add(id);
    for (const box of diagrams[id].boxes) {
      if (!box.child) continue;
      const child = diagrams[box.child];
      const linkedBack = child?.parent?.diagram === id && child.parent.box === box.id;
      if (!linkedBack || reached.has(box.child) || roots.has(box.child)) delete box.child;
      else visit(box.child);
    }
  };

  for (const id of roots) {
    delete diagrams[id].parent;
    visit(id);
  }
  for (const [id, diagram] of Object.entries(diagrams)) {
    if (reached.has(id)) continue;
    for (const box of diagram.boxes) delete box.child;
  }
}

function parseJson(content: string): RawModel {
  try {
    return JSON.parse(content);
  } catch {
    throw new Error('Файл повреждён или это не JSON.');
  }
}

export function parseModel(content: string): Model {
  const raw = parseJson(content);
  if (!isObject(raw) || raw.format !== FORMAT) throw new Error('Это не файл модели Idefka.');
  if (typeof raw.version !== 'number' || raw.version > VERSION) throw new Error('Файл создан более новой версией Idefka. Обновите страницу.');
  if (!isObject(raw.diagrams)) throw new Error('В файле нет диаграмм.');
  raw.diagrams = Object.fromEntries(Object.entries(raw.diagrams).filter(([, diagram]) => isObject(diagram)));
  if (!raw.roots && !raw.diagrams[raw.root]) throw new Error('В файле нет корневой диаграммы.');

  // Сначала миграции по версиям, затем repair(): файл мог прийти из старой версии или быть поправлен руками.
  if (raw.version < 2) addNotationToDiagrams(raw);
  if (raw.version < 3) splitRootByNotation(raw);
  if (raw.version < 6) migrateToVersion6(raw);
  addMissingRoots(raw);
  repair(raw);
  raw.version = VERSION;

  const model = raw as Model;
  normalize(model);
  return model;
}

function migrateToVersion6(raw: RawModel) {
  // Новые поля опциональные, поэтому миграция может быть пустой.
  // Если хотите явно проставить дефолты для старых файлов — раскомментируйте:
  /*
  for (const diagram of Object.values<any>(raw.diagrams)) {
    for (const box of objects(diagram.boxes)) {
      if (box.fontSize === undefined) box.fontSize = 13;
    }
    for (const arrow of objects(diagram.arrows)) {
      if (arrow.fontSize === undefined) arrow.fontSize = 11.5;
    }
  }
  */
}
