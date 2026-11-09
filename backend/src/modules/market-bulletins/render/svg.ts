import type { PageDoc, Prim } from './canvas.js';
import { FONT_FACES, SVG_FONT_FAMILY, faceOf, type FontFace } from './fonts.js';

const WEIGHT_OF_FACE: Readonly<Record<FontFace, number>> = {
  regular: 400,
  semibold: 600,
  bold: 700,
  extrabold: 800,
};
void FONT_FACES;

const num = (value: number): string => String(Math.round(value * 100) / 100);

export function escapeXml(text: string): string {
  return text.replace(/[&<>"]/g, (char) =>
    char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : '&quot;',
  );
}

function shapeAttrs(style: {
  fill?: string;
  stroke?: string;
  sw?: number;
  op?: number;
  dash?: string;
}): string {
  let out = ` fill="${style.fill ?? 'none'}"`;
  if (style.stroke) {
    out += ` stroke="${style.stroke}" stroke-width="${num(style.sw ?? 1)}" stroke-linejoin="round" stroke-linecap="round"`;
    if (style.dash) out += ` stroke-dasharray="${style.dash}"`;
  }
  if (style.op !== undefined && style.op < 1) out += ` opacity="${style.op}"`;
  return out;
}

function primToSvg(prim: Prim): string {
  switch (prim.k) {
    case 'rect':
      return `<rect x="${num(prim.x)}" y="${num(prim.y)}" width="${num(prim.w)}" height="${num(prim.h)}"${
        prim.rx ? ` rx="${num(prim.rx)}"` : ''
      }${shapeAttrs(prim)}/>`;
    case 'line':
      return `<line x1="${num(prim.x1)}" y1="${num(prim.y1)}" x2="${num(prim.x2)}" y2="${num(prim.y2)}" stroke="${
        prim.stroke
      }" stroke-width="${num(prim.sw)}"${prim.dash ? ` stroke-dasharray="${prim.dash}"` : ''}${
        prim.op !== undefined ? ` opacity="${prim.op}"` : ''
      }/>`;
    case 'poly': {
      const points = prim.pts.map(([x, y]) => `${num(x)} ${num(y)}`);
      const d = `M${points.join('L')}${prim.closed ? 'Z' : ''}`;
      return `<path d="${d}"${shapeAttrs(prim)}/>`;
    }
    case 'circle':
      return `<circle cx="${num(prim.cx)}" cy="${num(prim.cy)}" r="${num(prim.r)}"${shapeAttrs(prim)}/>`;
    case 'text': {
      const weight = WEIGHT_OF_FACE[faceOf(prim.weight)];
      const anchor = prim.anchor === 'start' ? '' : ` text-anchor="${prim.anchor}"`;
      const spacing = prim.spacing ? ` letter-spacing="${num(prim.spacing)}"` : '';
      const halo = prim.halo
        ? ` stroke="${prim.halo.color}" stroke-width="${num(prim.halo.width)}" stroke-linejoin="round" paint-order="stroke"`
        : '';
      return `<text x="${num(prim.x)}" y="${num(prim.y)}" font-size="${num(prim.size)}" font-weight="${weight}" fill="${
        prim.color
      }"${anchor}${spacing}${halo}>${escapeXml(prim.text)}</text>`;
    }
    case 'link':
      return `<a href="${escapeXml(prim.url)}" target="_blank" rel="noopener noreferrer"><rect x="${num(prim.x)}" y="${num(
        prim.y,
      )}" width="${num(prim.w)}" height="${num(prim.h)}" fill="transparent"/></a>`;
  }
}

/** Một trang → chuỗi SVG tự chứa (nền trắng, font Be Vietnam Pro theo tên họ font của trang web). */
export function pageToSvg(page: PageDoc): string {
  const body = page.prims.map(primToSvg).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.width} ${page.height}" width="${page.width}" height="${page.height}" ` +
    `font-family="${escapeXml(SVG_FONT_FAMILY)}" role="img">` +
    `<rect width="${page.width}" height="${page.height}" fill="#ffffff"/>${body}</svg>`
  );
}
