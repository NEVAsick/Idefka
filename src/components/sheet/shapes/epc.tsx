import type { Box, JunctionType } from '../../../model/types';
import { DIAGRAM_FONT, INK, PAPER } from '../../../model/sheet';
import { ShapeLabel } from '../text';
import { centerOf, outline, type ShapeSet } from './types';

const COLORS = {
  event: '#f7d9ee',
  function: '#d8efd2',
  orgUnit: '#fff0bd',
  info: '#d5e5f9',
  system: '#e7e8ee',
};

function OperatorSymbol({ cx, cy, r, type }: { cx: number; cy: number; r: number; type: JunctionType }) {
  const k = r / 20;
  const stroke = { fill: 'none', stroke: INK, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
  if (type === 'and') return <path d={`M${cx - 7 * k} ${cy + 6 * k}L${cx} ${cy - 7 * k}L${cx + 7 * k} ${cy + 6 * k}`} {...stroke} />;
  if (type === 'or') return <path d={`M${cx - 7 * k} ${cy - 6 * k}L${cx} ${cy + 7 * k}L${cx + 7 * k} ${cy - 6 * k}`} {...stroke} />;
  return (
    <text x={cx} y={cy + 4 * k} fontSize={11 * k} fontWeight={700} fontFamily={DIAGRAM_FONT} fill={INK} textAnchor="middle">
      XOR
    </text>
  );
}

function DecomposedMarker({ box }: { box: Box }) {
  const cx = box.x + box.w / 2;
  const bottom = box.y + box.h;
  return (
    <g>
      <rect x={cx - 6} y={bottom - 15} width={12} height={12} fill={PAPER} stroke={INK} strokeWidth={1} />
      <path d={`M${cx - 3.5} ${bottom - 9}h7M${cx} ${bottom - 12.5}v7`} stroke={INK} strokeWidth={1.2} />
    </g>
  );
}

export const epcShapes: ShapeSet = {
  epcEvent: (box) => {
    const { x, y, w, h } = box;
    const { cy } = centerOf(box);
    const corner = Math.min(16, h / 2, w / 4);
    const points = `${x + corner},${y} ${x + w - corner},${y} ${x + w},${cy} ${x + w - corner},${y + h} ${x + corner},${y + h} ${x},${cy}`;
    return (
      <>
        <polygon points={points} fill={COLORS.event} {...outline} strokeLinejoin="round" />
        <ShapeLabel x={x + corner - 6} y={y} w={w - 2 * corner + 12} h={h} text={box.name} size={12} placeholder="Событие" />
      </>
    );
  },

  epcFunction: (box) => (
    <>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={10} fill={COLORS.function} {...outline} />
      <ShapeLabel x={box.x} y={box.y} w={box.w} h={box.h - (box.child ? 12 : 0)} text={box.name} size={12} placeholder="Функция" />
      {box.child && <DecomposedMarker box={box} />}
    </>
  ),

  epcConnector: (box) => {
    const { cx, cy } = centerOf(box);
    const r = Math.min(box.w, box.h) / 2;
    return (
      <>
        <circle cx={cx} cy={cy} r={r - 0.7} fill={PAPER} {...outline} />
        <OperatorSymbol cx={cx} cy={cy} r={r} type={box.junction ?? 'xor'} />
      </>
    );
  },

  orgUnit: (box) => {
    const { x, y, w, h } = box;
    const { cx, cy } = centerOf(box);
    const lineX = x + w * 0.14;
    const halfChord = (h / 2) * Math.sqrt(1 - ((lineX - cx) / (w / 2)) ** 2);
    return (
      <>
        <ellipse cx={cx} cy={cy} rx={w / 2 - 0.7} ry={h / 2 - 0.7} fill={COLORS.orgUnit} {...outline} />
        <line x1={lineX} y1={cy - halfChord} x2={lineX} y2={cy + halfChord} stroke={INK} strokeWidth={1.2} />
        <ShapeLabel x={x + w * 0.16} y={y} w={w * 0.76} h={h} text={box.name} size={11.5} placeholder="Исполнитель" />
      </>
    );
  },

  infoObject: (box) => {
    const { x, y, w, h } = box;
    return (
      <>
        <rect x={x} y={y} width={w} height={h} fill={COLORS.info} {...outline} />
        <path d={`M${x + 8} ${y}V${y + h}M${x + w - 8} ${y}V${y + h}`} stroke={INK} strokeWidth={1} />
        <ShapeLabel x={x + 8} y={y} w={w - 16} h={h} text={box.name} size={11.5} placeholder="Данные" />
      </>
    );
  },

  epcDocument: (box) => {
    const { x, y, w, h } = box;
    const wave = y + h - 9;
    return (
      <>
        <path d={`M${x} ${y}H${x + w}V${wave}Q${x + w * 0.75} ${y + h - 18} ${x + w / 2} ${wave}T${x} ${wave}Z`} fill={PAPER} {...outline} strokeLinejoin="round" />
        <ShapeLabel x={x} y={y} w={w} h={h - 10} text={box.name} size={11.5} placeholder="Документ" />
      </>
    );
  },

  appSystem: (box) => {
    const { x, y, w, h } = box;
    return (
      <>
        <rect x={x} y={y} width={w} height={h} fill={COLORS.system} {...outline} />
        <path d={`M${x + 9} ${y}V${y + h}M${x + 13} ${y}V${y + h}`} stroke={INK} strokeWidth={1} />
        <ShapeLabel x={x + 13} y={y} w={w - 13} h={h} text={box.name} size={11.5} placeholder="Система" />
      </>
    );
  },
};
