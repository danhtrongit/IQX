import type { Canvas, TextStyle } from './canvas.js';
import { measure, nfc } from './fonts.js';

/**
 * Be Vietnam Pro không có các ký tự mũi tên và tam giác (▲ ▼ ↑ ↓). Bản tin vẽ chúng bằng đa giác nên chữ có
 * thể xen "biểu tượng" giữa các đoạn chữ.
 */
export type IconKind = 'up' | 'down' | 'triUp' | 'triDown';
export type Run = string | { icon: IconKind; color?: string };

const iconWidth = (icon: IconKind, size: number): number =>
  icon === 'triUp' || icon === 'triDown' ? size * 0.78 : size * 0.62;

export function runsWidth(runs: readonly Run[], size: number, weight = 400, spacing = 0): number {
  let width = 0;
  for (const run of runs)
    width +=
      typeof run === 'string'
        ? measure(nfc(run), size, weight, spacing)
        : iconWidth(run.icon, size) + size * 0.14;
  return width;
}

function drawIcon(
  c: Canvas,
  icon: IconKind,
  x: number,
  baseline: number,
  size: number,
  color: string,
): void {
  const w = iconWidth(icon, size);
  const h = size * 0.72;
  const top = baseline - h;
  if (icon === 'triUp') {
    c.polygon(
      [
        [x + w / 2, top],
        [x + w, baseline],
        [x, baseline],
      ],
      { fill: color },
    );
  } else if (icon === 'triDown') {
    c.polygon(
      [
        [x, top],
        [x + w, top],
        [x + w / 2, baseline],
      ],
      { fill: color },
    );
  } else {
    const mid = x + w / 2;
    const head = size * 0.3;
    const shaft = Math.max(1, size * 0.1);
    if (icon === 'down') {
      c.polygon(
        [
          [mid - shaft / 2, top],
          [mid + shaft / 2, top],
          [mid + shaft / 2, baseline - head],
          [x + w, baseline - head],
          [mid, baseline],
          [x, baseline - head],
          [mid - shaft / 2, baseline - head],
        ],
        { fill: color },
      );
    } else {
      c.polygon(
        [
          [mid - shaft / 2, baseline],
          [mid + shaft / 2, baseline],
          [mid + shaft / 2, top + head],
          [x + w, top + head],
          [mid, top],
          [x, top + head],
          [mid - shaft / 2, top + head],
        ],
        { fill: color },
      );
    }
  }
}

/** Vẽ một dãy đoạn chữ và biểu tượng trên cùng đường cơ sở `y`, căn theo `style.anchor`. */
export function drawRuns(
  c: Canvas,
  x: number,
  y: number,
  runs: readonly Run[],
  style: TextStyle = {},
): number {
  const size = style.size ?? 10;
  const weight = style.weight ?? 500;
  const spacing = style.spacing ?? 0;
  const color = style.color ?? '#1e3a5f';
  const total = runsWidth(runs, size, weight, spacing);
  let cursor = style.anchor === 'middle' ? x - total / 2 : style.anchor === 'end' ? x - total : x;
  for (const run of runs) {
    if (typeof run === 'string') {
      const text = nfc(run);
      c.text(cursor, y, text, { ...style, anchor: 'start' });
      cursor += measure(text, size, weight, spacing);
    } else {
      drawIcon(c, run.icon, cursor, y, size, run.color ?? color);
      cursor += iconWidth(run.icon, size) + size * 0.14;
    }
  }
  return total;
}
