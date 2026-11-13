export const SHEET_W = 1120;
export const SHEET_H = 792;
export const MARGIN = 10;
export const HEADER_H = 64;
export const FOOTER_H = 42;

export const AREA = {
  x: MARGIN,
  y: HEADER_H,
  w: SHEET_W - MARGIN * 2,
  h: SHEET_H - HEADER_H - FOOTER_H - MARGIN,
};

export const GRID = 8;
export const DIAGRAM_FONT = 'Arial, "Segoe UI", Helvetica, sans-serif';
export const INK = '#1b1d21';
export const PAPER = '#ffffff';
export const DANGLING = '#d1453b';

export const snap = (v: number) => Math.round(v / GRID) * GRID;

// К сетке привязывается центр, а не угол: середины сторон ложатся на сетку, и стрелки между блоками разного размера остаются прямыми.
export const snapBox = (pos: number, size: number) => snap(pos + size / 2) - size / 2;
