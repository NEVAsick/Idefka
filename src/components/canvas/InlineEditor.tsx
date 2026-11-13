import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Arrow, Box, Diagram, Model } from '../../model/types';
import type { ArrowGeom } from '../../model/geometry';
import { labelOf, labelOwner } from '../../model/query';
import { isContainer, labelBelow } from '../../model/notation';
import { commit, getState, setState, type Editing } from '../../store';
import { nameRect } from '../sheet/shapes';
import type { View } from './useViewport';

const ARROW_EDITOR_WIDTH = 240;

function boxEditorStyle(box: Box, { x, y, z }: View): CSSProperties {
  const name = nameRect(box);
  if (name) {
    return {
      left: x + name.x * z,
      top: y + name.y * z,
      width: name.w * z,
      height: Math.max(name.h, 22) * z,
      fontSize: name.size * z,
      textAlign: name.align,
      padding: `${3 * z}px ${6 * z}px`,
    };
  }
  if (labelBelow(box.kind)) {
    const width = Math.max(140, box.w + 40);
    return {
      left: x + (box.x + box.w / 2 - width / 2) * z,
      top: y + (box.y + box.h + 3) * z,
      width: width * z,
      height: 40 * z,
      fontSize: 11.5 * z,
      textAlign: 'center',
      padding: `${3 * z}px`,
    };
  }
  if (isContainer(box.kind)) {
    return { left: x + box.x * z, top: y + box.y * z, width: 240 * z, height: 32 * z, fontSize: 12 * z, textAlign: 'left', padding: `${6 * z}px` };
  }
  return { left: x + box.x * z, top: y + box.y * z, width: box.w * z, height: box.h * z, fontSize: 13 * z, textAlign: 'center', padding: `${8 * z}px` };
}

function arrowEditorStyle(g: ArrowGeom | undefined, lineCount: number, { x, y, z }: View): CSSProperties {
  const at = g?.labelAt ?? { x: 0, y: 0 };
  const anchor = g?.labelAnchor ?? 'middle';
  const left = anchor === 'start' ? at.x : anchor === 'end' ? at.x - ARROW_EDITOR_WIDTH : at.x - ARROW_EDITOR_WIDTH / 2;
  return {
    left: x + left * z,
    top: y + (at.y - 14) * z,
    width: ARROW_EDITOR_WIDTH * z,
    height: (8 + lineCount * 14) * z,
    fontSize: 11.5 * z,
    textAlign: anchor === 'start' ? 'left' : anchor === 'end' ? 'right' : 'center',
    padding: `${2 * z}px ${4 * z}px`,
  };
}

const tidy = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();

function rename(box: Box | undefined, arrow: Arrow | undefined, text: string) {
  const diagramId = getState().diagramId;
  commit((draft) => {
    const diagram = draft.diagrams[diagramId];
    if (box) {
      const target = diagram.boxes.find((b) => b.id === box.id);
      if (target) target.name = text;
    } else if (arrow) {
      const target = diagram.arrows.find((a) => a.id === arrow.id);
      if (target) labelOwner(draft, target).label = text;
    }
  });
}

interface InlineEditorProps {
  editing: Editing;
  model: Model;
  diagram: Diagram;
  view: View;
  geomById: Map<string, ArrowGeom>;
}

export function InlineEditor({ editing, model, diagram, view, geomById }: InlineEditorProps) {
  const box = editing.kind === 'box' ? diagram.boxes.find((b) => b.id === editing.id) : undefined;
  const arrow = editing.kind === 'arrow' ? diagram.arrows.find((a) => a.id === editing.id) : undefined;
  const initial = box ? box.name : arrow ? labelOf(model, arrow) : '';
  const [value, setValue] = useState(initial);
  const finished = useRef(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const focus = () => {
      ref.current?.focus();
      ref.current?.select();
    };
    focus();
    const frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!box && !arrow) return null;

  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const text = tidy(value);
    if (save && text !== initial.trim()) rename(box, arrow, text);
    setState({ editing: null });
  };

  const lineCount = Math.max(1, value.split('\n').length);
  const style = box ? boxEditorStyle(box, view) : arrowEditorStyle(geomById.get(arrow!.id), lineCount, view);

  return (
    <textarea
      ref={ref}
      className={'inline-editor no-canvas ' + (box ? 'is-box' : 'is-arrow')}
      style={style}
      value={value}
      placeholder={box ? 'Название' : 'Название стрелки'}
      title="Enter — готово, Shift+Enter — новая строка, Esc — отмена"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') finish(false);
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          finish(true);
        }
      }}
    />
  );
}
