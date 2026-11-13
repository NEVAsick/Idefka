import type { Box } from '../../../model/types';
import { DIAGRAM_FONT, INK, PAPER } from '../../../model/sheet';
import { JUNCTIONS } from '../../../model/notation';
import { boxNumber } from '../../../model/query';
import { costOf, formatMoney } from '../../../model/abc';
import { BoxText, SMALL_TEXT } from '../text';
import type { ShapeContext, ShapeSet } from './types';

const bold = { stroke: INK, strokeWidth: 1.6 } as const;
const thin = { stroke: INK, strokeWidth: 1 } as const;

const numberOf = (box: Box, { model, diagram }: ShapeContext) => boxNumber(model, diagram.id, box.id);

function Activity({ box, context }: { box: Box; context: ShapeContext }) {
  const { model } = context;
  const cost = model.abc.show ? costOf(model, box) : null;
  const { x, y, w, h } = box;
  return (
    <>
      <rect x={x} y={y} width={w} height={h} fill={PAPER} {...bold} rx={1.5} />
      {!box.child && <line x1={x} y1={y + 11} x2={x + 11} y2={y} stroke={INK} strokeWidth={1.1} />}
      <BoxText box={box} bottom={cost ? 8 : 0} />
      <text x={x + w - 5} y={y + h - 5} {...SMALL_TEXT} textAnchor="end">
        {numberOf(box, context)}
      </text>
      {cost && (
        <text x={x + 5} y={y + h - 5} {...SMALL_TEXT}>
          {formatMoney(cost.total, model.abc.currency)}
        </text>
      )}
    </>
  );
}

export const idefShapes: ShapeSet = {
  activity: (box, context) => <Activity box={box} context={context} />,

  process: (box, context) => (
    <>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={10} fill={PAPER} {...bold} />
      <line x1={box.x} y1={box.y + 20} x2={box.x + box.w} y2={box.y + 20} {...thin} />
      <text x={box.x + 8} y={box.y + 14} {...SMALL_TEXT}>
        {numberOf(box, context)}
      </text>
      <BoxText box={box} top={20} />
    </>
  ),

  external: (box, context) => (
    <>
      <rect x={box.x + 5} y={box.y + 5} width={box.w} height={box.h} fill="#d8dbe0" {...thin} />
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={PAPER} {...bold} />
      <text x={box.x + 5} y={box.y + 12} {...SMALL_TEXT}>
        {numberOf(box, context)}
      </text>
      <BoxText box={box} top={6} />
    </>
  ),

  store: (box, context) => {
    const { x, y, w, h } = box;
    return (
      <>
        <rect x={x} y={y} width={w} height={h} fill={PAPER} stroke="none" />
        <path d={`M${x + w} ${y} H${x} V${y + h} H${x + w}`} fill="none" {...bold} />
        <line x1={x + 34} y1={y} x2={x + 34} y2={y + h} {...thin} />
        <text x={x + 17} y={y + h / 2 + 4} {...SMALL_TEXT} fontSize={11} fill={INK} textAnchor="middle">
          {numberOf(box, context)}
        </text>
        <BoxText box={{ ...box, x: x + 34, w: w - 34 }} />
      </>
    );
  },

  uow: (box, context) => {
    const { x, y, w, h } = box;
    const divider = x + w * 0.4;
    return (
      <>
        <rect x={x} y={y} width={w} height={h} fill={PAPER} {...bold} rx={1.5} />
        <line x1={x} y1={y + h - 18} x2={x + w} y2={y + h - 18} {...thin} />
        <line x1={divider} y1={y + h - 18} x2={divider} y2={y + h} {...thin} />
        <text x={x + (w * 0.4) / 2} y={y + h - 5} {...SMALL_TEXT} textAnchor="middle">
          {numberOf(box, context)}
        </text>
        <BoxText box={box} bottom={18} />
      </>
    );
  },

  junction: (box, context) => {
    const { x, y, w, h } = box;
    return (
      <>
        <rect x={x} y={y} width={w} height={h} fill={PAPER} {...bold} />
        <line x1={x + 6} y1={y} x2={x + 6} y2={y + h} stroke={INK} strokeWidth={1.2} />
        {box.sync && <line x1={x + w - 6} y1={y} x2={x + w - 6} y2={y + h} stroke={INK} strokeWidth={1.2} />}
        <text x={x + w / 2 + (box.sync ? 0 : 3)} y={y + h / 2 + 6} fontSize={16} fontWeight={700} fontFamily={DIAGRAM_FONT} fill={INK} textAnchor="middle">
          {JUNCTIONS[box.junction ?? 'xor'].symbol}
        </text>
        <text x={x + w / 2} y={y + h + 13} {...SMALL_TEXT} textAnchor="middle">
          {numberOf(box, context)}
        </text>
      </>
    );
  },

  referent: (box) => (
    <>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={PAPER} {...thin} />
      <BoxText box={box} size={12} />
    </>
  ),

  text: (box) => (
    <>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="transparent" stroke="none" />
      <BoxText box={box} size={12} />
    </>
  ),
};
