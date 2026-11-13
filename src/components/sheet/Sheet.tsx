import type { Arrow, Box, Diagram, Endpoint, Model, Pt } from '../../model/types';
import { AREA, DIAGRAM_FONT, INK, PAPER, SHEET_H, SHEET_W } from '../../model/sheet';
import { LABEL_LH, LABEL_SIZE, type ArrowGeom } from '../../model/geometry';
import { nearestOnRect, projectOnPath, squigglePoints, type Bounds } from '../../model/path';
import { isContainer, isLifeline } from '../../model/notation';
import { wrap } from '../../model/text';
import { Frame } from './Frame';
import { BoxShape } from './shapes';
import { ArrowLine } from './ArrowLine';

const LARGE_HEAD_NOTATIONS = new Set(['usecase', 'class', 'sequence', 'activity', 'deployment', 'epc']);

export interface SheetProps {
  model: Model;
  diagram: Diagram;
  geom: ArrowGeom[];
  showFrame: boolean;
  interactive?: boolean;
  hiddenLabel?: string | null;
}

function Squiggle({ from, path, color }: { from: Bounds; path: Pt[]; color: string }) {
  const center = { x: (from.x1 + from.x2) / 2, y: (from.y1 + from.y2) / 2 };
  const target = projectOnPath(path, center).point;
  const points = squigglePoints(nearestOnRect(from, target), target);
  if (!points) return null;
  return <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={1} />;
}

function ContextNotes({ model }: { model: Model }) {
  const purpose = model.meta.purpose.trim();
  const viewpoint = model.meta.viewpoint.trim();
  if (!purpose && !viewpoint) return null;

  const paragraphs = [purpose && `Цель: ${purpose}`, viewpoint && `Точка зрения: ${viewpoint}`].filter(Boolean) as string[];
  const lines = paragraphs.flatMap((p) => wrap(p, 760, 11)).slice(-4);
  return (
    <text fontSize={11} fontFamily={DIAGRAM_FONT} fill={INK}>
      {lines.map((line, i) => (
        <tspan key={i} x={AREA.x + 16} y={AREA.y + AREA.h - 14 - (lines.length - 1 - i) * 14}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function ArrowLabel({ geom: g, color, interactive }: { geom: ArrowGeom; color: string; interactive: boolean }) {
  return (
    <text
      data-k={interactive ? 'label' : undefined}
      data-id={interactive ? g.id : undefined}
      x={g.labelAt.x}
      y={g.labelAt.y}
      fontSize={LABEL_SIZE}
      fontFamily={DIAGRAM_FONT}
      fill={color}
      textAnchor={g.labelAnchor}
      stroke={PAPER}
      strokeWidth={4}
      strokeLinejoin="round"
      paintOrder="stroke"
      style={interactive ? { cursor: 'move' } : undefined}
    >
      {g.lines.map((line, i) => (
        <tspan key={i} x={g.labelAt.x} y={g.labelAt.y + i * LABEL_LH}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function drawingOrder(diagram: Diagram) {
  const containers = diagram.boxes.filter((b) => isContainer(b.kind)).sort((a, b) => b.w * b.h - a.w * a.h);
  const underArrows =
    diagram.notation === 'sequence' ? [...diagram.boxes.filter((b) => isLifeline(b.kind)), ...diagram.boxes.filter((b) => b.kind === 'activation')] : [];
  const overArrows = diagram.boxes.filter((b) => !isContainer(b.kind) && !underArrows.includes(b));
  return { below: [...containers, ...underArrows], above: overArrows };
}

export function SheetContent({ model, diagram, geom, showFrame, interactive = false, hiddenLabel }: SheetProps) {
  const arrowById = new Map(diagram.arrows.map((a) => [a.id, a]));
  const boxById = new Map(diagram.boxes.map((b) => [b.id, b]));
  const geomById = new Map(geom.map((g) => [g.id, g]));
  const kindAt = (end: Endpoint) => (end.t === 'box' ? boxById.get(end.box)?.kind : undefined);
  const { below, above } = drawingOrder(diagram);
  const isContextDiagram = !diagram.parent && diagram.notation === 'idef0';
  const largeHeads = LARGE_HEAD_NOTATIONS.has(diagram.notation);

  const shape = (box: Box) => <BoxShape key={box.id} model={model} diagram={diagram} box={box} interactive={interactive} />;
  const visibleLabels = geom.filter((g) => g.showLabel && g.id !== hiddenLabel);
  const labelColor = (g: ArrowGeom) => arrowById.get(g.id)?.color ?? INK;

  const labelSquiggles = visibleLabels.flatMap((g) => {
    const arrow = arrowById.get(g.id);
    return arrow && (arrow.squiggle ?? g.labelFar) ? [{ g, arrow }] : [];
  });
  const textSquiggles = diagram.boxes.flatMap((b) => {
    const target = b.kind === 'text' && b.squiggleTo ? geomById.get(b.squiggleTo) : undefined;
    return target ? [{ box: b, target }] : [];
  });

  return (
    <g>
      <rect x={0} y={0} width={SHEET_W} height={SHEET_H} fill={PAPER} />
      {showFrame && <Frame model={model} diagram={diagram} />}
      {isContextDiagram && <ContextNotes model={model} />}
      {below.map(shape)}
      <g>
        {geom.map((g) => {
          const arrow: Arrow | undefined = arrowById.get(g.id);
          if (!arrow) return null;
          return <ArrowLine key={g.id} geom={g} arrow={arrow} fromKind={kindAt(arrow.from)} toKind={kindAt(arrow.to)} large={largeHeads} />;
        })}
      </g>
      {above.map(shape)}
      <g>
        {labelSquiggles.map(({ g, arrow }) => (
          <Squiggle key={`q${g.id}`} from={g.labelBox} path={g.points} color={arrow.color ?? INK} />
        ))}
        {textSquiggles.map(({ box, target }) => (
          <Squiggle key={`qt${box.id}`} from={{ x1: box.x, y1: box.y, x2: box.x + box.w, y2: box.y + box.h }} path={target.points} color={INK} />
        ))}
        {visibleLabels.map((g) => (
          <ArrowLabel key={g.id} geom={g} color={labelColor(g)} interactive={interactive} />
        ))}
        {geom.map(
          (g) =>
            g.icom && (
              <text key={`i${g.id}`} x={g.icom.at.x} y={g.icom.at.y} fontSize={10} fontFamily={DIAGRAM_FONT} fill="#4a4f59" textAnchor={g.icom.anchor}>
                {g.icom.text}
              </text>
            ),
        )}
      </g>
    </g>
  );
}
