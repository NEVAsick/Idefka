import type { Box, Diagram, Endpoint, Side } from '../../model/types';
import { borderPoint, type ArrowGeom } from '../../model/geometry';
import { pathD, projectOnPath } from '../../model/path';
import { connectable, isLifeline, lifelineHead } from '../../model/notation';
import type { Selection, Tool } from '../../store';
import type { Gesture } from './gestures';

const SIDE_COLOR: Record<Side, string> = { left: 'var(--icom-i)', top: 'var(--icom-c)', right: 'var(--icom-o)', bottom: 'var(--icom-m)' };
const SIDE_TIP: Record<Side, string> = { left: 'Вход', top: 'Управление', right: 'Выход', bottom: 'Механизм' };
const ARROW_TIP = 'Щелчок — выделить, перетаскивание — сдвинуть отрезок. Alt + перетаскивание — ветвь';
const BRANCH_TIP = 'Потяните, чтобы сделать ветвь от этой стрелки';

const sideColor = (diagram: Diagram, side: Side) => (diagram.notation === 'idef0' ? SIDE_COLOR[side] : 'var(--accent)');

interface OverlayProps {
  diagram: Diagram;
  geom: ArrowGeom[];
  baseGeom: ArrowGeom[];
  geomById: Map<string, ArrowGeom>;
  sel: Selection;
  tool: Tool;
  zoom: number;
  hover: string | null;
  gesture: Gesture | null;
}

export function Overlay({ diagram, geom, baseGeom, geomById, sel, tool, zoom, hover, gesture }: OverlayProps) {
  const selectedBoxes = new Set(sel.boxes);
  const selectedArrows = geom.filter((g) => sel.arrows.includes(g.id));
  const single = sel.boxes.length === 1 && sel.arrows.length === 0 ? diagram.boxes.find((b) => b.id === sel.boxes[0]) : undefined;
  const handleOwners = [single?.id, hover].filter((id, i, all): id is string => !!id && all.lastIndexOf(id) === i);
  const showHandles = (tool === 'select' || tool === 'arrow') && (!gesture || gesture.kind === 'new-arrow');
  const hitWidth = Math.max(10, 12 / zoom);
  const dropTarget = dropTargetOf(gesture, diagram);
  const openable = diagram.boxes.filter((b) => b.child && (b.id === hover || selectedBoxes.has(b.id)));

  return (
    <>
      <g>
        {geom.map((g) => (
          <path
            key={g.id}
            data-k="arrow"
            data-id={g.id}
            d={pathD(g.points)}
            fill="none"
            stroke="transparent"
            strokeWidth={hitWidth}
            style={{ cursor: tool === 'arrow' ? 'crosshair' : sel.arrows.includes(g.id) ? 'move' : 'pointer' }}
          >
            <title>{tool === 'arrow' ? BRANCH_TIP : ARROW_TIP}</title>
          </path>
        ))}
      </g>

      {diagram.boxes
        .filter((b) => selectedBoxes.has(b.id))
        .map((b) => (
          <rect key={'s' + b.id} x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} rx={4} className="sel-outline" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}
      {selectedArrows.map((g) => (
        <path key={'s' + g.id} d={pathD(g.points, g.headless ? 0 : 6)} className="sel-arrow" vectorEffect="non-scaling-stroke" pointerEvents="none" />
      ))}

      {openable.map((b) => (
        <g key={'o' + b.id} data-k="open" data-id={b.id} className="open-btn" transform={`translate(${b.x + b.w - 2} ${b.y + 2}) scale(${1 / zoom})`}>
          <title>Открыть декомпозицию</title>
          <rect x={-24} y={0} width={22} height={22} rx={6} />
          <path d="M-13 6v9m-4-4l4 4 4-4" />
        </g>
      ))}

      {tool === 'select' &&
        selectedArrows.map((g) => (
          <path key={'h' + g.id} data-k="arrow" data-id={g.id} d={pathD(g.points)} fill="none" stroke="transparent" strokeWidth={hitWidth} style={{ cursor: 'move' }} />
        ))}

      {showHandles &&
        handleOwners.map((id) => {
          const box = diagram.boxes.find((b) => b.id === id);
          if (!box || !connectable(box.kind) || isLifeline(box.kind) || box.kind === 'activation') return null;
          return <ConnectionHandles key={id} diagram={diagram} box={box} zoom={zoom} avoid={selectedArrows} />;
        })}

      {single && !gesture && (
        <rect
          data-k="resize"
          data-id={single.id}
          x={single.x + single.w - 4 / zoom}
          y={single.y + single.h - 4 / zoom}
          width={8 / zoom}
          height={8 / zoom}
          className="resize-handle"
          strokeWidth={1.5 / zoom}
        />
      )}

      {sel.arrows.length === 1 && <EndHandles geom={geomById.get(sel.arrows[0])} zoom={zoom} />}

      {dropTarget && <DropHighlight diagram={diagram} end={dropTarget} zoom={zoom} geom={baseGeom} />}

      {gesture?.kind === 'marquee' && (
        <rect
          x={Math.min(gesture.start.x, gesture.current.x)}
          y={Math.min(gesture.start.y, gesture.current.y)}
          width={Math.abs(gesture.current.x - gesture.start.x)}
          height={Math.abs(gesture.current.y - gesture.start.y)}
          className="marquee"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </>
  );
}

function dropTargetOf(gesture: Gesture | null, diagram: Diagram): Endpoint | null {
  if (gesture?.kind === 'new-arrow' && gesture.moved) return gesture.arrow[gesture.role];
  if (gesture?.kind === 'reconnect') {
    const arrow = diagram.arrows.find((a) => a.id === gesture.arrowId);
    if (arrow) return arrow[gesture.end];
  }
  return null;
}

function handlePositions(box: Box, zoom: number, avoid: ArrowGeom[]): [Side, number, number][] {
  const offset = 11 / zoom;
  const positions: [Side, number, number][] = [
    ['left', box.x - offset, box.y + box.h / 2],
    ['top', box.x + box.w / 2, box.y - offset],
    ['right', box.x + box.w + offset, box.y + box.h / 2],
    ['bottom', box.x + box.w / 2, box.y + box.h + offset],
  ];

  const coversArrow = (x: number, y: number) => avoid.some((g) => projectOnPath(g.points, { x, y }).distance < 8 / zoom);
  for (const position of positions) {
    const vertical = position[0] === 'left' || position[0] === 'right';
    for (let attempt = 0; attempt < 3 && coversArrow(position[1], position[2]); attempt++) {
      if (vertical) position[2] += 16 / zoom;
      else position[1] += 16 / zoom;
    }
  }
  return positions;
}

function ConnectionHandles({ diagram, box, zoom, avoid }: { diagram: Diagram; box: Box; zoom: number; avoid: ArrowGeom[] }) {
  const idef0 = diagram.notation === 'idef0';
  return (
    <>
      {handlePositions(box, zoom, avoid).map(([side, x, y]) => (
        <circle
          key={box.id + side}
          data-k="handle"
          data-id={box.id}
          data-side={side}
          cx={x}
          cy={y}
          r={5 / zoom}
          className="icom-handle"
          style={{ fill: sideColor(diagram, side) }}
          strokeWidth={2 / zoom}
        >
          <title>{idef0 ? `${SIDE_TIP[side]} — потяните, чтобы провести стрелку` : 'Потяните, чтобы провести стрелку'}</title>
        </circle>
      ))}
    </>
  );
}

function EndHandles({ geom: g, zoom }: { geom?: ArrowGeom; zoom: number }) {
  if (!g) return null;
  const first = g.points[0];
  const last = g.points[g.points.length - 1];
  return (
    <g>
      <circle data-k="end" data-id={g.id} data-end="from" cx={first.x} cy={first.y} r={5 / zoom} className="end-handle" strokeWidth={2 / zoom} />
      <circle data-k="end" data-id={g.id} data-end="to" cx={last.x} cy={last.y} r={5 / zoom} className="end-handle" strokeWidth={2 / zoom} />
    </g>
  );
}

function boxEdge(box: Box, side: Side): [number, number, number, number] {
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  switch (side) {
    case 'left':
      return [box.x, box.y, box.x, bottom];
    case 'right':
      return [right, box.y, right, bottom];
    case 'top':
      return [box.x, box.y, right, box.y];
    case 'bottom':
      return [box.x, bottom, right, bottom];
  }
}

function DropHighlight({ diagram, end, zoom, geom }: { diagram: Diagram; end: Endpoint; zoom: number; geom: ArrowGeom[] }) {
  const common = { strokeWidth: 5 / zoom, strokeLinecap: 'round' as const, opacity: 0.85, pointerEvents: 'none' as const };

  if (end.t === 'box') {
    const box = diagram.boxes.find((b) => b.id === end.box);
    if (!box) return null;
    if (isLifeline(box.kind)) {
      const cx = box.x + box.w / 2;
      return <line x1={cx} y1={box.y + lifelineHead(box.kind)} x2={cx} y2={box.y + box.h} stroke="var(--accent)" {...common} strokeWidth={4 / zoom} opacity={0.5} />;
    }
    const [x1, y1, x2, y2] = boxEdge(box, end.side);
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={sideColor(diagram, end.side)} {...common} />;
  }

  if (end.t === 'border') {
    const p = borderPoint(end.side, end.at);
    const horizontal = end.side === 'top' || end.side === 'bottom';
    const half = 26;
    return (
      <line
        x1={horizontal ? p.x - half : p.x}
        y1={horizontal ? p.y : p.y - half}
        x2={horizontal ? p.x + half : p.x}
        y2={horizontal ? p.y : p.y + half}
        stroke={sideColor(diagram, end.side)}
        {...common}
      />
    );
  }

  if (end.t === 'tap') {
    const target = geom.find((g) => g.id === end.arrow);
    return (
      <g pointerEvents="none">
        {target && <path d={pathD(target.points)} fill="none" stroke="var(--accent)" strokeWidth={4 / zoom} opacity={0.35} />}
        <circle cx={end.x} cy={end.y} r={6 / zoom} fill="var(--accent)" stroke="#fff" strokeWidth={2 / zoom} />
      </g>
    );
  }

  return null;
}
