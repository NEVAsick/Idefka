import type { Box } from '../../model/types';
import { DIAGRAM_FONT, INK, PAPER } from '../../model/sheet';
import { labelBelow } from '../../model/notation';
import { measure, wrap } from '../../model/text';

export const MUTED = '#6a7180';
export const SMALL_TEXT = { fontSize: 10, fontFamily: DIAGRAM_FONT, fill: '#4a4f59' } as const;

export function clip(text: string, maxWidth: number, size: number, weight = 400): string {
  if (measure(text, size, weight) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && measure(cut + '…', size, weight) > maxWidth) cut = cut.slice(0, -1);
  return cut + '…';
}

export const firstLine = (text: string) => text.split('\n')[0];

interface LinesProps {
  lines: string[];
  x: number;
  centerY: number;
  size: number;
  lineHeight: number;
  weight?: number;
  italic?: boolean;
  muted: boolean;
}

function CenteredLines({ lines, x, centerY, size, lineHeight, weight, italic, muted }: LinesProps) {
  const top = centerY - (lines.length * lineHeight) / 2 + lineHeight * 0.74;
  return (
    <text fontSize={size} fontWeight={weight} fontStyle={italic ? 'italic' : undefined} fontFamily={DIAGRAM_FONT} fill={muted ? MUTED : INK} textAnchor="middle">
      {lines.map((line, i) => (
        <tspan key={i} x={x} y={top + i * lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function BoxText({ box, top = 0, bottom = 0, size }: { box: Box; top?: number; bottom?: number; size?: number }) {
  const actualSize = box.fontSize ?? size ?? 13;
  const lineHeight = actualSize * 1.23;
  const placeholder = box.kind === 'junction' || labelBelow(box.kind) ? '' : 'Без названия';
  const maxLines = Math.max(1, Math.floor((box.h - top - bottom - 10) / lineHeight));
  const lines = wrap(box.name || placeholder, box.w - 16, actualSize).slice(0, maxLines);
  const centerY = box.y + top + (box.h - top - bottom) / 2;
  return <CenteredLines lines={lines} x={box.x + box.w / 2} centerY={centerY} size={actualSize} lineHeight={lineHeight} muted={!box.name} />;
}

interface ShapeLabelProps {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  size?: number;
  weight?: number;
  placeholder?: string;
}

export function ShapeLabel({ x, y, w, h, text, size = 12.5, weight = 400, placeholder = '' }: ShapeLabelProps) {
  const lineHeight = size * 1.23;
  const maxLines = Math.max(1, Math.floor((h - 4) / lineHeight));
  const lines = wrap(text || placeholder, Math.max(10, w - 12), size, weight).slice(0, maxLines);
  return <CenteredLines lines={lines} x={x + w / 2} centerY={y + h / 2} size={size} lineHeight={lineHeight} weight={weight} muted={!text} />;
}

export function BelowLabel({ box }: { box: Box }) {
  if (!box.name.trim()) return null;
  const lines = wrap(box.name, Math.max(120, box.w + 40), 11.5).slice(0, 3);
  return (
    <text fontSize={11.5} fontFamily={DIAGRAM_FONT} fill={INK} textAnchor="middle" stroke={PAPER} strokeWidth={3} paintOrder="stroke">
      {lines.map((line, i) => (
        <tspan key={i} x={box.x + box.w / 2} y={box.y + box.h + 14 + i * 14}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function LeftText({ x, y, lines, color = INK }: { x: number; y: number; lines: string[]; color?: string }) {
  return (
    <text fontSize={11.5} fontFamily={DIAGRAM_FONT} fill={color}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} y={y + i * 14}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
