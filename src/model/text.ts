import { DIAGRAM_FONT } from './sheet';

let context: CanvasRenderingContext2D | null = null;
const widths = new Map<string, number>();

export function measure(text: string, size: number, weight = 400): number {
  const key = `${size}|${weight}|${text}`;
  const cached = widths.get(key);
  if (cached !== undefined) return cached;

  context ??= document.createElement('canvas').getContext('2d');
  let width = text.length * size * 0.55;
  if (context) {
    context.font = `${weight} ${size}px ${DIAGRAM_FONT}`;
    width = context.measureText(text).width;
  }

  if (widths.size > 5000) widths.clear();
  widths.set(key, width);
  return width;
}

export function wrap(text: string, maxWidth: number, size: number, weight = 400): string[] {
  const fits = (s: string) => measure(s, size, weight) <= maxWidth;
  const result: string[] = [];

  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      result.push('');
      continue;
    }

    let line = '';
    for (let word of words) {
      while (!fits(word) && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && !fits(word.slice(0, cut) + '-')) cut--;
        if (line) {
          result.push(line);
          line = '';
        }
        result.push(word.slice(0, cut) + '-');
        word = word.slice(cut);
      }

      const candidate = line ? `${line} ${word}` : word;
      if (fits(candidate)) {
        line = candidate;
      } else {
        if (line) result.push(line);
        line = word;
      }
    }
    result.push(line);
  }
  return result;
}
