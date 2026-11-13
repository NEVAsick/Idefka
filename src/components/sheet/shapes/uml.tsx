import type { ReactNode } from 'react';
import type { Box } from '../../../model/types';
import { DIAGRAM_FONT, INK, PAPER } from '../../../model/sheet';
import { lifelineHead } from '../../../model/notation';
import { headHeight, parseAttr, ROW, sections, sectionHeight, stereotypeOf, type Section } from '../../../model/compartments';
import { measure, wrap } from '../../../model/text';
import { BelowLabel, clip, firstLine, LeftText, MUTED, ShapeLabel } from '../text';
import { centerOf, diamondPoints, outline, type ShapeSet } from './types';

const NOTE_COLOR = '#fffbe8';
const ENTITY_HEAD = '#eef2f8';
const KEY_COLORS = { PK: '#b26a00', FK: '#3d6fb8' };
const DEPTH = 12;

const text = (size: number, extra: object = {}) => ({ fontSize: size, fontFamily: DIAGRAM_FONT, fill: INK, ...extra });
const nameColor = (box: Box) => (box.name ? INK : MUTED);

function StickFigure({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const cx = x + w / 2;
  const r = Math.min(w * 0.22, h * 0.11);
  const headY = y + r + 1;
  const hips = y + h * 0.62;
  const arms = y + h * 0.36;
  const limbs = `M${cx} ${headY + r}V${hips}M${x + 2} ${arms}H${x + w - 2}M${cx} ${hips}L${x + 4} ${y + h - 1}M${cx} ${hips}L${x + w - 4} ${y + h - 1}`;
  return (
    <g fill="none" stroke={INK} strokeWidth={1.5} strokeLinecap="round">
      <circle cx={cx} cy={headY} r={r} fill={PAPER} />
      <path d={limbs} />
    </g>
  );
}

function Stereotype({ x, y, value, maxWidth, anchor = 'middle' }: { x: number; y: number; value: string; maxWidth: number; anchor?: 'middle' | 'start' }) {
  return (
    <text x={x} y={y} {...text(10.5)} textAnchor={anchor === 'middle' ? 'middle' : undefined}>
      «{clip(value, maxWidth, 10.5)}»
    </text>
  );
}

function SectionLine({ box, section, line, baseline }: { box: Box; section: Section; line: string; baseline: number }) {
  const isEntity = box.kind === 'entity';
  if (section.kind !== 'keys' && !(isEntity && section.kind === 'attrs')) {
    return (
      <text x={box.x + 7} y={baseline} {...text(11.5)}>
        {clip(line.trim(), box.w - 14, 11.5)}
      </text>
    );
  }
  const isKey = section.kind === 'keys';
  const attribute = isKey ? { text: line.trim(), fk: false } : parseAttr(line);
  const mark = isKey ? 'PK' : attribute.fk ? 'FK' : '';
  return (
    <g>
      {mark && (
        <text x={box.x + 7} y={baseline} {...text(9)} fontWeight={700} fill={KEY_COLORS[mark]}>
          {mark}
        </text>
      )}
      <text x={box.x + 28} y={baseline} {...text(11.5)} textDecoration={isKey ? 'underline' : undefined}>
        {clip(attribute.text, box.w - 34, 11.5)}
      </text>
    </g>
  );
}

function Compartments({ box }: { box: Box }) {
  const { x, y, w, h } = box;
  const head = headHeight(box);
  const stereotype = box.kind === 'entity' ? '' : stereotypeOf(box);
  const italic = stereotype === 'abstract' || box.kind === 'interface';
  const lastBaseline = y + h - 3;

  const rows: ReactNode[] = [];
  let top = y + head;
  sections(box).forEach((section, s) => {
    if (top >= y + h - 1) return;
    rows.push(<line key={`line-${s}`} x1={x} y1={top} x2={x + w} y2={top} stroke={INK} strokeWidth={1} />);
    section.lines.forEach((line, i) => {
      const baseline = top + 4 + (i + 1) * ROW - 3;
      if (baseline <= lastBaseline) rows.push(<SectionLine key={`${s}-${i}`} box={box} section={section} line={line} baseline={baseline} />);
    });
    top += sectionHeight(section);
  });

  return (
    <>
      <rect x={x} y={y} width={w} height={h} fill={PAPER} stroke={INK} strokeWidth={1.4} rx={box.kind === 'entity' ? 3 : 0} />
      {box.kind === 'entity' && <path d={`M${x + 0.7} ${y + head}V${y + 3}q0-2.3 2.3-2.3H${x + w - 3}q2.3 0 2.3 2.3V${y + head}Z`} fill={ENTITY_HEAD} />}
      {stereotype && <Stereotype x={x + w / 2} y={y + 15} value={stereotype} maxWidth={w - 28} />}
      <text x={x + w / 2} y={y + (stereotype ? 31 : 19)} {...text(13)} fontWeight={700} fontStyle={italic ? 'italic' : undefined} fill={nameColor(box)} textAnchor="middle">
        {clip(firstLine(box.name) || 'Без названия', w - 14, 13, 700)}
      </text>
      {rows}
    </>
  );
}

function Lifeline({ box }: { box: Box }) {
  const { x, y, w, h } = box;
  const { cx } = centerOf(box);
  const head = lifelineHead(box.kind);
  const isObject = box.kind === 'lifeline';
  return (
    <>
      {isObject ? (
        <>
          <rect x={x} y={y} width={w} height={head} fill={PAPER} {...outline} />
          <text x={cx} y={y + head / 2 + 4.5} {...text(12.5)} fill={nameColor(box)} textAnchor="middle">
            {clip(firstLine(box.name) || 'Объект', w - 12, 12.5)}
          </text>
        </>
      ) : (
        <>
          <rect x={x} y={y} width={w} height={head} fill="transparent" />
          <StickFigure x={cx - 14} y={y + 2} w={28} h={46} />
          <text x={cx} y={y + 62} {...text(11.5)} fill={nameColor(box)} textAnchor="middle" stroke={PAPER} strokeWidth={3} paintOrder="stroke">
            {clip(firstLine(box.name) || 'Актёр', w + 30, 11.5)}
          </text>
        </>
      )}
      <line x1={cx} y1={y + head} x2={cx} y2={y + h} stroke={INK} strokeWidth={1.1} strokeDasharray="6 5" />
      <line x1={cx} y1={y + head} x2={cx} y2={y + h} stroke="transparent" strokeWidth={16} />
    </>
  );
}

function Fragment({ box }: { box: Box }) {
  const { x, y, w, h } = box;
  const operator = (box.stereotype || 'alt').trim();
  const tagWidth = measure(operator, 11.5, 700) + 18;
  return (
    <>
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={INK} strokeWidth={1.2} />
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="transparent" strokeWidth={10} pointerEvents="stroke" />
      <path d={`M${x} ${y}H${x + tagWidth}V${y + 13}L${x + tagWidth - 7} ${y + 20}H${x}Z`} fill={PAPER} stroke={INK} strokeWidth={1.1} />
      <text x={x + 7} y={y + 14.5} {...text(11.5)} fontWeight={700}>
        {operator}
      </text>
      {box.name.trim() && (
        <text x={x + tagWidth + 8} y={y + 15} {...text(11.5)}>
          {clip(firstLine(box.name), w - tagWidth - 16, 11.5)}
        </text>
      )}
    </>
  );
}

function DeploymentNode({ box }: { box: Box }) {
  const { x, y, w, h } = box;
  const stereotype = stereotypeOf(box);
  const faceStroke = { stroke: INK, strokeWidth: 1.2, strokeLinejoin: 'round' } as const;
  return (
    <>
      <polygon points={`${x},${y + DEPTH} ${x + DEPTH},${y} ${x + w},${y} ${x + w - DEPTH},${y + DEPTH}`} fill="#f1f3f7" {...faceStroke} />
      <polygon points={`${x + w - DEPTH},${y + DEPTH} ${x + w},${y} ${x + w},${y + h - DEPTH} ${x + w - DEPTH},${y + h}`} fill="#e3e7ee" {...faceStroke} />
      <rect x={x} y={y + DEPTH} width={w - DEPTH} height={h - DEPTH} fill={PAPER} {...outline} />
      {stereotype && <Stereotype x={x + 10} y={y + DEPTH + 16} value={stereotype} maxWidth={w - DEPTH - 30} anchor="start" />}
      <text x={x + 10} y={y + DEPTH + (stereotype ? 32 : 19)} {...text(12.5)} fontWeight={700} fill={nameColor(box)}>
        {clip(firstLine(box.name) || 'Узел', w - DEPTH - 20, 12.5, 700)}
      </text>
    </>
  );
}

function ComponentIcon({ x, y }: { x: number; y: number }) {
  const part = { fill: PAPER, stroke: INK, strokeWidth: 1 };
  return (
    <>
      <rect x={x} y={y} width={13} height={16} {...part} />
      <rect x={x - 4} y={y + 3} width={8} height={3.5} {...part} />
      <rect x={x - 4} y={y + 9.5} width={8} height={3.5} {...part} />
    </>
  );
}

export const umlShapes: ShapeSet = {
  umlNote: (box) => {
    const { x, y, w, h } = box;
    const fold = Math.min(12, w / 4, h / 3);
    const lines = wrap(box.name || 'Примечание', w - 16, 11.5).slice(0, Math.max(1, Math.floor((h - 8) / 14)));
    return (
      <>
        <path d={`M${x} ${y}H${x + w - fold}L${x + w} ${y + fold}V${y + h}H${x}Z`} fill={NOTE_COLOR} stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
        <path d={`M${x + w - fold} ${y}V${y + fold}H${x + w}`} fill="none" stroke={INK} strokeWidth={1} />
        <LeftText x={x + 8} y={y + 17} lines={lines} color={nameColor(box)} />
      </>
    );
  },

  actor: (box) => (
    <>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="transparent" />
      <StickFigure x={box.x} y={box.y} w={box.w} h={box.h} />
      <BelowLabel box={box} />
    </>
  ),

  useCase: (box) => {
    const { cx, cy } = centerOf(box);
    return (
      <>
        <ellipse cx={cx} cy={cy} rx={box.w / 2 - 0.7} ry={box.h / 2 - 0.7} fill={PAPER} {...outline} />
        <ShapeLabel x={box.x + box.w * 0.12} y={box.y} w={box.w * 0.76} h={box.h} text={box.name} size={12} placeholder="Прецедент" />
      </>
    );
  },

  systemBoundary: (box) => (
    <>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={PAPER} stroke={INK} strokeWidth={1.3} />
      <text x={box.x + box.w / 2} y={box.y + 20} {...text(13)} fontWeight={700} fill={nameColor(box)} textAnchor="middle">
        {clip(box.name || 'Система', box.w - 16, 13, 700)}
      </text>
    </>
  ),

  class: (box) => <Compartments box={box} />,
  interface: (box) => <Compartments box={box} />,
  enumeration: (box) => <Compartments box={box} />,
  entity: (box) => <Compartments box={box} />,

  lifeline: (box) => <Lifeline box={box} />,
  actorLine: (box) => <Lifeline box={box} />,
  activation: (box) => <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={PAPER} stroke={INK} strokeWidth={1.2} />,
  fragment: (box) => <Fragment box={box} />,

  action: (box) => {
    const { x, y, w, h } = box;
    return (
      <>
        <rect x={x} y={y} width={w} height={h} rx={Math.min(16, h / 2)} fill={PAPER} {...outline} />
        <ShapeLabel x={x + 4} y={y} w={w - 8} h={h} text={box.name} size={12} placeholder="Действие" />
        {box.child && <path d={`M${x + w - 16} ${y + h - 16}v5M${x + w - 21} ${y + h - 6}v-5h10v5M${x + w - 16} ${y + h - 11}v5`} fill="none" stroke={INK} strokeWidth={1.2} />}
      </>
    );
  },

  initialNode: (box) => {
    const { cx, cy } = centerOf(box);
    return <circle cx={cx} cy={cy} r={Math.min(box.w, box.h) / 2} fill={INK} />;
  },

  finalNode: (box) => {
    const { cx, cy } = centerOf(box);
    const r = Math.min(box.w, box.h) / 2;
    return (
      <>
        <circle cx={cx} cy={cy} r={r - 0.8} fill={PAPER} stroke={INK} strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={r - 5.5} fill={INK} />
      </>
    );
  },

  flowFinal: (box) => {
    const { cx, cy } = centerOf(box);
    const r = Math.min(box.w, box.h) / 2;
    const q = r * 0.7;
    return (
      <>
        <circle cx={cx} cy={cy} r={r - 0.8} fill={PAPER} stroke={INK} strokeWidth={1.4} />
        <path d={`M${cx - q} ${cy - q}L${cx + q} ${cy + q}M${cx + q} ${cy - q}L${cx - q} ${cy + q}`} stroke={INK} strokeWidth={1.3} />
      </>
    );
  },

  decision: (box) => <polygon points={diamondPoints(box)} fill={PAPER} {...outline} strokeLinejoin="round" />,
  forkBar: (box) => <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={1.5} fill={INK} />,

  objectNode: (box) => (
    <>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={PAPER} stroke={INK} strokeWidth={1.3} />
      <ShapeLabel x={box.x} y={box.y} w={box.w} h={box.h} text={box.name} size={12} placeholder="Объект" />
    </>
  ),

  partition: (box) => {
    const { x, y, w, h } = box;
    return (
      <>
        <rect x={x} y={y} width={w} height={h} fill="transparent" stroke={INK} strokeWidth={1.2} />
        <line x1={x} y1={y + 30} x2={x + w} y2={y + 30} stroke={INK} strokeWidth={1.1} />
        <text x={x + w / 2} y={y + 20} {...text(12.5)} fontWeight={700} fill={nameColor(box)} textAnchor="middle">
          {clip(firstLine(box.name) || 'Раздел', w - 12, 12.5, 700)}
        </text>
      </>
    );
  },

  deployNode: (box) => <DeploymentNode box={box} />,
  device: (box) => <DeploymentNode box={box} />,

  component: (box) => {
    const { x, y, w, h } = box;
    const stereotype = stereotypeOf(box);
    const shift = stereotype ? 10 : 0;
    return (
      <>
        <rect x={x} y={y} width={w} height={h} fill={PAPER} {...outline} />
        <ComponentIcon x={x + w - 22} y={y + 8} />
        {stereotype && <Stereotype x={x + w / 2} y={y + 16} value={stereotype} maxWidth={w - 50} />}
        <ShapeLabel x={x + 4} y={y + shift} w={w - 30} h={h - shift} text={box.name} size={12} placeholder="Компонент" />
      </>
    );
  },

  artifact: (box) => {
    const { x, y, w, h } = box;
    const iconX = x + w - 18;
    const iconY = y + 7;
    return (
      <>
        <rect x={x} y={y} width={w} height={h} fill={PAPER} {...outline} />
        <path d={`M${iconX} ${iconY}h7l4 4v11h-11z M${iconX + 7} ${iconY}v4h4`} fill={PAPER} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
        <Stereotype x={x + w / 2} y={y + 17} value={stereotypeOf(box)} maxWidth={w - 44} />
        <ShapeLabel x={x + 4} y={y + 14} w={w - 8} h={h - 14} text={box.name} size={12} placeholder="Артефакт" />
      </>
    );
  },
};
