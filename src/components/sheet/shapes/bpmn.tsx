import type { Box, EventTrigger } from '../../../model/types';
import { DIAGRAM_FONT, INK, PAPER } from '../../../model/sheet';
import { wrap } from '../../../model/text';
import { BelowLabel, BoxText, LeftText } from '../text';
import { centerOf, diamondPoints, type ShapeSet } from './types';

function pentagon(cx: number, cy: number, r: number) {
  return Array.from({ length: 5 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');
}

function TriggerIcon({ cx, cy, r, trigger, filled }: { cx: number; cy: number; r: number; trigger: EventTrigger; filled: boolean }) {
  const k = r / 18;
  const fill = filled ? INK : 'none';
  const stroke = { stroke: INK, strokeWidth: 1.1 } as const;

  switch (trigger) {
    case 'message': {
      const w = 16 * k;
      const h = 11 * k;
      return (
        <g>
          <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} fill={filled ? INK : PAPER} {...stroke} />
          <path d={`M${cx - w / 2} ${cy - h / 2}L${cx} ${cy + h * 0.1}L${cx + w / 2} ${cy - h / 2}`} fill="none" stroke={filled ? PAPER : INK} strokeWidth={1.1} />
        </g>
      );
    }
    case 'timer':
      return (
        <g>
          <circle cx={cx} cy={cy} r={10 * k} fill={PAPER} {...stroke} />
          <path d={`M${cx} ${cy - 7 * k}V${cy}L${cx + 5 * k} ${cy + 3 * k}`} fill="none" stroke={INK} strokeWidth={1.2} />
        </g>
      );
    case 'error': {
      const points = [
        [-8, 8],
        [-4, -7],
        [2, 2],
        [8, -8],
        [4, 7],
        [-2, -2],
      ].map(([dx, dy]) => `${cx + dx * k},${cy + dy * k}`);
      return <polygon points={points.join(' ')} fill={fill} {...stroke} strokeLinejoin="round" />;
    }
    case 'signal':
      return <polygon points={`${cx},${cy - 9 * k} ${cx + 8.5 * k},${cy + 6 * k} ${cx - 8.5 * k},${cy + 6 * k}`} fill={fill} {...stroke} strokeLinejoin="round" />;
    case 'terminate':
      return <circle cx={cx} cy={cy} r={9 * k} fill={INK} />;
    default:
      return null;
  }
}

const EVENT_BORDER: Partial<Record<Box['kind'], number>> = { startEvent: 1.6, intermediateEvent: 1.3, endEvent: 3.4 };

function Event({ box }: { box: Box }) {
  const { cx, cy } = centerOf(box);
  const r = Math.min(box.w, box.h) / 2;
  const border = EVENT_BORDER[box.kind]!;
  return (
    <>
      <circle cx={cx} cy={cy} r={r - border / 2} fill={PAPER} stroke={INK} strokeWidth={border} />
      {box.kind === 'intermediateEvent' && <circle cx={cx} cy={cy} r={r - 4} fill="none" stroke={INK} strokeWidth={1.3} />}
      <TriggerIcon cx={cx} cy={cy} r={r} trigger={box.trigger ?? 'none'} filled={box.kind === 'endEvent'} />
      <BelowLabel box={box} />
    </>
  );
}

function Gateway({ box }: { box: Box }) {
  const { cx, cy } = centerOf(box);
  const q = Math.min(box.w, box.h) * 0.2;
  const type = box.gateway ?? 'xor';
  const mark = { stroke: INK, strokeWidth: 3, strokeLinecap: 'round' } as const;
  return (
    <>
      <polygon points={diamondPoints(box)} fill={PAPER} stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
      {type === 'xor' && <path d={`M${cx - q} ${cy - q}L${cx + q} ${cy + q}M${cx + q} ${cy - q}L${cx - q} ${cy + q}`} {...mark} />}
      {type === 'and' && <path d={`M${cx - q * 1.2} ${cy}H${cx + q * 1.2}M${cx} ${cy - q * 1.2}V${cy + q * 1.2}`} {...mark} />}
      {type === 'or' && <circle cx={cx} cy={cy} r={q * 1.1} fill="none" stroke={INK} strokeWidth={2.6} />}
      {type === 'event' && (
        <>
          <circle cx={cx} cy={cy} r={q * 1.35} fill="none" stroke={INK} strokeWidth={1} />
          <circle cx={cx} cy={cy} r={q * 1.1} fill="none" stroke={INK} strokeWidth={1} />
          <polygon points={pentagon(cx, cy, q * 0.65)} fill="none" stroke={INK} strokeWidth={1} />
        </>
      )}
      <BelowLabel box={box} />
    </>
  );
}

function Swimlane({ box }: { box: Box }) {
  const isPool = box.kind === 'pool';
  const band = isPool ? 30 : 24;
  const lines = wrap(box.name || '', box.h - 12, 12, isPool ? 700 : 400).slice(0, 2);
  const cx = box.x + band / 2;
  const cy = box.y + box.h / 2;
  return (
    <>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={isPool ? PAPER : 'transparent'} stroke={INK} strokeWidth={isPool ? 1.5 : 1} />
      <line x1={box.x + band} y1={box.y} x2={box.x + band} y2={box.y + box.h} stroke={INK} strokeWidth={isPool ? 1.3 : 0.9} />
      <text fontSize={12} fontWeight={isPool ? 700 : 400} fontFamily={DIAGRAM_FONT} fill={INK} textAnchor="middle" transform={`rotate(-90 ${cx} ${cy})`}>
        {lines.map((line, i) => (
          <tspan key={i} x={cx} y={cy + 4 + (i - (lines.length - 1) / 2) * 14}>
            {line}
          </tspan>
        ))}
      </text>
    </>
  );
}

function SubprocessMarker({ box }: { box: Box }) {
  const cx = box.x + box.w / 2;
  const bottom = box.y + box.h;
  return (
    <g>
      <rect x={cx - 7} y={bottom - 17} width={14} height={14} fill={PAPER} stroke={INK} strokeWidth={1.1} />
      <path d={`M${cx - 4} ${bottom - 10}h8M${cx} ${bottom - 14}v8`} stroke={INK} strokeWidth={1.3} />
    </g>
  );
}

export const bpmnShapes: ShapeSet = {
  task: (box) => (
    <>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={10} fill={PAPER} stroke={INK} strokeWidth={1.5} />
      <BoxText box={box} bottom={box.child ? 12 : 0} size={12.5} />
      {box.child && <SubprocessMarker box={box} />}
    </>
  ),

  startEvent: (box) => <Event box={box} />,
  intermediateEvent: (box) => <Event box={box} />,
  endEvent: (box) => <Event box={box} />,
  gateway: (box) => <Gateway box={box} />,

  dataObject: (box) => {
    const { x, y, w, h } = box;
    const fold = Math.min(10, w / 3);
    return (
      <>
        <path d={`M${x} ${y}H${x + w - fold}L${x + w} ${y + fold}V${y + h}H${x}Z`} fill={PAPER} stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
        <path d={`M${x + w - fold} ${y}V${y + fold}H${x + w}`} fill="none" stroke={INK} strokeWidth={1.1} />
        <BelowLabel box={box} />
      </>
    );
  },

  dataStore: (box) => {
    const { x, y, w, h } = box;
    const e = Math.min(8, h / 5);
    const right = x + w;
    return (
      <>
        <path d={`M${x} ${y + e}A${w / 2} ${e} 0 0 1 ${right} ${y + e}V${y + h - e}A${w / 2} ${e} 0 0 1 ${x} ${y + h - e}Z`} fill={PAPER} stroke={INK} strokeWidth={1.3} />
        <path d={`M${x} ${y + e}A${w / 2} ${e} 0 0 0 ${right} ${y + e}`} fill="none" stroke={INK} strokeWidth={1.1} />
        <path d={`M${x} ${y + e * 2.2}A${w / 2} ${e} 0 0 0 ${right} ${y + e * 2.2}`} fill="none" stroke={INK} strokeWidth={0.8} opacity={0.6} />
        <BelowLabel box={box} />
      </>
    );
  },

  annotation: (box) => {
    const { x, y, w, h } = box;
    const lines = wrap(box.name || 'Комментарий', w - 14, 11.5).slice(0, Math.max(1, Math.floor((h - 6) / 14)));
    return (
      <>
        <rect x={x} y={y} width={w} height={h} fill="transparent" />
        <path d={`M${x + 14} ${y}H${x}V${y + h}H${x + 14}`} fill="none" stroke={INK} strokeWidth={1.3} />
        <LeftText x={x + 8} y={y + h / 2 - (lines.length * 14) / 2 + 11} lines={lines} />
      </>
    );
  },

  pool: (box) => <Swimlane box={box} />,
  lane: (box) => <Swimlane box={box} />,
};
