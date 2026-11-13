import type { ReactNode } from 'react';
import type { Box, Diagram, Model, NodeKind } from '../../../model/types';
import { INK } from '../../../model/sheet';

export interface ShapeContext {
  model: Model;
  diagram: Diagram;
}

export type Shape = (box: Box, context: ShapeContext) => ReactNode;
export type ShapeSet = Partial<Record<NodeKind, Shape>>;

export const outline = { stroke: INK, strokeWidth: 1.4 } as const;

export const centerOf = (box: Box) => ({ cx: box.x + box.w / 2, cy: box.y + box.h / 2 });

export const diamondPoints = ({ x, y, w, h }: Box) => {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`;
};
