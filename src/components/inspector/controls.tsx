import type { ReactNode } from 'react';
import type { Arrow, Box } from '../../model/types';
import type { Choice } from '../../model/notation';
import { commit } from '../../store';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: Choice<T>[];
  onChange: (value: T) => void;
  cols?: number;
}

export function Segmented<T extends string>({ value, options, onChange, cols }: SegmentedProps<T>) {
  return (
    <div className="segmented" style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, 1fr)` }}>
      {options.map((option) => (
        <button key={option.value} className={value === option.value ? 'on' : ''} onClick={() => onChange(option.value)} type="button">
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Check({ checked, onChange, title, children }: { checked: boolean; onChange: (on: boolean) => void; title?: string; children: ReactNode }) {
  return (
    <label className="check" title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

export function editBox(diagramId: string, boxId: string, change: (box: Box) => void, coalesceKey?: string) {
  commit((draft) => {
    const box = draft.diagrams[diagramId].boxes.find((b) => b.id === boxId);
    if (box) change(box);
  }, coalesceKey);
}

export function editArrow(diagramId: string, arrowId: string, change: (arrow: Arrow) => void, coalesceKey?: string) {
  commit((draft) => {
    const arrow = draft.diagrams[diagramId].arrows.find((a) => a.id === arrowId);
    if (arrow) change(arrow);
  }, coalesceKey);
}

export function parseNumber(text: string) {
  const value = parseFloat(text.replace(',', '.').replace(/\s/g, ''));
  return isFinite(value) ? value : 0;
}

const COLORS: { color?: string; title: string }[] = [
  { title: 'Чёрный' },
  { color: '#c62f2f', title: 'Красный' },
  { color: '#dd7a12', title: 'Оранжевый' },
  { color: '#1f8a4c', title: 'Зелёный' },
  { color: '#1f63d1', title: 'Синий' },
  { color: '#7a3fc7', title: 'Фиолетовый' },
  { color: '#8a5a2b', title: 'Коричневый' },
  { color: '#6b7280', title: 'Серый' },
];

const DEFAULT_INK = '#1b1d21';

export function ColorPicker({ diagramId, arrowIds, value }: { diagramId: string; arrowIds: string[]; value?: string }) {
  const current = value ?? undefined;
  const paint = (color?: string) =>
    commit((draft) => {
      for (const arrow of draft.diagrams[diagramId].arrows) {
        if (!arrowIds.includes(arrow.id)) continue;
        if (color) arrow.color = color;
        else delete arrow.color;
      }
    });

  return (
    <Field label="Цвет">
      <div className="swatches">
        {COLORS.map((swatch) => (
          <button
            key={swatch.title}
            type="button"
            className={'swatch' + (current === swatch.color ? ' on' : '')}
            style={{ background: swatch.color ?? DEFAULT_INK }}
            title={swatch.title}
            onClick={() => paint(swatch.color)}
          />
        ))}
        <label className="swatch-custom" title="Другой цвет">
          <input type="color" value={value ?? DEFAULT_INK} onChange={(e) => paint(e.target.value)} />
        </label>
      </div>
    </Field>
  );
}
