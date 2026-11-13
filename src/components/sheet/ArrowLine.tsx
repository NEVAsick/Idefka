import type { ReactNode } from 'react';
import type { Arrow, Card, NodeKind, Pt } from '../../model/types';
import { DANGLING, DIAGRAM_FONT, INK, PAPER } from '../../model/sheet';
import type { ArrowGeom } from '../../model/geometry';
import { arrowHead, diamondAt, openHead, pathD } from '../../model/path';
import { isHorizontal, opposite, RIGHT, DOWN, STEP, type Dir } from '../../model/router';
import { linkStyle } from '../../model/links';

function Tunnel({ at, dir, color }: { at: Pt; dir: Dir; color: string }) {
  const { x, y } = at;
  const d = isHorizontal(dir)
    ? `M${x - 3} ${y - 7} Q${x - 8} ${y} ${x - 3} ${y + 7} M${x + 3} ${y - 7} Q${x + 8} ${y} ${x + 3} ${y + 7}`
    : `M${x - 7} ${y - 3} Q${x} ${y - 8} ${x + 7} ${y - 3} M${x - 7} ${y + 3} Q${x} ${y + 8} ${x + 7} ${y + 3}`;
  return <path d={d} fill="none" stroke={color} strokeWidth={1.4} />;
}

function CrowFoot({ at, inward, card, color }: { at: Pt; inward: Dir; card: Card; color: string }) {
  const { x: ux, y: uy } = STEP[inward];
  const offset = (back: number, side = 0) => ({ x: at.x - ux * back - uy * side, y: at.y - uy * back + ux * side });
  const many = card === '1n' || card === '0n';
  const zero = card === '01' || card === '0n';
  const marks: ReactNode[] = [];

  const bar = (back: number, key: string) => {
    const a = offset(back, 6);
    const b = offset(back, -6);
    marks.push(<line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={1.4} />);
  };

  if (many) {
    const root = offset(12);
    for (const side of [7, 0, -7]) {
      const toe = offset(0, side);
      marks.push(<line key={`toe${side}`} x1={root.x} y1={root.y} x2={toe.x} y2={toe.y} stroke={color} strokeWidth={1.3} />);
    }
  } else {
    bar(7, 'one');
  }

  if (zero) {
    const c = offset(many ? 19 : 15);
    marks.push(<circle key="zero" cx={c.x} cy={c.y} r={4} fill={PAPER} stroke={color} strokeWidth={1.3} />);
  } else {
    bar(many ? 16 : 12, 'min');
  }
  return <g>{marks}</g>;
}

function EndText({ at, away, text, color }: { at: Pt; away: Dir; text: string; color: string }) {
  const horizontal = isHorizontal(away);
  const x = horizontal ? at.x + (away === RIGHT ? 7 : -7) : at.x + 6;
  const y = horizontal ? at.y - 6 : at.y + (away === DOWN ? 17 : -9);
  const anchor = horizontal && away !== RIGHT ? 'end' : 'start';
  return (
    <text x={x} y={y} fontSize={11} fontFamily={DIAGRAM_FONT} fill={color} textAnchor={anchor} stroke={PAPER} strokeWidth={3} paintOrder="stroke">
      {text}
    </text>
  );
}

function objectFlowSecondHead(points: Pt[], dir: Dir) {
  const end = points[points.length - 1];
  const prev = points[points.length - 2] ?? end;
  const length = Math.hypot(end.x - prev.x, end.y - prev.y) || 1;
  const k = Math.min(8, length - 1) / length;
  return arrowHead({ x: end.x - (end.x - prev.x) * k, y: end.y - (end.y - prev.y) * k }, dir);
}

interface ArrowLineProps {
  geom: ArrowGeom;
  arrow: Arrow;
  fromKind?: NodeKind;
  toKind?: NodeKind;
  large: boolean;
}

export function ArrowLine({ geom: g, arrow, fromKind, toKind, large }: ArrowLineProps) {
  const color = g.danglingFrom || g.danglingTo ? DANGLING : (arrow.color ?? INK);
  const start = g.points[0];
  const end = g.points[g.points.length - 1];
  const link = arrow.link;
  const style = linkStyle(link);

  const toAnnotation = fromKind === 'annotation' || toKind === 'annotation';
  const head = g.headless || (link === 'association' && toAnnotation) ? 'none' : style.head;
  const tail = g.branch ? 'none' : style.tail;
  const bidirectional = !!arrow.bidir && !g.branch;
  const diamond = tail === 'diamond' || tail === 'filledDiamond';

  const headPoints = large && head === 'filled' ? arrowHead(end, g.endDir, 11, 4.4) : arrowHead(end, g.endDir);
  const endInset = head === 'none' ? 0 : head === 'lines' ? 1 : head === 'hollow' ? 13 : large ? 8 : 6;
  const startInset = bidirectional ? 6 : tail === 'circle' ? 4 : diamond ? 17 : 0;
  const mult0 = arrow.mult0?.trim();
  const mult1 = arrow.mult1?.trim();

  return (
    <g>
      <path d={pathD(g.points, endInset, 5, startInset)} fill="none" stroke={color} strokeWidth={1.3} strokeLinejoin="round" strokeDasharray={style.dash} />
      {head === 'filled' && <polygon points={headPoints} fill={color} />}
      {head === 'open' && <polygon points={headPoints} fill={PAPER} stroke={color} strokeWidth={1.2} strokeLinejoin="round" />}
      {head === 'hollow' && <polygon points={arrowHead(end, g.endDir, 14, 7.5)} fill={PAPER} stroke={color} strokeWidth={1.3} strokeLinejoin="round" />}
      {head === 'lines' && <polyline points={openHead(end, g.endDir, large ? 11 : 9, large ? 5.5 : 4)} fill="none" stroke={color} strokeWidth={1.3} strokeLinejoin="round" />}
      {tail === 'circle' && <circle cx={start.x} cy={start.y} r={3.5} fill={PAPER} stroke={color} strokeWidth={1.2} />}
      {diamond && <polygon points={diamondAt(start, g.startDir)} fill={tail === 'filledDiamond' ? color : PAPER} stroke={color} strokeWidth={1.3} strokeLinejoin="round" />}
      {style.crow && !g.branch && <CrowFoot at={start} inward={opposite(g.startDir)} card={arrow.card0 ?? '1'} color={color} />}
      {style.crow && !g.headless && <CrowFoot at={end} inward={g.endDir} card={arrow.card1 ?? '0n'} color={color} />}
      {link === 'object' && head === 'filled' && <polygon points={objectFlowSecondHead(g.points, g.endDir)} fill={color} />}
      {bidirectional && <polygon points={arrowHead(start, opposite(g.startDir))} fill={color} />}
      {g.tunnelAt && <Tunnel at={g.tunnelAt.point} dir={g.tunnelAt.dir} color={color} />}
      {g.danglingFrom && tail !== 'circle' && <circle cx={start.x} cy={start.y} r={3} fill={PAPER} stroke={color} strokeWidth={1.3} />}
      {mult0 && <EndText at={start} away={g.startDir} text={mult0} color={color} />}
      {mult1 && <EndText at={end} away={opposite(g.endDir)} text={mult1} color={color} />}
    </g>
  );
}
