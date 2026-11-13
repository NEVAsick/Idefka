import type { Diagram, DiagramStatus, Model } from '../../model/types';
import { DIAGRAM_FONT, FOOTER_H, HEADER_H, INK, MARGIN, SHEET_H, SHEET_W } from '../../model/sheet';
import { diagramOrder, diagramTitle, nodeOf } from '../../model/query';
import { DIAGRAM_STATUSES } from '../../model/notation';
import { clip, MUTED } from './text';

const LEFT = MARGIN;
const RIGHT = SHEET_W - MARGIN;
const TOP = MARGIN;
const BOTTOM = SHEET_H - MARGIN;
const HEADER_MIDDLE = (TOP + HEADER_H) / 2;
const FOOTER_TOP = BOTTOM - FOOTER_H;
const COLUMNS = [LEFT, 360, 520, 800, 940, RIGHT];
const FOOTER_NODE = 150;
const FOOTER_NUMBER = 970;

const lineStyle = { stroke: INK, strokeWidth: 1, fill: 'none' } as const;
const captionStyle = { fontSize: 9, fill: MUTED, fontFamily: DIAGRAM_FONT } as const;

const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim();

function formatDate(iso: string) {
  const date = iso ? new Date(iso) : null;
  if (!date || isNaN(+date)) return '';
  return date.toLocaleDateString('ru-RU');
}

function Cell({ column, y, label, value }: { column: number; y: number; label: string; value?: string }) {
  const x = COLUMNS[column];
  const width = COLUMNS[column + 1] - x;
  const text = value ? clip(oneLine(value), width - label.length * 5.4 - 16, 11) : undefined;
  return (
    <g>
      <text x={x + 6} y={y + 17} {...captionStyle}>
        {label}
      </text>
      {text !== undefined && (
        <text x={x + 10 + label.length * 5.2} y={y + 17} fontSize={11} fill={INK} fontFamily={DIAGRAM_FONT}>
          {text}
        </text>
      )}
    </g>
  );
}

function StatusBoxes({ status }: { status: DiagramStatus }) {
  return (
    <>
      {DIAGRAM_STATUSES.map((s, i) => {
        const x = COLUMNS[2] + 8 + (i % 2) * 136;
        const y = TOP + 8 + Math.floor(i / 2) * 25;
        const checked = status === s.value;
        return (
          <g key={s.value}>
            <rect x={x} y={y} width={10} height={10} {...lineStyle} strokeWidth={0.9} />
            {checked && <path d={`M${x + 2} ${y + 5.2} L${x + 4.3} ${y + 7.6} L${x + 8.4} ${y + 2.4}`} stroke={INK} strokeWidth={1.5} fill="none" />}
            <text x={x + 16} y={y + 9} fontSize={10} fill={checked ? INK : MUTED} fontFamily={DIAGRAM_FONT}>
              {s.label}
            </text>
          </g>
        );
      })}
    </>
  );
}

export function Frame({ model, diagram }: { model: Model; diagram: Diagram }) {
  const node = nodeOf(model, diagram.id);
  const page = diagramOrder(model, diagram.notation).indexOf(diagram.id) + 1;
  const context = diagram.parent ? nodeOf(model, diagram.parent.diagram) : 'Верхний уровень';
  const bold = { fontSize: 14, fontWeight: 700, fill: INK, fontFamily: DIAGRAM_FONT, textAnchor: 'middle' } as const;

  return (
    <g>
      <rect x={LEFT} y={TOP} width={RIGHT - LEFT} height={BOTTOM - TOP} {...lineStyle} strokeWidth={1.4} />
      <line x1={LEFT} y1={HEADER_H} x2={RIGHT} y2={HEADER_H} {...lineStyle} strokeWidth={1.4} />
      <line x1={LEFT} y1={FOOTER_TOP} x2={RIGHT} y2={FOOTER_TOP} {...lineStyle} strokeWidth={1.4} />
      {COLUMNS.slice(1, -1).map((x) => (
        <line key={x} x1={x} y1={TOP} x2={x} y2={HEADER_H} {...lineStyle} />
      ))}
      {[0, 1, 3].map((i) => (
        <line key={i} x1={COLUMNS[i]} y1={HEADER_MIDDLE} x2={COLUMNS[i + 1]} y2={HEADER_MIDDLE} {...lineStyle} strokeWidth={0.6} />
      ))}

      <Cell column={0} y={TOP} label="Автор:" value={model.meta.author} />
      <Cell column={0} y={HEADER_MIDDLE} label="Проект:" value={model.meta.name} />
      <Cell column={1} y={TOP} label="Создано:" value={formatDate(model.meta.created)} />
      <Cell column={1} y={HEADER_MIDDLE} label="Изменено:" value={formatDate(model.meta.modified)} />
      <StatusBoxes status={diagram.status} />
      <Cell column={3} y={TOP} label="Читатель:" />
      <Cell column={3} y={HEADER_MIDDLE} label="Дата:" />
      <text x={COLUMNS[4] + 6} y={TOP + 17} {...captionStyle}>
        Контекст:
      </text>
      <text x={(COLUMNS[4] + COLUMNS[5]) / 2} y={TOP + 42} fontSize={13} fill={INK} textAnchor="middle" fontFamily={DIAGRAM_FONT}>
        {context}
      </text>

      <line x1={FOOTER_NODE} y1={FOOTER_TOP} x2={FOOTER_NODE} y2={BOTTOM} {...lineStyle} />
      <line x1={FOOTER_NUMBER} y1={FOOTER_TOP} x2={FOOTER_NUMBER} y2={BOTTOM} {...lineStyle} />
      <text x={LEFT + 6} y={FOOTER_TOP + 13} {...captionStyle}>
        Узел:
      </text>
      <text x={(LEFT + FOOTER_NODE) / 2 + 8} y={FOOTER_TOP + 30} {...bold}>
        {node}
      </text>
      <text x={FOOTER_NODE + 6} y={FOOTER_TOP + 13} {...captionStyle}>
        Название:
      </text>
      <text x={560} y={FOOTER_TOP + 28} {...bold}>
        {clip(oneLine(diagramTitle(model, diagram.id)), 760, 14, 700)}
      </text>
      <text x={FOOTER_NUMBER + 6} y={FOOTER_TOP + 13} {...captionStyle}>
        Номер:
      </text>
      <text x={(FOOTER_NUMBER + RIGHT) / 2 + 8} y={FOOTER_TOP + 30} fontSize={14} fill={INK} textAnchor="middle" fontFamily={DIAGRAM_FONT}>
        {page}
      </text>
    </g>
  );
}
