import type { Box } from './types';

export const ROW = 15;

export interface Section {
  kind: 'attrs' | 'ops' | 'keys' | 'values';
  lines: string[];
}

const DEFAULT_STEREOTYPES: Partial<Record<Box['kind'], string>> = {
  interface: 'interface',
  enumeration: 'enumeration',
  device: 'device',
  artifact: 'artifact',
};

function lines(text?: string): string[] {
  return (text ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
}

export function stereotypeOf(box: Box): string {
  const own = (box.stereotype ?? '')
    .trim()
    .replace(/^«|»$/g, '')
    .replace(/^<<|>>$/g, '')
    .trim();
  return own || DEFAULT_STEREOTYPES[box.kind] || '';
}

export function headHeight(box: Box): number {
  if (box.kind === 'entity') return 28;
  return stereotypeOf(box) ? 40 : 28;
}

export function sections(box: Box): Section[] {
  const attrs = lines(box.attrs);
  const ops = lines(box.ops);

  switch (box.kind) {
    case 'entity':
      return [
        { kind: 'keys', lines: lines(box.keys) },
        { kind: 'attrs', lines: attrs },
      ];
    case 'class':
      return [
        { kind: 'attrs', lines: attrs },
        { kind: 'ops', lines: ops },
      ];
    case 'interface': {
      const result: Section[] = [];
      if (attrs.length) result.push({ kind: 'attrs', lines: attrs });
      result.push({ kind: 'ops', lines: ops });
      return result;
    }
    case 'enumeration': {
      const result: Section[] = [{ kind: 'values', lines: attrs }];
      if (ops.length) result.push({ kind: 'ops', lines: ops });
      return result;
    }
    default:
      return [];
  }
}

export const sectionHeight = (section: Section) => Math.max(1, section.lines.length) * ROW + 8;

export function neededHeight(box: Box): number {
  const height = headHeight(box) + sections(box).reduce((sum, section) => sum + sectionHeight(section), 0);
  return Math.max(48, Math.ceil(height / 16) * 16);
}

export function parseAttr(line: string): { text: string; fk: boolean } {
  const text = line.trim();
  if (/^FK[\s:]/i.test(text)) return { text: text.replace(/^FK[\s:]+/i, ''), fk: true };
  if (/\(FK\)$/i.test(text)) return { text: text.replace(/\s*\(FK\)$/i, ''), fk: true };
  return { text, fk: false };
}
